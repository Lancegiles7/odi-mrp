import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { rollingMonths, indexProduction, getProductionCell, monthLabel } from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'
import { aggregatePackagingDemand, hasAnyShortfall } from '@/lib/packaging-demand'
import { PackagingDemandRow } from '@/components/packaging/packaging-demand-row'

export const metadata: Metadata = { title: 'Packaging demand' }

export default async function PackagingDemandPage() {
  const supabase = createClient()
  const anchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, anchor)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const [
    { data: products }, { data: packaging }, { data: suppliers },
    { data: pp }, { data: production },
    { data: openPos }, { data: openPoLines },
  ] = await Promise.all([
    supabase.from('products').select('id, sku_code, name').is('deleted_at', null) as { data: Array<{ id: string; sku_code: string; name: string }> | null },
    supabase.from('packaging').select('id, sku_code, name, type, unit_of_measure, supplier_id, opening_stock_override').eq('is_active', true).order('name') as { data: Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string; supplier_id: string | null; opening_stock_override: number | null }> | null },
    supabase.from('suppliers').select('id, name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('product_packaging').select('product_id, packaging_id, quantity_per_unit') as { data: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number }> | null },
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as { data: Array<{ product_id: string; year_month: string; units_planned: number }> | null },
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date')
      .in('status', ['submitted', 'partially_received'])
      .not('expected_delivery_date', 'is', null) as { data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null }> | null },
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, ingredient_id, product_id, description, quantity_ordered, quantity_received, unit_of_measure, notes')
      .ilike('notes', '%packaging%') as { data: Array<{ purchase_order_id: string; ingredient_id: string | null; product_id: string | null; description: string | null; quantity_ordered: number; quantity_received: number; unit_of_measure: string; notes: string | null }> | null },
  ])

  // Build production-units map per product / month
  const unitsByMonthByProduct = new Map<string, Map<string, number>>()
  for (const m of months) unitsByMonthByProduct.set(m, new Map())
  const prodIdx = indexProduction((production ?? []) as never[])
  for (const p of products ?? []) {
    for (const m of months) {
      const u = getProductionCell(prodIdx, p.id, m)
      if (u) unitsByMonthByProduct.get(m)!.set(p.id, u)
    }
  }

  // Build arrivals from open packaging-line POs.
  // We don't have a packaging_id on PO lines yet, so for v1 we leave arrivals
  // empty — POs flow inventory through stock_movements at receipt time, which
  // is already wired. (TODO: add packaging_id to PO lines for arrival tracking.)
  void openPos; void openPoLines
  const arrivalsByPackaging = new Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>()

  const groups = aggregatePackagingDemand({
    packaging:        packaging ?? [],
    suppliers:        suppliers ?? [],
    productPackaging: pp ?? [],
    products:         products ?? [],
    unitsByMonthByProduct,
    months,
    arrivalsByPackaging,
  })

  let totalItems = 0
  let totalShortfalls = 0
  for (const g of groups) for (const r of g.packaging) {
    totalItems++
    if (hasAnyShortfall(r, r.packaging.opening_stock_override ?? 0, months)) totalShortfalls++
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Packaging demand</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · driven by Production schedule × per-product packaging BOM
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-dashed border-gray-300"></span> Opening stock (editable)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Shortfall</span>
        <span className="text-gray-300">·</span>
        <span>Click a packaging row to see which products drive the demand.</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Packaging items" value={totalItems.toString()} sub={`across ${groups.length} supplier${groups.length === 1 ? '' : 's'}`} />
        <Tile label="Shortfalls" value={totalShortfalls.toString()} sub="items short" accent={totalShortfalls > 0 ? 'red' : undefined} />
        <Tile label="Source" value="Production schedule" sub={`× per-product BOM (${pp?.length ?? 0} links)`} />
      </div>

      {groups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No packaging demand to show. Add a packaging item, link it to a product&rsquo;s BOM, or set an opening-stock override.
        </div>
      )}

      {groups.map((g) => {
        const shortCount = g.packaging.reduce((n, r) => n + (hasAnyShortfall(r, r.packaging.opening_stock_override ?? 0, months) ? 1 : 0), 0)
        return (
          <details key={g.supplier.id ?? 'none'} className="bg-white rounded-lg border border-gray-200 overflow-hidden" open={shortCount > 0}>
            <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">▶</span>
                <span className="font-semibold text-sm">{g.supplier.name}</span>
                <span className="text-xs text-gray-500">{g.packaging.length} item{g.packaging.length === 1 ? '' : 's'}</span>
              </div>
              {shortCount > 0
                ? <span className="text-xs text-red-600 font-medium">{shortCount} shortfall{shortCount === 1 ? '' : 's'}</span>
                : <span className="text-xs text-gray-500">On track</span>}
            </summary>

            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 1700 }}>
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="text-left px-4 py-2 font-medium w-[320px] min-w-[320px]">Packaging</th>
                    <th className="text-right px-3 py-2 font-medium w-[110px] min-w-[110px]">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                    {months.map((m) => (
                      <th key={m} className="text-right px-2 py-2 font-medium border-l border-gray-200 min-w-[72px]">{monthLabel(m)}</th>
                    ))}
                    <th className="text-right px-3 py-2 font-medium bg-gray-100 border-l border-gray-200 min-w-[90px]">12-mo total</th>
                  </tr>
                </thead>
                <tbody>
                  {g.packaging.map((row) => (
                    <PackagingDemandRow key={row.packaging.id} row={row} months={months} />
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
