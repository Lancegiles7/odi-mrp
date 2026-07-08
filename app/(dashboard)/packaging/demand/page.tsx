import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { rollingMonths, indexProduction, getProductionCell, indexDemand, getGrandTotal, getCountryTotal, monthLabel } from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'
import { aggregatePackagingDemand, hasAnyShortfall, monthShortfallStates, type PackagingRow } from '@/lib/packaging-demand'
import { PackagingDemandRow } from '@/components/packaging/packaging-demand-row'
import { MonthlyShortfallStrip } from '@/components/inventory/monthly-shortfall-strip'
import { getCellsWithComments } from '@/app/(dashboard)/_actions/cell-comments'
import { getPackagingOpeningStockSummary } from '@/lib/opening-stock-summary'
import { PRODUCT_GROUP_LABELS } from '@/lib/constants'

export const metadata: Metadata = { title: 'Packaging demand' }

type Source  = 'production' | 'forecast'
type GroupBy = 'supplier' | 'product_group'
type Market  = 'combined' | 'nz' | 'au'

interface PageProps {
  searchParams: { source?: string; group?: string; market?: string }
}

export default async function PackagingDemandPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const anchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, anchor)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const source: Source = searchParams.source === 'forecast' ? 'forecast' : 'production'
  const groupBy: GroupBy = searchParams.group === 'product_group' ? 'product_group' : 'supplier'
  const market: Market = searchParams.market === 'nz' ? 'nz' : searchParams.market === 'au' ? 'au' : 'combined'
  const openingForMarket = (pk: { opening_stock_override: number | null; opening_stock_override_au?: number | null }) =>
    market === 'au' ? (pk.opening_stock_override_au ?? 0)
    : market === 'nz' ? (pk.opening_stock_override ?? 0)
    : (pk.opening_stock_override ?? 0) + (pk.opening_stock_override_au ?? 0)

  const [
    { data: products }, { data: packaging }, { data: suppliers },
    { data: pp }, { data: production }, demand,
    { data: openPos }, { data: openPoLines },
  ] = await Promise.all([
    supabase.from('products').select('id, sku_code, name, product_type').is('deleted_at', null) as { data: Array<{ id: string; sku_code: string; name: string; product_type: string | null }> | null },
    supabase.from('packaging').select('id, sku_code, name, type, unit_of_measure, supplier_id, opening_stock_override, opening_stock_override_au').eq('is_active', true).order('name') as { data: Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string; supplier_id: string | null; opening_stock_override: number | null; opening_stock_override_au: number | null }> | null },
    supabase.from('suppliers').select('id, name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('product_packaging').select('product_id, packaging_id, quantity_per_unit, market') as { data: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number; market: string | null }> | null },
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned, market')
      .gte('year_month', firstMonth).lte('year_month', lastMonth) as { data: Array<{ product_id: string; year_month: string; units_planned: number; market: string | null }> | null },
    fetchAllRows<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }>((from, to) =>
      supabase.from('demand_forecasts')
        .select('product_id, year_month, channel, units, is_edited')
        .gte('year_month', firstMonth).lte('year_month', lastMonth)
        .order('product_id').order('year_month').order('channel')
        .range(from, to) as unknown as PromiseLike<{ data: Array<{ product_id: string; year_month: string; channel: string; units: number; is_edited: boolean }> | null; error: { message: string } | null }>),
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date, market')
      .in('status', ['submitted', 'partially_received'])
      .not('expected_delivery_date', 'is', null) as { data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null }> | null },
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, packaging_id, quantity_ordered, quantity_received')
      .not('packaging_id', 'is', null) as { data: Array<{ purchase_order_id: string; packaging_id: string | null; quantity_ordered: number; quantity_received: number }> | null },
  ])

  // Which products have an AU build? Their AU-market packaging explodes through
  // AU-market demand; everything else stays on the NZ units (unchanged).
  const { data: pBoms } = await supabase
    .from('boms').select('product_id, market').eq('is_active', true) as
    { data: Array<{ product_id: string; market: string | null }> | null }
  const dualProducts = new Set((pBoms ?? []).filter((b) => b.market === 'AU').map((b) => b.product_id))

  // Build units maps per product / month from the chosen source, split by market
  // for dual products (NZ-channel → NZ packaging, AU-channel → AU packaging).
  const unitsByMonthByProduct   = new Map<string, Map<string, number>>()
  const unitsAuByMonthByProduct = new Map<string, Map<string, number>>()
  for (const m of months) { unitsByMonthByProduct.set(m, new Map()); unitsAuByMonthByProduct.set(m, new Map()) }

  const demandIdx = indexDemand((demand ?? []) as never[])
  const prodIdxNz = indexProduction(((production ?? []) as Array<{ market: string | null }>).filter((r) => (r.market ?? 'NZ') !== 'AU') as never[])
  const prodIdxAu = indexProduction(((production ?? []) as Array<{ market: string | null }>).filter((r) => r.market === 'AU') as never[])

  for (const p of products ?? []) {
    const isDual = dualProducts.has(p.id)
    for (const m of months) {
      if (source === 'forecast') {
        if (isDual) {
          const nz = getCountryTotal(demandIdx, p.id, m, 'NZ')
          const au = getCountryTotal(demandIdx, p.id, m, 'AUS')
          if (nz) unitsByMonthByProduct.get(m)!.set(p.id, nz)
          if (au) unitsAuByMonthByProduct.get(m)!.set(p.id, au)
        } else {
          const u = getGrandTotal(demandIdx, p.id, m)
          if (u) unitsByMonthByProduct.get(m)!.set(p.id, u)
        }
      } else {
        // Production source: each build's own plan (Brand Nation NZ, VMC AU).
        const nz = getProductionCell(prodIdxNz, p.id, m)
        if (nz) unitsByMonthByProduct.get(m)!.set(p.id, nz)
        if (isDual) {
          const au = getProductionCell(prodIdxAu, p.id, m)
          if (au) unitsAuByMonthByProduct.get(m)!.set(p.id, au)
        }
      }
    }
  }

  // Build arrivals from open packaging-line POs. For each line with a
  // packaging_id and a parent PO whose expected_delivery_date lands in
  // the planning window, count (ordered − received) units into the
  // arrival bucket for that packaging item × month. Mirrors the
  // ingredient-demand arrivals build (without the UoM conversion since
  // packaging is always tracked as 'each').
  // Only count POs raised for the selected build (Combined counts all).
  const poById = new Map<string, { po_number: string; expected_delivery_date: string | null }>()
  for (const p of openPos ?? []) {
    const poMarket = p.market === 'AU' ? 'AU' : 'NZ'
    if (market !== 'combined' && poMarket !== (market === 'au' ? 'AU' : 'NZ')) continue
    poById.set(p.id, { po_number: p.po_number, expected_delivery_date: p.expected_delivery_date })
  }
  const arrivalsByPackaging = new Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>()
  for (const ln of openPoLines ?? []) {
    if (!ln.packaging_id) continue
    const po = poById.get(ln.purchase_order_id)
    if (!po?.expected_delivery_date) continue
    // An open PO whose delivery date has already passed is still stock we're
    // owed, so pull it into the first planning month rather than dropping it.
    // POs due beyond the end of the window are still skipped.
    const rawMonth = po.expected_delivery_date.slice(0, 7) + '-01'
    const monthKey = rawMonth < months[0] ? months[0] : rawMonth
    if (!months.includes(monthKey)) continue
    const remaining = Math.max(0, Number(ln.quantity_ordered) - Number(ln.quantity_received))
    if (remaining <= 0) continue
    if (!arrivalsByPackaging.has(ln.packaging_id)) arrivalsByPackaging.set(ln.packaging_id, [])
    arrivalsByPackaging.get(ln.packaging_id)!.push({
      po_id: ln.purchase_order_id, po_number: po.po_number, month: monthKey, qty: remaining,
    })
  }

  // Scope the explosion to the selected market by filtering which packaging
  // links feed it (each link explodes through its own market's units).
  const ppForMarket = (pp ?? []).filter((p) =>
    market === 'nz' ? (p.market ?? 'NZ') !== 'AU'
    : market === 'au' ? p.market === 'AU'
    : true,
  )
  const supplierGroups = aggregatePackagingDemand({
    packaging:        packaging ?? [],
    suppliers:        suppliers ?? [],
    productPackaging: ppForMarket,
    products:         products ?? [],
    unitsByMonthByProduct,
    unitsAuByMonthByProduct,
    months,
    // Arrivals are already scoped to the selected market's POs (above).
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
  const totalShortfalls = uniqueRows.filter((r) => hasAnyShortfall(r, openingForMarket(r.packaging), months)).length

  // Page-level monthly shortfall counts (every packaging item across every
  // supplier / group). Drives the single top-of-page summary strip — totals
  // across the board, regardless of which accordion is open.
  const pageTotals = new Map<string, number>(months.map((m) => [m, 0]))
  const pageShorts = new Map<string, number>(months.map((m) => [m, 0]))
  for (const r of uniqueRows) {
    const opening = openingForMarket(r.packaging)
    const states  = monthShortfallStates(r, opening, months)
    for (const m of months) {
      if ((r.demandByMonth.get(m) ?? 0) > 0) pageTotals.set(m, (pageTotals.get(m) ?? 0) + 1)
      if (states.get(m) === 'red')           pageShorts.set(m, (pageShorts.get(m) ?? 0) + 1)
    }
  }

  const [commentedCells, openingHistorySummary] = await Promise.all([
    getCellsWithComments('packaging', uniqueRows.map((r) => r.packaging.id), firstMonth, lastMonth),
    getPackagingOpeningStockSummary(uniqueRows.map((r) => r.packaging.id), market === 'au' ? 'AU' : 'NZ'),
  ])

  const sourceLabel = source === 'production' ? 'production plan' : 'demand forecast'
  const groupLabel  = groupBy === 'supplier' ? 'supplier' : 'product group'

  // Helper to keep the OTHER params when toggling each control
  const mq = market === 'combined' ? '' : `&market=${market}`
  const sourceLink = (s: Source)  => `/packaging/demand?source=${s}&group=${groupBy}${mq}`
  const groupLink  = (g: GroupBy) => `/packaging/demand?source=${source}&group=${g}${mq}`
  const marketLink = (m: Market)  => `/packaging/demand?source=${source}&group=${groupBy}${m === 'combined' ? '' : `&market=${m}`}`
  const marketLabel = market === 'nz' ? 'NZ build · Brand Nation' : market === 'au' ? 'AU build · VMC' : 'NZ + AU combined'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Packaging demand</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · Based on{' '}
            <span className="font-semibold text-gray-800">{sourceLabel}</span>
            {' · '}Grouped by <span className="font-semibold text-gray-800">{groupLabel}</span>
            {' · '}<span className="font-semibold text-gray-800">{marketLabel}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
            {([['combined', 'Combined'], ['nz', 'NZ'], ['au', 'AU']] as [Market, string][]).map(([m, label], i) => (
              <Link key={m} href={marketLink(m)}
                className={`px-3 py-1.5 font-medium ${i > 0 ? 'border-l border-gray-300' : ''} ${market === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {label}
              </Link>
            ))}
          </div>
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

      <MonthlyShortfallStrip months={months} totalsByMonth={pageTotals} shortByMonth={pageShorts} />

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
                    <th className="text-left px-4 py-2 font-medium">Packaging</th>
                    <th className="text-right px-3 py-2 font-medium">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                    {months.map((m) => (
                      <th key={m} className="text-right px-2 py-2 font-medium border-l border-gray-200">{monthLabel(m)}</th>
                    ))}
                    <th className="text-right px-2 py-2 font-medium bg-gray-50 border-l border-gray-200">Total needed</th>
                    <th className="text-right px-2 py-2 font-medium border-l border-gray-200">Total shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((row) => (
                    <PackagingDemandRow
                      key={`${row.packaging.id}-${market}`}
                      row={row}
                      months={months}
                      market={market}
                      commentedCells={commentedCells}
                      openingHistory={openingHistorySummary.get(row.packaging.id)}
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
