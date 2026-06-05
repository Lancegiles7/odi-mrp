import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  rollingMonths, indexDemand, indexProduction,
  getGrandTotal, getProductionCell, monthLabel,
} from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'
import {
  aggregateIngredientDemand, hasAnyShortfall, demandUnitLabel,
  convertGramsToIngredientUom, monthShortfallStates,
} from '@/lib/ingredient-demand'
import { IngredientDemandRow } from '@/components/ingredients/ingredient-demand-row'
import { MonthlyShortfallStrip } from '@/components/inventory/monthly-shortfall-strip'
import { getCellsWithComments } from '@/app/(dashboard)/_actions/cell-comments'
import { getIngredientOpeningStockSummary } from '@/lib/opening-stock-summary'

export const metadata: Metadata = { title: 'Ingredient demand' }

interface PageProps {
  searchParams: { source?: string }
}

export default async function IngredientDemandPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const anchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, anchor)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const source: 'production' | 'forecast' =
    searchParams.source === 'forecast' ? 'forecast' : 'production'

  // ── Fetch everything we need in parallel ───────────────────
  const [
    { data: products }, { data: ingredients }, { data: suppliers },
    { data: boms }, { data: bomItems },
    demand, { data: production },
    { data: openPos }, { data: openPoLines },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, sku_code, name')
      .is('deleted_at', null) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure, supplier_id, opening_stock_override, is_active')
      .eq('is_active', true) as unknown as Promise<{ data: Array<{
        id: string; sku_code: string; name: string; unit_of_measure: string | null;
        supplier_id: string | null; opening_stock_override: number | null; is_active: boolean
      }> | null }>,
    supabase.from('suppliers')
      .select('id, name') as unknown as Promise<{ data: Array<{ id: string; name: string }> | null }>,
    supabase.from('boms')
      .select('id, product_id, is_active')
      .eq('is_active', true) as unknown as Promise<{ data: Array<{ id: string; product_id: string; is_active: boolean }> | null }>,
    supabase.from('bom_items')
      .select('bom_id, ingredient_id, quantity_g') as unknown as Promise<{ data: Array<{ bom_id: string; ingredient_id: string; quantity_g: number }> | null }>,
    fetchAllRows<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }>((from, to) =>
      supabase.from('demand_forecasts')
        .select('product_id, year_month, channel, units, is_edited')
        .gte('year_month', firstMonth).lte('year_month', lastMonth)
        .order('product_id').order('year_month').order('channel')
        .range(from, to) as unknown as PromiseLike<{ data: Array<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }> | null; error: { message: string } | null }>),
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as unknown as Promise<{ data: Array<{ product_id: string; year_month: string; units_planned: number }> | null }>,
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date')
      .in('status', ['submitted', 'partially_received'])
      .not('expected_delivery_date', 'is', null) as unknown as Promise<{ data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null }> | null }>,
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, ingredient_id, quantity_ordered, quantity_received, unit_of_measure')
      .not('ingredient_id', 'is', null) as unknown as Promise<{ data: Array<{ purchase_order_id: string; ingredient_id: string | null; quantity_ordered: number; quantity_received: number; unit_of_measure: string }> | null }>,
  ])

  // ── Build source data: month → product → units ─────────────
  const unitsByMonthByProduct = new Map<string, Map<string, number>>()
  for (const m of months) unitsByMonthByProduct.set(m, new Map())

  if (source === 'forecast') {
    const demandIdx = indexDemand((demand ?? []) as never[])
    for (const p of products ?? []) {
      for (const m of months) {
        const units = getGrandTotal(demandIdx, p.id, m)
        if (units) unitsByMonthByProduct.get(m)!.set(p.id, units)
      }
    }
  } else {
    const prodIdx = indexProduction((production ?? []) as never[])
    for (const p of products ?? []) {
      for (const m of months) {
        const units = getProductionCell(prodIdx, p.id, m)
        if (units) unitsByMonthByProduct.get(m)!.set(p.id, units)
      }
    }
  }

  // ── BOM lookups ────────────────────────────────────────────
  const activeBomByProduct = new Map<string, string>()
  for (const b of boms ?? []) activeBomByProduct.set(b.product_id, b.id)

  const bomItemsByBom = new Map<string, Array<{ ingredient_id: string; quantity_g: number }>>()
  for (const it of bomItems ?? []) {
    if (!bomItemsByBom.has(it.bom_id)) bomItemsByBom.set(it.bom_id, [])
    bomItemsByBom.get(it.bom_id)!.push({ ingredient_id: it.ingredient_id, quantity_g: it.quantity_g })
  }

  // ── Build arrivals map: ingredient_id → [{ po, month, qty }] ──
  // Only include lines from open POs with a delivery date inside the window.
  const poById = new Map<string, { po_number: string; expected_delivery_date: string | null }>()
  for (const p of openPos ?? []) poById.set(p.id, { po_number: p.po_number, expected_delivery_date: p.expected_delivery_date })

  const arrivalsByIngredient = new Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>()
  const ingredientById = new Map((ingredients ?? []).map((i) => [i.id, i]))

  for (const ln of openPoLines ?? []) {
    if (!ln.ingredient_id) continue
    const po = poById.get(ln.purchase_order_id)
    if (!po?.expected_delivery_date) continue
    const monthKey = po.expected_delivery_date.slice(0, 7) + '-01'  // 'YYYY-MM-01'
    if (!months.includes(monthKey)) continue

    const remaining = Math.max(0, Number(ln.quantity_ordered) - Number(ln.quantity_received))
    if (remaining <= 0) continue

    // Convert PO line UoM into the ingredient's display UoM.
    // PO lines store UoM as text; if it's 'g' treat as grams (convert to kg
    // when ingredient is kg). If 'kg' and ingredient is kg, pass through.
    // Otherwise fall through (best-effort).
    const ing = ingredientById.get(ln.ingredient_id)
    const ingUom = (ing?.unit_of_measure ?? '').trim().toLowerCase()
    const lineUom = (ln.unit_of_measure ?? '').trim().toLowerCase()

    let qty = remaining
    if ((ingUom === 'kg' || ingUom === 'g' || ingUom === '') && lineUom === 'g') {
      // Convert PO grams into the ingredient's display unit (kg for weight)
      qty = convertGramsToIngredientUom(remaining, ing?.unit_of_measure ?? null)
    }
    // If line is in 'kg' and ingredient is also kg → no conversion. If
    // line is in kg but ingredient stored as 'g' (rare), assume the user
    // means the same unit and pass through.

    if (!arrivalsByIngredient.has(ln.ingredient_id)) arrivalsByIngredient.set(ln.ingredient_id, [])
    arrivalsByIngredient.get(ln.ingredient_id)!.push({
      po_id: ln.purchase_order_id, po_number: po.po_number, month: monthKey, qty,
    })
  }

  // ── Aggregate ──────────────────────────────────────────────
  const groups = aggregateIngredientDemand({
    ingredients: ingredients ?? [],
    suppliers: suppliers ?? [],
    activeBomByProduct,
    bomItemsByBom,
    products: products ?? [],
    unitsByMonthByProduct,
    months,
    arrivalsByIngredient,
  })

  // ── Derived totals for tiles ───────────────────────────────
  let totalIngredients = 0
  let totalShortfalls = 0
  const demandByUnit = new Map<string, number>()
  let openingSumKg = 0
  const allIngredientIds: string[] = []

  for (const g of groups) {
    for (const row of g.ingredients) {
      totalIngredients++
      const unit = demandUnitLabel(row.ingredient.unit_of_measure)
      demandByUnit.set(unit, (demandByUnit.get(unit) ?? 0) + row.totalDemand)
      const opening = row.ingredient.opening_stock_override ?? 0
      // Skip shortfall count for ingredients with no supplier — there's
      // nothing the user can action on those, so they shouldn't pad the
      // headline number. They still render in the table; only the tile
      // and the supplier groupings reflect actionable ingredients.
      if (row.ingredient.supplier_id && hasAnyShortfall(row, opening, months)) totalShortfalls++
      if (unit === 'kg') openingSumKg += opening
      allIngredientIds.push(row.ingredient.id)
    }
  }

  // Page-level monthly shortfall counts (every ingredient across every supplier).
  // Drives the single top-of-page summary strip — totals across the board, so
  // the user sees the same numbers regardless of which supplier accordion is open.
  const pageTotals = new Map<string, number>(months.map((m) => [m, 0]))
  const pageShorts = new Map<string, number>(months.map((m) => [m, 0]))
  for (const g of groups) {
    for (const row of g.ingredients) {
      const opening = row.ingredient.opening_stock_override ?? 0
      const states  = monthShortfallStates(row, opening, months)
      for (const m of months) {
        if ((row.demandByMonth.get(m) ?? 0) > 0) pageTotals.set(m, (pageTotals.get(m) ?? 0) + 1)
        if (states.get(m) === 'red')             pageShorts.set(m, (pageShorts.get(m) ?? 0) + 1)
      }
    }
  }

  const [commentedCells, openingHistorySummary] = await Promise.all([
    getCellsWithComments('ingredient', allIngredientIds, firstMonth, lastMonth),
    getIngredientOpeningStockSummary(allIngredientIds),
  ])

  const demandSummaryParts: string[] = []
  for (const [u, v] of demandByUnit.entries()) {
    if (!v) continue
    demandSummaryParts.push(`${Math.round(v).toLocaleString()} ${u}`)
  }
  const demandSummary = demandSummaryParts[0] ?? '0'
  const demandSubParts = demandSummaryParts.slice(1)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ingredient demand</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · Based on{' '}
            <span className="font-semibold text-gray-800">
              {source === 'production' ? 'production plan' : 'demand forecast'}
            </span>
            {' · '}Balance = opening − cumulative demand
          </p>
        </div>
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          <Link
            href="/ingredients/demand?source=forecast"
            className={`px-3 py-1.5 font-medium ${source === 'forecast' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            From forecast
          </Link>
          <Link
            href="/ingredients/demand"
            className={`px-3 py-1.5 font-medium border-l border-gray-300 ${source === 'production' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            From production plan
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-dashed border-gray-300"></span> Opening stock (editable)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Shortfall (opening won&rsquo;t cover cumulative demand)</span>
        <span className="text-gray-300">·</span>
        <span>Click an ingredient row to see which products are driving the demand.</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Tile label="Ingredients" value={totalIngredients.toString()} sub={`across ${groups.length} supplier${groups.length === 1 ? '' : 's'}`} />
        <Tile label="Demand 12mo" value={demandSummary} sub={demandSubParts.join(' · ') || undefined} />
        <Tile label="Shortfalls" value={totalShortfalls.toString()} sub="ingredients short" accent={totalShortfalls > 0 ? 'red' : undefined} />
        <Tile label="Opening stock" value={`${Math.round(openingSumKg).toLocaleString()} kg`} sub="kg-tracked ingredients" />
      </div>

      <MonthlyShortfallStrip months={months} totalsByMonth={pageTotals} shortByMonth={pageShorts} />

      {groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No ingredient demand to show. Add BOMs to products, or set an opening stock override.
        </div>
      )}

      {groups.map((g) => {
        const shortCount = g.ingredients.reduce((n, r) =>
          n + (hasAnyShortfall(r, r.ingredient.opening_stock_override ?? 0, months) ? 1 : 0), 0)
        return (
          <details key={g.supplier.id ?? 'none'} className="bg-white rounded-lg border border-gray-200 overflow-hidden" open={shortCount > 0}>
            <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">▶</span>
                <span className="font-semibold text-sm">{g.supplier.name}</span>
                <span className="text-xs text-gray-500">
                  {g.ingredients.length} ingredient{g.ingredients.length === 1 ? '' : 's'}
                </span>
              </div>
              {shortCount > 0
                ? <span className="text-xs text-red-600 font-medium">{shortCount} shortfall{shortCount === 1 ? '' : 's'}</span>
                : <span className="text-xs text-gray-500">On track</span>}
            </summary>

            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-xs table-fixed" style={{ minWidth: 1740 }}>
                <colgroup>
                  <col style={{ width: 280 }} />
                  <col style={{ width: 110 }} />
                  {months.map((m) => <col key={m} style={{ width: 80 }} />)}
                  <col style={{ width: 96 }} />
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="text-left font-medium px-4 py-2">Ingredient</th>
                    <th className="text-right font-medium px-3 py-2">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                    {months.map((m) => (
                      <th key={m} className="text-right font-medium px-2 py-2 border-l border-gray-200">{monthLabel(m)}</th>
                    ))}
                    <th className="text-right font-medium px-2 py-2 bg-gray-50 border-l border-gray-200">Total needed</th>
                    <th className="text-right font-medium px-2 py-2 border-l border-gray-200">Total shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {g.ingredients.map((row) => (
                    <IngredientDemandRow
                      key={row.ingredient.id}
                      row={row}
                      months={months}
                      commentedCells={commentedCells}
                      openingHistory={openingHistorySummary.get(row.ingredient.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )
      })}
    </div>
  )
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'red' }) {
  const cls = accent === 'red'
    ? 'p-3 bg-red-50 border border-red-200 rounded-md'
    : 'p-3 bg-white border border-gray-200 rounded-md'
  const labelCls = accent === 'red' ? 'text-red-700' : 'text-gray-500'
  const valCls   = accent === 'red' ? 'text-red-800' : 'text-gray-900'
  return (
    <div className={cls}>
      <div className={`text-[11px] uppercase font-semibold ${labelCls}`}>{label}</div>
      <div className={`text-lg font-semibold ${valCls}`}>{value}</div>
      {sub && <div className={`text-[11px] ${labelCls}`}>{sub}</div>}
    </div>
  )
}
