import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  fyStartFor, fyMonths, fyLabel, shortMonth, addMonths,
  computeProductRow, deriveConsumption,
  type Channel, type ProductRow,
} from '@/lib/budget-vs-actual'
import { ProductsTab } from '@/components/budget-vs-actual/products-tab'
import { IngredientsTab } from '@/components/budget-vs-actual/ingredients-tab'
import { PackagingTab } from '@/components/budget-vs-actual/packaging-tab'
import { UploadActualsButton } from '@/components/budget-vs-actual/upload-actuals-button'
import { LockMonthButton } from '@/components/budget-vs-actual/lock-month-button'
import { MonthSelector } from '@/components/budget-vs-actual/month-selector'

export const metadata: Metadata = { title: 'Budget vs Actual' }

interface PageProps {
  searchParams: { fy?: string; month?: string; tab?: string }
}

export default async function BudgetVsActualPage({ searchParams }: PageProps) {
  const supabase = createClient()

  // Default FY = current FY; default month = most recently completed month within FY (or FY start)
  const today = new Date()
  const defaultFyStart = fyStartFor(today)
  const fyStart  = searchParams.fy    ?? defaultFyStart
  const tab      = (searchParams.tab as 'products' | 'ingredients' | 'packaging' | undefined) ?? 'products'
  const months   = fyMonths(fyStart)
  const defaultMonth = pickDefaultMonth(today, months)
  const month    = searchParams.month ?? defaultMonth

  const monthIdx = months.indexOf(month)
  const prevMonth = monthIdx > 0 ? months[monthIdx - 1] : null

  // ── Fetch everything in parallel ───────────────────────────
  const [
    { data: products },
    { data: ingredients },
    { data: packaging },
    { data: bomItems },
    { data: productPackaging },
    { data: budgetSnap },
    { data: productActuals },
    { data: stockCountsThis },
    { data: stockCountsPrev },
    { data: consumptionOverrides },
    { data: monthLock },
    { data: profile },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, sku_code, name, current_soh, product_type')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sku_code') as { data: Array<{ id: string; sku_code: string; name: string; current_soh: number | null; product_type: string | null }> | null },
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure, current_soh, opening_stock_override, original_order_qty')
      .eq('is_active', true)
      .order('name') as { data: Array<{ id: string; sku_code: string; name: string; unit_of_measure: string | null; current_soh: number | null; opening_stock_override: number | null; original_order_qty: number | null }> | null },
    supabase.from('packaging')
      .select('id, sku_code, name, type, unit_of_measure, current_soh, opening_stock_override, original_order_qty')
      .eq('is_active', true)
      .order('name') as { data: Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string | null; current_soh: number | null; opening_stock_override: number | null; original_order_qty: number | null }> | null },
    supabase.from('bom_items')
      .select('bom_id, ingredient_id, quantity_g, boms!inner(product_id, is_active)')
      .eq('boms.is_active', true) as unknown as { data: Array<{ bom_id: string; ingredient_id: string; quantity_g: number; boms: { product_id: string; is_active: boolean } }> | null },
    supabase.from('product_packaging')
      .select('product_id, packaging_id, quantity_per_unit, include_in_cost') as { data: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number; include_in_cost: boolean }> | null },
    supabase.from('bva_budget_snapshots')
      .select('product_id, channel, units')
      .eq('year_month', month) as { data: Array<{ product_id: string; channel: Channel; units: number }> | null },
    supabase.from('product_actuals')
      .select('product_id, channel, units')
      .eq('year_month', month) as { data: Array<{ product_id: string; channel: Channel; units: number }> | null },
    supabase.from('monthly_stock_counts')
      .select('entity_type, entity_id, opening_soh, counted_eom')
      .eq('year_month', month) as { data: Array<{ entity_type: string; entity_id: string; opening_soh: number | null; counted_eom: number | null }> | null },
    prevMonth
      ? supabase.from('monthly_stock_counts')
          .select('entity_type, entity_id, counted_eom')
          .eq('year_month', prevMonth) as { data: Array<{ entity_type: string; entity_id: string; counted_eom: number | null }> | null }
      : Promise.resolve({ data: [] }),
    supabase.from('monthly_consumption_overrides')
      .select('entity_type, entity_id, override_units, comment')
      .eq('year_month', month) as { data: Array<{ entity_type: string; entity_id: string; override_units: number; comment: string | null }> | null },
    supabase.from('month_locks').select('year_month, locked_at, notes').eq('year_month', month).maybeSingle() as { data: { year_month: string; locked_at: string; notes: string | null } | null },
    supabase.from('user_profiles').select('roles(name)').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle() as { data: { roles: { name: string } | null } | null },
  ])

  // Live inventory balances (matches what the Packaging list / Ingredients list show as SOH).
  // Only used as a fallback for the FY-start month opening when no explicit count is set.
  const [{ data: pakBalances }, { data: ingBalances }] = await Promise.all([
    supabase.from('inventory_balances').select('packaging_id, quantity_on_hand').not('packaging_id', 'is', null) as { data: Array<{ packaging_id: string; quantity_on_hand: number }> | null },
    supabase.from('inventory_balances').select('ingredient_id, quantity_on_hand').not('ingredient_id', 'is', null) as { data: Array<{ ingredient_id: string; quantity_on_hand: number }> | null },
  ])
  const pakBalanceById = new Map<string, number>()
  for (const b of pakBalances ?? []) pakBalanceById.set(b.packaging_id, Number(b.quantity_on_hand))
  const ingBalanceById = new Map<string, number>()
  for (const b of ingBalances ?? []) ingBalanceById.set(b.ingredient_id, Number(b.quantity_on_hand))

  const isAdmin    = profile?.roles?.name === 'admin'
  const isLocked   = !!monthLock
  const isFyStart  = month === months[0]

  // ── Build product opening map: this month's opening_soh, else current_soh, else prev month's effective EOM ──
  const stockThisByEntity = new Map<string, { opening: number | null; counted: number | null }>()
  for (const s of stockCountsThis ?? []) {
    if (s.entity_type === 'product') stockThisByEntity.set(s.entity_id, { opening: s.opening_soh, counted: s.counted_eom })
  }
  const stockPrevByEntity = new Map<string, number | null>()
  for (const s of stockCountsPrev ?? []) {
    if (s.entity_type === 'product') stockPrevByEntity.set(s.entity_id, s.counted_eom)
  }

  function openingForProduct(productId: string, currentSoh: number | null): number | null {
    const thisMonth = stockThisByEntity.get(productId)
    if (thisMonth?.opening != null) return thisMonth.opening
    // Prev month's counted EOM (auto-roll). If no counted, fall back to prev calc EOM (more complex — for now prev counted only).
    if (prevMonth) {
      const prev = stockPrevByEntity.get(productId)
      if (prev != null) return prev
    }
    // Otherwise use current_soh (the "live" SOH on the product)
    return currentSoh
  }

  // ── Channels per product ──
  const channelsByProduct = new Map<string, Partial<Record<Channel, number>>>()
  for (const a of productActuals ?? []) {
    if (!channelsByProduct.has(a.product_id)) channelsByProduct.set(a.product_id, {})
    channelsByProduct.get(a.product_id)![a.channel] = Number(a.units)
  }

  // ── Budget per product per channel ──
  const budgetByProduct = new Map<string, Partial<Record<Channel, number>>>()
  for (const b of budgetSnap ?? []) {
    if (!budgetByProduct.has(b.product_id)) budgetByProduct.set(b.product_id, {})
    budgetByProduct.get(b.product_id)![b.channel] = Number(b.units)
  }

  // ── Build product rows ──
  const productRows: ProductRow[] = (products ?? []).map((p) => computeProductRow({
    product:           { id: p.id, sku_code: p.sku_code, name: p.name },
    opening:           openingForProduct(p.id, p.current_soh),
    budget_by_channel: budgetByProduct.get(p.id) ?? {},
    channels:          channelsByProduct.get(p.id) ?? {},
    receipts:          0,   // TODO Phase 2: fold in PO receipts via stock_movements
    counted_eom:       stockThisByEntity.get(p.id)?.counted ?? null,
  }))

  // Map: product_id → total_out (used to derive ingredient/packaging consumption)
  const productTotals: Record<string, number> = {}
  for (const r of productRows) productTotals[r.product_id] = r.total_out

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Budget vs Actual</h1>
          <p className="text-sm text-gray-500 mt-1">
            {fyLabel(fyStart)} ({shortMonth(months[0])} → {shortMonth(months[11])}) · Reviewing <span className="font-semibold text-gray-800">{shortMonth(month)}</span>
            {isLocked && <span className="ml-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-gray-900 text-white rounded">🔒 Locked</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <MonthSelector fyStart={fyStart} month={month} months={months} tab={tab} />
          {!isLocked && <UploadActualsButton year_month={month} isFyStart={isFyStart} />}
          <LockMonthButton year_month={month} isLocked={isLocked} isAdmin={isAdmin} />
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-gray-200 -mb-px">
        <TabLink href={`/reporting/budget-vs-actual?fy=${fyStart}&month=${month}&tab=products`}    label="Products"    count={productRows.length} active={tab === 'products'} />
        <TabLink href={`/reporting/budget-vs-actual?fy=${fyStart}&month=${month}&tab=ingredients`} label="Ingredients" count={(ingredients ?? []).length} active={tab === 'ingredients'} />
        <TabLink href={`/reporting/budget-vs-actual?fy=${fyStart}&month=${month}&tab=packaging`}   label="Packaging"   count={(packaging ?? []).length} active={tab === 'packaging'} />
      </div>

      {isFyStart && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
          <strong>FY-start month.</strong> The Opening column from your upload will be saved as each item&rsquo;s baseline. After this month, opening auto-rolls from the previous month&rsquo;s closing (counted EOM if entered, else system-calculated).
        </div>
      )}

      {tab === 'products' && (
        <ProductsTab
          rows={productRows}
          year_month={month}
          isLocked={isLocked}
        />
      )}

      {tab === 'ingredients' && (() => {
        const bomLinks = (bomItems ?? []).map((b) => ({
          product_id: b.boms.product_id,
          entity_id: b.ingredient_id,
          // quantity_g per pack → kg per pack
          qty_per_product_unit: Number(b.quantity_g) / 1000,
        }))
        const derivedById = deriveConsumption(productTotals, bomLinks)
        const overrideById = new Map((consumptionOverrides ?? []).filter((o) => o.entity_type === 'ingredient').map((o) => [o.entity_id, { units: Number(o.override_units), comment: o.comment }]))
        const stockByIngredient = new Map<string, { opening: number | null; counted: number | null }>()
        for (const s of stockCountsThis ?? []) {
          if (s.entity_type === 'ingredient') stockByIngredient.set(s.entity_id, { opening: s.opening_soh, counted: s.counted_eom })
        }
        const stockPrevByIngredient = new Map<string, number | null>()
        for (const s of stockCountsPrev ?? []) {
          if (s.entity_type === 'ingredient') stockPrevByIngredient.set(s.entity_id, s.counted_eom)
        }
        return (
          <IngredientsTab
            rows={(ingredients ?? []).map((i) => {
              const derived = derivedById[i.id] ?? 0
              const override = overrideById.get(i.id)
              const effective = override?.units ?? derived
              const this_ = stockByIngredient.get(i.id)
              const prev = stockPrevByIngredient.get(i.id)
              // FY-start (April): use the launch baseline (original_order_qty)
              // Other months: roll from prev counted EOM, else fall back to live SOH
              const fallback = isFyStart
                ? (i.original_order_qty ?? i.opening_stock_override ?? i.current_soh)
                : (ingBalanceById.get(i.id) ?? i.current_soh ?? i.opening_stock_override)
              const opening = this_?.opening ?? prev ?? fallback
              const calc_eom = opening != null ? opening - effective : null
              const counted = this_?.counted ?? null
              return {
                id: i.id, sku: i.sku_code, name: i.name, uom: i.unit_of_measure,
                opening, derived, override: override?.units ?? null, override_comment: override?.comment ?? null,
                effective, calc_eom, counted_eom: counted,
                stock_variance: counted != null && calc_eom != null ? counted - calc_eom : null,
              }
            })}
            year_month={month}
            isLocked={isLocked}
          />
        )
      })()}

      {tab === 'packaging' && (() => {
        // SRT packaging types are retail-only (wholesale shipper trays — never used
        // for D2C orders or samples). All other packaging types use total_out.
        const SRT_TYPES = new Set(['SRT'])
        const srtPackagingIds = new Set((packaging ?? []).filter((p) => SRT_TYPES.has(p.type)).map((p) => p.id))

        // Per-product totals (already in productTotals) and per-product RETAIL only
        const productRetail: Record<string, number> = {}
        for (const p of products ?? []) {
          const ch = channelsByProduct.get(p.id) ?? {}
          productRetail[p.id] = (Number(ch.nz_retail) || 0) + (Number(ch.au_retail) || 0)
        }

        const links = (productPackaging ?? []).map((pp) => ({
          product_id: pp.product_id,
          entity_id: pp.packaging_id,
          qty_per_product_unit: Number(pp.quantity_per_unit),
        }))
        const srtLinks    = links.filter((l) => srtPackagingIds.has(l.entity_id))
        const otherLinks  = links.filter((l) => !srtPackagingIds.has(l.entity_id))
        const derivedSrt  = deriveConsumption(productRetail, srtLinks)
        const derivedOther = deriveConsumption(productTotals, otherLinks)
        const derivedById: Record<string, number> = { ...derivedOther, ...derivedSrt }

        const overrideById = new Map((consumptionOverrides ?? []).filter((o) => o.entity_type === 'packaging').map((o) => [o.entity_id, { units: Number(o.override_units), comment: o.comment }]))
        const stockByPak = new Map<string, { opening: number | null; counted: number | null }>()
        for (const s of stockCountsThis ?? []) {
          if (s.entity_type === 'packaging') stockByPak.set(s.entity_id, { opening: s.opening_soh, counted: s.counted_eom })
        }
        const stockPrevByPak = new Map<string, number | null>()
        for (const s of stockCountsPrev ?? []) {
          if (s.entity_type === 'packaging') stockPrevByPak.set(s.entity_id, s.counted_eom)
        }
        return (
          <PackagingTab
            rows={(packaging ?? []).map((p) => {
              const derived = derivedById[p.id] ?? 0
              const override = overrideById.get(p.id)
              const effective = override?.units ?? derived
              const this_ = stockByPak.get(p.id)
              const prev = stockPrevByPak.get(p.id)
              // FY-start (April): use the launch baseline (original_order_qty)
              // Other months: roll from prev counted EOM, else fall back to live SOH
              const fallback = isFyStart
                ? (p.original_order_qty ?? p.opening_stock_override ?? p.current_soh)
                : (pakBalanceById.get(p.id) ?? p.current_soh ?? p.opening_stock_override)
              const opening = this_?.opening ?? prev ?? fallback
              const calc_eom = opening != null ? opening - effective : null
              const counted = this_?.counted ?? null
              const isSrt = SRT_TYPES.has(p.type)
              return {
                id: p.id, sku: p.sku_code, name: p.name, type: p.type, uom: p.unit_of_measure,
                opening, derived, override: override?.units ?? null, override_comment: override?.comment ?? null,
                effective, calc_eom, counted_eom: counted,
                stock_variance: counted != null && calc_eom != null ? counted - calc_eom : null,
                derivation_basis: isSrt ? 'retail-only' : 'total',
              }
            })}
            year_month={month}
            isLocked={isLocked}
          />
        )
      })()}
    </div>
  )
}

function pickDefaultMonth(today: Date, months: string[]): string {
  const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`
  // Most recently completed month in this FY = today's month - 1 (clamp to FY start)
  const idx = months.indexOf(todayKey)
  if (idx <= 0) return months[0]
  return months[idx - 1]
}

function TabLink({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link href={href}
      className={`px-4 py-2 text-sm font-medium border-b-2 ${active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
      {label} <span className="ml-1 text-[10px] text-gray-500">{count}</span>
    </Link>
  )
}

// Suppress unused-warning for addMonths (used by future receipts logic)
void addMonths
