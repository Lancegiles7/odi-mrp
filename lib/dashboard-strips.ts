/**
 * Dashboard shortfall strips + GP overview.
 *
 * Loads the same data the Production / Ingredient-demand / Packaging-demand
 * pages use and reduces each to per-month { total, short } counts for the
 * dashboard's MonthlyShortfallStrip. Plus a per-product-group GP roll-up.
 *
 * Strips are built on the PRODUCTION PLAN (the demand pages' default basis).
 */
import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  indexDemand, indexProduction, getGrandTotal, getProductionCell,
  resolveOpeningStock, calcRollingBalance,
} from '@/lib/demand'
import {
  aggregateIngredientDemand, monthShortfallStates as ingStates, convertGramsToIngredientUom,
} from '@/lib/ingredient-demand'
import { aggregatePackagingDemand, monthShortfallStates as pkgStates } from '@/lib/packaging-demand'
import { calcProductCostSummary } from '@/lib/costing'
import { PRODUCT_GROUPS } from '@/lib/constants'
import type { SettingsSnapshot } from '@/lib/settings'
import type { BomItemWithIngredient } from '@/lib/types/database.types'

type SB = ReturnType<typeof createClient>
type Anyish = unknown
const all = <T,>(p: Anyish) => p as unknown as Promise<{ data: T | null }>

export interface StripData {
  totals: Map<string, number>
  shorts: Map<string, number>
}

function emptyCounts(months: string[]) {
  return {
    totals: new Map<string, number>(months.map((m) => [m, 0])),
    shorts: new Map<string, number>(months.map((m) => [m, 0])),
  }
}

// ── Production: finished-product demand vs production plan ─────
export async function loadProductionStrip(sb: SB, months: string[], first: string, last: string): Promise<StripData> {
  const [{ data: products }, demand, { data: production }] = await Promise.all([
    all<Array<{ id: string; opening_stock_override: number | null }>>(
      sb.from('products').select('id, opening_stock_override').is('deleted_at', null).eq('is_active', true)),
    fetchAllRows<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }>((f, t) =>
      sb.from('demand_forecasts').select('product_id, year_month, channel, units, is_edited')
        .gte('year_month', first).lte('year_month', last)
        .order('product_id').order('year_month').order('channel').range(f, t) as unknown as PromiseLike<{ data: Array<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }> | null; error: { message: string } | null }>),
    all<Array<{ product_id: string; year_month: string; units_planned: number }>>(
      sb.from('production_plans').select('product_id, year_month, units_planned').gte('year_month', first).lte('year_month', last)),
  ])
  const demandIdx = indexDemand((demand ?? []) as never[])
  // Total finished output = every maker's plan summed (a dual product's NZ + AU
  // plans both produce the same SKU), so sum across markets rather than index.
  const prodSummed = new Map<string, number>()
  for (const r of production ?? []) {
    const ym = typeof r.year_month === 'string' ? r.year_month.slice(0, 10) : r.year_month
    const key = `${r.product_id}|${ym}`
    prodSummed.set(key, (prodSummed.get(key) ?? 0) + Number(r.units_planned || 0))
  }
  const { totals, shorts } = emptyCounts(months)
  for (const p of products ?? []) {
    const opening = resolveOpeningStock(p.opening_stock_override, undefined)
    const rolling = calcRollingBalance(months, opening, (m) => getGrandTotal(demandIdx, p.id, m), (m) => prodSummed.get(`${p.id}|${m}`) ?? 0)
    for (const r of rolling) {
      if (r.forecast > 0)    totals.set(r.month, (totals.get(r.month) ?? 0) + 1)
      if (r.state === 'red') shorts.set(r.month, (shorts.get(r.month) ?? 0) + 1)
    }
  }
  return { totals, shorts }
}

// Shared: month → product → production-plan units. Dashboard rollups use the
// NZ build, so only NZ-market plans count (avoids the AU row winning last-write).
async function productionUnitsByMonth(sb: SB, productIds: string[], months: string[], first: string, last: string) {
  const { data: production } = await all<Array<{ product_id: string; year_month: string; units_planned: number; market: string | null }>>(
    sb.from('production_plans').select('product_id, year_month, units_planned, market').gte('year_month', first).lte('year_month', last))
  const prodIdx = indexProduction((production ?? []).filter((r) => (r.market ?? 'NZ') !== 'AU') as never[])
  const map = new Map<string, Map<string, number>>()
  for (const m of months) {
    const inner = new Map<string, number>()
    for (const pid of productIds) {
      const u = getProductionCell(prodIdx, pid, m)
      if (u) inner.set(pid, u)
    }
    map.set(m, inner)
  }
  return map
}

// ── Ingredient demand (excludes "supplier not set") ───────────
export async function loadIngredientStrip(sb: SB, months: string[], first: string, last: string): Promise<StripData> {
  const [{ data: products }, { data: ingredients }, { data: suppliers }, { data: boms }, { data: bomItems }, { data: openPos }, { data: openPoLines }] = await Promise.all([
    all<Array<{ id: string; sku_code: string; name: string; size_g: number | null; wet_weight_g: number | null }>>(
      sb.from('products').select('id, sku_code, name, size_g, wet_weight_g, wastage_pct').is('deleted_at', null)),
    all<Array<{ id: string; sku_code: string; name: string; unit_of_measure: string | null; supplier_id: string | null; opening_stock_override: number | null; is_active: boolean }>>(
      sb.from('ingredients').select('id, sku_code, name, unit_of_measure, supplier_id, opening_stock_override, is_active').eq('is_active', true)),
    all<Array<{ id: string; name: string }>>(sb.from('suppliers').select('id, name')),
    all<Array<{ id: string; product_id: string; is_active: boolean; market: string | null }>>(sb.from('boms').select('id, product_id, is_active, market').eq('is_active', true)),
    all<Array<{ bom_id: string; ingredient_id: string; quantity_g: number; wet_quantity_g: number | null }>>(
      sb.from('bom_items').select('bom_id, ingredient_id, quantity_g, wet_quantity_g')),
    all<Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null }>>(
      sb.from('purchase_orders').select('id, po_number, status, expected_delivery_date').eq('market', 'NZ').in('status', ['submitted', 'partially_received']).not('expected_delivery_date', 'is', null)),
    all<Array<{ purchase_order_id: string; ingredient_id: string | null; quantity_ordered: number; quantity_received: number; unit_of_measure: string }>>(
      sb.from('purchase_order_lines').select('purchase_order_id, ingredient_id, quantity_ordered, quantity_received, unit_of_measure').not('ingredient_id', 'is', null)),
  ])

  const unitsByMonthByProduct = await productionUnitsByMonth(sb, (products ?? []).map((p) => p.id), months, first, last)

  // Dashboard rollup uses the NZ build for every product (the AU build's detail
  // lives on the demand pages). Picking NZ avoids an AU BOM winning last-write.
  const activeBomByProduct = new Map<string, string>()
  for (const b of boms ?? []) if ((b.market ?? 'NZ') !== 'AU') activeBomByProduct.set(b.product_id, b.id)
  const bomItemsByBom = new Map<string, Array<{ ingredient_id: string; quantity_g: number; wet_quantity_g: number | null }>>()
  for (const it of bomItems ?? []) {
    if (!bomItemsByBom.has(it.bom_id)) bomItemsByBom.set(it.bom_id, [])
    bomItemsByBom.get(it.bom_id)!.push({ ingredient_id: it.ingredient_id, quantity_g: it.quantity_g, wet_quantity_g: it.wet_quantity_g })
  }

  const poById = new Map((openPos ?? []).map((p) => [p.id, p]))
  const ingredientById = new Map((ingredients ?? []).map((i) => [i.id, i]))
  const arrivalsByIngredient = new Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>()
  for (const ln of openPoLines ?? []) {
    if (!ln.ingredient_id) continue
    const po = poById.get(ln.purchase_order_id)
    if (!po?.expected_delivery_date) continue
    const monthKey = po.expected_delivery_date.slice(0, 7) + '-01'
    if (!months.includes(monthKey)) continue
    const remaining = Math.max(0, Number(ln.quantity_ordered) - Number(ln.quantity_received))
    if (remaining <= 0) continue
    const ing = ingredientById.get(ln.ingredient_id)
    const lineUom = (ln.unit_of_measure ?? '').trim().toLowerCase()
    let qty = remaining
    if (lineUom === 'g') qty = convertGramsToIngredientUom(remaining, ing?.unit_of_measure ?? null)
    if (!arrivalsByIngredient.has(ln.ingredient_id)) arrivalsByIngredient.set(ln.ingredient_id, [])
    arrivalsByIngredient.get(ln.ingredient_id)!.push({ po_id: ln.purchase_order_id, po_number: po.po_number, month: monthKey, qty })
  }

  const groups = aggregateIngredientDemand({
    ingredients: ingredients ?? [], suppliers: suppliers ?? [],
    activeBomByProduct, bomItemsByBom, products: products ?? [],
    unitsByMonthByProduct, months, arrivalsByIngredient,
  })

  const { totals, shorts } = emptyCounts(months)
  for (const g of groups) {
    for (const row of g.ingredients) {
      if (!row.ingredient.supplier_id) continue   // exclude "supplier not set"
      const states = ingStates(row, row.ingredient.opening_stock_override ?? 0, months)
      for (const m of months) {
        if ((row.demandByMonth.get(m) ?? 0) > 0) totals.set(m, (totals.get(m) ?? 0) + 1)
        if (states.get(m) === 'red')             shorts.set(m, (shorts.get(m) ?? 0) + 1)
      }
    }
  }
  return { totals, shorts }
}

// ── Packaging demand ──────────────────────────────────────────
export async function loadPackagingStrip(sb: SB, months: string[], first: string, last: string): Promise<StripData> {
  const [{ data: products }, { data: packaging }, { data: suppliers }, { data: links }, { data: openPos }, { data: openPoLines }] = await Promise.all([
    all<Array<{ id: string; sku_code: string; name: string; product_type: string | null }>>(
      sb.from('products').select('id, sku_code, name, product_type').is('deleted_at', null)),
    all<Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string; supplier_id: string | null; opening_stock_override: number | null }>>(
      sb.from('packaging').select('id, sku_code, name, type, unit_of_measure, supplier_id, opening_stock_override').eq('is_active', true)),
    all<Array<{ id: string; name: string }>>(sb.from('suppliers').select('id, name')),
    all<Array<{ product_id: string; packaging_id: string; quantity_per_unit: number; market: string | null }>>(
      sb.from('product_packaging').select('product_id, packaging_id, quantity_per_unit, market')),
    all<Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null }>>(
      sb.from('purchase_orders').select('id, po_number, status, expected_delivery_date').eq('market', 'NZ').in('status', ['submitted', 'partially_received']).not('expected_delivery_date', 'is', null)),
    all<Array<{ purchase_order_id: string; packaging_id: string | null; quantity_ordered: number; quantity_received: number }>>(
      sb.from('purchase_order_lines').select('purchase_order_id, packaging_id, quantity_ordered, quantity_received').not('packaging_id', 'is', null)),
  ])

  const unitsByMonthByProduct = await productionUnitsByMonth(sb, (products ?? []).map((p) => p.id), months, first, last)

  const poById = new Map((openPos ?? []).map((p) => [p.id, p]))
  const arrivalsByPackaging = new Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>()
  for (const ln of openPoLines ?? []) {
    if (!ln.packaging_id) continue
    const po = poById.get(ln.purchase_order_id)
    if (!po?.expected_delivery_date) continue
    const monthKey = po.expected_delivery_date.slice(0, 7) + '-01'
    if (!months.includes(monthKey)) continue
    const remaining = Math.max(0, Number(ln.quantity_ordered) - Number(ln.quantity_received))
    if (remaining <= 0) continue
    if (!arrivalsByPackaging.has(ln.packaging_id)) arrivalsByPackaging.set(ln.packaging_id, [])
    arrivalsByPackaging.get(ln.packaging_id)!.push({ po_id: ln.purchase_order_id, po_number: po.po_number, month: monthKey, qty: remaining })
  }

  // Dashboard rollup uses NZ-build packaging only (total production through the
  // NZ packaging); the AU build's detail lives on the packaging demand page.
  const nzLinks = (links ?? []).filter((l) => (l.market ?? 'NZ') !== 'AU')
  const groups = aggregatePackagingDemand({
    packaging: packaging ?? [], suppliers: suppliers ?? [],
    productPackaging: nzLinks, products: products ?? [],
    unitsByMonthByProduct, months, arrivalsByPackaging,
  })

  const { totals, shorts } = emptyCounts(months)
  const seen = new Set<string>()
  for (const g of groups) {
    for (const row of g.packaging) {
      if (seen.has(row.packaging.id)) continue
      seen.add(row.packaging.id)
      const states = pkgStates(row, row.packaging.opening_stock_override ?? 0, months)
      for (const m of months) {
        if ((row.demandByMonth.get(m) ?? 0) > 0) totals.set(m, (totals.get(m) ?? 0) + 1)
        if (states.get(m) === 'red')             shorts.set(m, (shorts.get(m) ?? 0) + 1)
      }
    }
  }
  return { totals, shorts }
}

// ── GP overview by product group ──────────────────────────────
export interface GroupGp { key: string; label: string; gpNz: number | null; gpAu: number | null; count: number }

export async function loadGpByGroup(sb: SB, settings: SettingsSnapshot): Promise<GroupGp[]> {
  const { data: products } = await all<Array<Record<string, unknown> & { product_type: string | null; boms?: Array<{ is_active: boolean; market?: string | null; bom_items: BomItemWithIngredient[] }> }>>(
    sb.from('products').select(`
      id, product_type, size_g, serving_size, wet_weight_g, rrp, rrp_au,
      packaging, toll, toll_au, margin, other, freight, freight_nz, freight_au,
      toll_currency, margin_currency, other_currency, freight_nz_currency, freight_au_currency,
      apply_fx, wastage_pct, manufacturer_au,
      boms ( is_active, market, bom_items (
        id, ingredient_id, quantity_g, wet_quantity_g, uom, price_override, notes, sort_order,
        ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, total_loaded_cost_au, is_organic, currency, price )
      ))
    `).eq('is_active', true).is('deleted_at', null))

  const byGroup = new Map<string, { nz: number[]; au: number[] }>()
  for (const p of products ?? []) {
    const nzBom = p.boms?.find((b) => b.is_active && (b.market ?? 'NZ') === 'NZ')
    const auBom = p.boms?.find((b) => b.is_active && b.market === 'AU')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = calcProductCostSummary(p as any, nzBom?.bom_items ?? [], settings, auBom?.bom_items ?? [])
    const key = p.product_type ?? '_none'
    if (!byGroup.has(key)) byGroup.set(key, { nz: [], au: [] })
    const g = byGroup.get(key)!
    if (summary.gp_nz != null && isFinite(summary.gp_nz)) g.nz.push(summary.gp_nz)
    if (summary.gp_au != null && isFinite(summary.gp_au)) g.au.push(summary.gp_au)
  }

  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
  return PRODUCT_GROUPS.map((grp) => {
    const g = byGroup.get(grp.value)
    return { key: grp.value, label: grp.label, gpNz: g ? avg(g.nz) : null, gpAu: g ? avg(g.au) : null, count: g ? Math.max(g.nz.length, g.au.length) : 0 }
  })
}
