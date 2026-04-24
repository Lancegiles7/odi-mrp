import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  rollingMonths, indexDemand, indexProduction,
  getGrandTotal, getProductionCell, monthLabel,
} from '@/lib/demand'
import {
  aggregateIngredientDemand, hasAnyShortfall, demandUnitLabel,
} from '@/lib/ingredient-demand'
import { IngredientDemandRow } from '@/components/ingredients/ingredient-demand-row'

export const metadata: Metadata = { title: 'Ingredient demand' }

interface PageProps {
  searchParams: { source?: string }
}

export default async function IngredientDemandPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const months = rollingMonths()
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const source: 'production' | 'forecast' =
    searchParams.source === 'forecast' ? 'forecast' : 'production'

  // ── Fetch everything we need in parallel ───────────────────
  const [
    { data: products }, { data: ingredients }, { data: suppliers },
    { data: boms }, { data: bomItems },
    { data: demand }, { data: production },
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
    supabase.from('demand_forecasts')
      .select('product_id, year_month, channel, units, is_edited')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as unknown as Promise<{ data: Array<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }> | null }>,
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as unknown as Promise<{ data: Array<{ product_id: string; year_month: string; units_planned: number }> | null }>,
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

  // ── Aggregate ──────────────────────────────────────────────
  const groups = aggregateIngredientDemand({
    ingredients: ingredients ?? [],
    suppliers: suppliers ?? [],
    activeBomByProduct,
    bomItemsByBom,
    products: products ?? [],
    unitsByMonthByProduct,
    months,
  })

  // ── Derived totals for tiles ───────────────────────────────
  let totalIngredients = 0
  let totalShortfalls = 0
  const demandByUnit = new Map<string, number>()
  let openingSumKg = 0

  for (const g of groups) {
    for (const row of g.ingredients) {
      totalIngredients++
      const unit = demandUnitLabel(row.ingredient.unit_of_measure)
      demandByUnit.set(unit, (demandByUnit.get(unit) ?? 0) + row.totalDemand)
      const opening = row.ingredient.opening_stock_override ?? 0
      if (hasAnyShortfall(row, opening, months)) totalShortfalls++
      if (unit === 'kg') openingSumKg += opening
    }
  }

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
              <table className="w-full text-xs" style={{ minWidth: 1700 }}>
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="text-left font-medium px-4 py-2 w-[320px] min-w-[320px]">Ingredient</th>
                    <th className="text-right font-medium px-3 py-2 w-[110px] min-w-[110px]">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                    {months.map((m) => (
                      <th key={m} className="text-right font-medium px-2 py-2 border-l border-gray-200 min-w-[72px]">{monthLabel(m)}</th>
                    ))}
                    <th className="text-right font-medium px-3 py-2 bg-gray-100 border-l border-gray-200 min-w-[90px]">12-mo total</th>
                  </tr>
                </thead>
                <tbody>
                  {g.ingredients.map((row) => (
                    <IngredientDemandRow key={row.ingredient.id} row={row} months={months} />
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
