import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { rollingMonths, indexProduction, getProductionCell, indexDemand, getGrandTotal, monthLabel } from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'
import { aggregatePackagingDemand, hasAnyShortfall, type PackagingRow } from '@/lib/packaging-demand'
import { PackagingDemandRow } from '@/components/packaging/packaging-demand-row'
import { PRODUCT_GROUP_LABELS } from '@/lib/constants'

export const metadata: Metadata = { title: 'Packaging demand' }

type Source  = 'production' | 'forecast'
type GroupBy = 'supplier' | 'product_group'

interface PageProps {
  searchParams: { source?: string; group?: string }
}

export default async function PackagingDemandPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const anchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, anchor)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const source: Source = searchParams.source === 'forecast' ? 'forecast' : 'production'
  const groupBy: GroupBy = searchParams.group === 'product_group' ? 'product_group' : 'supplier'

  const [
    { data: products }, { data: packaging }, { data: suppliers },
    { data: pp }, { data: production }, { data: demand },
    { data: openPos }, { data: openPoLines },
  ] = await Promise.all([
    supabase.from('products').select('id, sku_code, name, product_type').is('deleted_at', null) as { data: Array<{ id: string; sku_code: string; name: string; product_type: string | null }> | null },
    supabase.from('packaging').select('id, sku_code, name, type, unit_of_measure, supplier_id, opening_stock_override').eq('is_active', true).order('name') as { data: Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string; supplier_id: string | null; opening_stock_override: number | null }> | null },
    supabase.from('suppliers').select('id, name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('product_packaging').select('product_id, packaging_id, quantity_per_unit') as { data: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number }> | null },
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as { data: Array<{ product_id: string; year_month: string; units_planned: number }> | null },
    supabase.from('demand_forecasts')
      .select('product_id, year_month, channel, units, is_edited')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as { data: Array<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }> | null },
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date')
      .in('status', ['submitted', 'partially_received'])
      .not('expected_delivery_date', 'is', null) as { data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null }> | null },
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, ingredient_id, product_id, description, quantity_ordered, quantity_received, unit_of_measure, notes')
      .ilike('notes', '%packaging%') as { data: Array<{ purchase_order_id: string; ingredient_id: string | null; product_id: string | null; description: string | null; quantity_ordered: number; quantity_received: number; unit_of_measure: string; notes: string | null }> | null },
  ])

  // Build units map per product / month from the chosen source
  const unitsByMonthByProduct = new Map<string, Map<string, number>>()
  for (const m of months) unitsByMonthByProduct.set(m, new Map())

  if (source === 'forecast') {
    const demandIdx = indexDemand((demand ?? []) as never[])
    for (const p of products ?? []) {
      for (const m of months) {
        const u = getGrandTotal(demandIdx, p.id, m)
        if (u) unitsByMonthByProduct.get(m)!.set(p.id, u)
      }
    }
  } else {
    const prodIdx = indexProduction((production ?? []) as never[])
    for (const p of products ?? []) {
      for (const m of months) {
        const u = getProductionCell(prodIdx, p.id, m)
        if (u) unitsByMonthByProduct.get(m)!.set(p.id, u)
      }
    }
  }

  // Build arrivals from open packaging-line POs.
  // We don't have a packaging_id on PO lines yet, so for v1 we leave arrivals
  // empty — POs flow inventory through stock_movements at receipt time, which
  // is already wired. (TODO: add packaging_id to PO lines for arrival tracking.)
  void openPos; void openPoLines
  const arrivalsByPackaging = new Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>()

  const supplierGroups = aggregatePackagingDemand({
    packaging:        packaging ?? [],
    suppliers:        suppliers ?? [],
    productPackaging: pp ?? [],
    products:         products ?? [],
    unitsByMonthByProduct,
    months,
    arrivalsByPackaging,
  })

  // Generic group shape used by the renderer below
  type RenderGroup = { id: string; name: string; rows: PackagingRow[] }

  let renderGroups: RenderGroup[]
  if (groupBy === 'product_group') {
    // Regroup: each packaging row appears under each product group of the
    // products that consume it. Catch unlinked items in an "Unassigned" bucket.
    const productTypeById = new Map<string, string | null>(
      (products ?? []).map((p) => [p.id, p.product_type ?? null]),
    )
    const buckets = new Map<string, PackagingRow[]>()
    const allRows: PackagingRow[] = supplierGroups.flatMap((g) => g.packaging)

    for (const row of allRows) {
      const seen = new Set<string>()
      for (const prod of row.products) {
        const key = productTypeById.get(prod.id) ?? '__unassigned__'
        if (seen.has(key)) continue
        seen.add(key)
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key)!.push(row)
      }
      // Packaging with no linked products → unassigned
      if (row.products.length === 0) {
        if (!buckets.has('__unassigned__')) buckets.set('__unassigned__', [])
        buckets.get('__unassigned__')!.push(row)
      }
    }

    renderGroups = Array.from(buckets.entries())
      .map(([key, rows]) => ({
        id:   key,
        name: key === '__unassigned__' ? 'Unassigned (no product group)' : (PRODUCT_GROUP_LABELS[key] ?? key),
        rows: rows.slice().sort((a, b) => a.packaging.name.localeCompare(b.packaging.name)),
      }))
      .sort((a, b) => {
        if (a.id === '__unassigned__') return 1
        if (b.id === '__unassigned__') return -1
        return a.name.localeCompare(b.name)
      })
  } else {
    renderGroups = supplierGroups.map<RenderGroup>((g) => ({
      id:   g.supplier.id ?? 'none',
      name: g.supplier.name,
      rows: g.packaging,
    }))
  }

  // Headline counts: dedupe rows when grouping by product group (a single
  // packaging item can show up under multiple groups).
  const uniqueRows: PackagingRow[] = Array.from(new Map(
    supplierGroups.flatMap((g) => g.packaging.map((r) => [r.packaging.id, r])),
  ).values())
  const totalItems      = uniqueRows.length
  const totalShortfalls = uniqueRows.filter((r) => hasAnyShortfall(r, r.packaging.opening_stock_override ?? 0, months)).length

  const sourceLabel = source === 'production' ? 'production plan' : 'demand forecast'
  const groupLabel  = groupBy === 'supplier' ? 'supplier' : 'product group'

  // Helper to keep the OTHER param when toggling each control
  const sourceLink = (s: Source)  => `/packaging/demand?source=${s}&group=${groupBy}`
  const groupLink  = (g: GroupBy) => `/packaging/demand?source=${source}&group=${g}`

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Packaging demand</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · Based on{' '}
            <span className="font-semibold text-gray-800">{sourceLabel}</span>
            {' · '}Grouped by <span className="font-semibold text-gray-800">{groupLabel}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
            <Link href={sourceLink('forecast')}
              className={`px-3 py-1.5 font-medium ${source === 'forecast' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              From forecast
            </Link>
            <Link href={sourceLink('production')}
              className={`px-3 py-1.5 font-medium border-l border-gray-300 ${source === 'production' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              From production plan
            </Link>
          </div>
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
            <Link href={groupLink('supplier')}
              className={`px-3 py-1.5 font-medium ${groupBy === 'supplier' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              Group by supplier
            </Link>
            <Link href={groupLink('product_group')}
              className={`px-3 py-1.5 font-medium border-l border-gray-300 ${groupBy === 'product_group' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              Group by product group
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-dashed border-gray-300"></span> Opening stock (editable)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Shortfall</span>
        <span className="text-gray-300">·</span>
        <span>Click a packaging row to see which products drive the demand.</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Packaging items" value={totalItems.toString()} sub={`across ${renderGroups.length} ${groupLabel}${renderGroups.length === 1 ? '' : 's'}`} />
        <Tile label="Shortfalls" value={totalShortfalls.toString()} sub="items short" accent={totalShortfalls > 0 ? 'red' : undefined} />
        <Tile label="Source" value={sourceLabel} sub={`× per-product BOM (${pp?.length ?? 0} links)`} />
      </div>

      {renderGroups.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No packaging demand to show. Add a packaging item, link it to a product&rsquo;s BOM, or set an opening-stock override.
        </div>
      )}

      {renderGroups.map((g) => {
        const shortCount = g.rows.reduce((n, r) => n + (hasAnyShortfall(r, r.packaging.opening_stock_override ?? 0, months) ? 1 : 0), 0)
        return (
          <details key={g.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden" open={shortCount > 0}>
            <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">▶</span>
                <span className="font-semibold text-sm">{g.name}</span>
                <span className="text-xs text-gray-500">{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
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
                  {g.rows.map((row) => (
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
