import type { Metadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  rollingMonths, indexDemand, indexProduction,
  getGrandTotal, getCountryTotal, getProductionCell, resolveOpeningStock, monthLabel, calcRollingBalance,
} from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'
import { MANUFACTURER_CHIP_COLOURS } from '@/lib/constants'
import { ProductionRow } from '@/components/production/production-row'
import { ManufacturerFilter } from '@/components/production/manufacturer-filter'
import { MonthlyShortfallStrip } from '@/components/inventory/monthly-shortfall-strip'
import { getCellsWithComments } from '@/app/(dashboard)/_actions/cell-comments'
import { getProductOpeningStockSummary } from '@/lib/opening-stock-summary'
import type { DemandForecast, ProductionPlan } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Production schedule' }

interface ProductRow {
  id: string
  sku_code: string
  name: string
  manufacturer: string | null
  manufacturer_au: string | null
  opening_stock_override: number | null
  is_active: boolean
}

// One production line = a product made by one maker for one market. Non-dual
// products have a single NZ line; dual products have an NZ line (Brand Nation)
// and an AU line (VMC), each planned and tracked separately.
interface ProdLine {
  key: string
  product: ProductRow
  market: 'NZ' | 'AU'
  maker: string | null
  canEditOpening: boolean
  opening: number
  forecastByMonth: Record<string, number>
  productionByMonth: Record<string, number>
  /** True when the product is split into NZ + AU lines (show the market tag). */
  showTag: boolean
}

interface PageProps {
  searchParams: { view?: string; manufacturer?: string }
}

export default async function ProductionPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const anchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, anchor)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const [{ data: products }, demand, { data: production }, { data: inventory }] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku_code, name, manufacturer, manufacturer_au, opening_stock_override, is_active')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('manufacturer', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }) as unknown as Promise<{ data: ProductRow[] | null }>,
    fetchAllRows<DemandForecast>((from, to) =>
      supabase
        .from('demand_forecasts')
        .select('product_id, year_month, channel, units, is_edited')
        .gte('year_month', firstMonth)
        .lte('year_month', lastMonth)
        .order('product_id').order('year_month').order('channel')
        .range(from, to) as unknown as PromiseLike<{ data: DemandForecast[] | null; error: { message: string } | null }>,
    ),
    supabase
      .from('production_plans')
      .select('product_id, year_month, units_planned, market')
      .gte('year_month', firstMonth)
      .lte('year_month', lastMonth) as unknown as Promise<{ data: Array<ProductionPlan & { market: string | null }> | null }>,
    supabase
      .from('inventory_balances')
      .select('ingredient_id, quantity_on_hand') as unknown as Promise<{ data: Array<{ ingredient_id: string; quantity_on_hand: number }> | null }>,
  ])

  const allProducts = products ?? []
  const demandIdx = indexDemand(demand)
  // Production is now planned per market. Index NZ and AU plans separately;
  // legacy rows default to NZ so single-build behaviour is unchanged.
  const prodRows  = (production ?? []) as Array<ProductionPlan & { market: string | null }>
  const prodIdxNz = indexProduction(prodRows.filter((r) => (r.market ?? 'NZ') !== 'AU'))
  const prodIdxAu = indexProduction(prodRows.filter((r) => r.market === 'AU'))

  // inventory_balances is keyed by ingredient_id — we don't currently have product-level stock.
  // Placeholder lookup (empty) until product stock is wired. opening_stock_override still works.
  const stockByProduct = new Map<string, number>()
  for (const row of inventory ?? []) {
    // No mapping today; left as a stub for when product-level stock is tracked.
    stockByProduct.set(row.ingredient_id, row.quantity_on_hand)
  }

  function openingFor(p: ProductRow): number {
    return resolveOpeningStock(p.opening_stock_override, stockByProduct.get(p.id))
  }

  const byMonth = (fn: (m: string) => number): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const m of months) out[m] = fn(m)
    return out
  }

  // Expand products into production lines. A dual product (manufacturer_au set)
  // splits into an NZ line under Brand Nation (NZ-channel demand, NZ plan) and
  // an AU line under VMC (AU-channel demand, AU plan). Non-dual products keep a
  // single NZ line driven by all-channel demand — exactly as before.
  const lines: ProdLine[] = []
  for (const p of allProducts) {
    const dual = !!(p.manufacturer_au && p.manufacturer_au.trim())
    // Split into NZ + AU lines whenever the product sells to Australia, so AU
    // production can be planned per market. Dual products always split (their AU
    // build is real); products with no AU demand stay a single NZ line driven
    // by all-channel demand — exactly as before.
    const hasAu = dual || months.some((m) => getCountryTotal(demandIdx, p.id, m, 'AUS') > 0)
    lines.push({
      key: `${p.id}:NZ`, product: p, market: 'NZ', maker: p.manufacturer, canEditOpening: true,
      opening: openingFor(p),
      forecastByMonth:  byMonth((m) => hasAu ? getCountryTotal(demandIdx, p.id, m, 'NZ') : getGrandTotal(demandIdx, p.id, m)),
      productionByMonth: byMonth((m) => getProductionCell(prodIdxNz, p.id, m)),
      showTag: hasAu,
    })
    if (hasAu) {
      lines.push({
        key: `${p.id}:AU`, product: p, market: 'AU', maker: p.manufacturer_au?.trim() || p.manufacturer, canEditOpening: false,
        opening: 0,
        forecastByMonth:  byMonth((m) => getCountryTotal(demandIdx, p.id, m, 'AUS')),
        // AU production is only what's been planned — no make-to-demand default.
        productionByMonth: byMonth((m) => getProductionCell(prodIdxAu, p.id, m)),
        showTag: true,
      })
    }
  }

  // Total-across-visible-products monthly shortfall counts. Drives the
  // single top-of-page summary strip — grouped view uses the all-active set
  // (consistent regardless of which manufacturer accordion is open);
  // view-all uses the filtered set so the strip respects the manufacturer
  // filter.
  function shortfallCountsFor(items: ProdLine[]) {
    const totals = new Map<string, number>(months.map((m) => [m, 0]))
    const shorts = new Map<string, number>(months.map((m) => [m, 0]))
    for (const ln of items) {
      const rolling = calcRollingBalance(months, ln.opening, (m) => ln.forecastByMonth[m] ?? 0, (m) => ln.productionByMonth[m] ?? 0)
      for (const r of rolling) {
        if (r.forecast > 0)    totals.set(r.month, (totals.get(r.month) ?? 0) + 1)
        if (r.state === 'red') shorts.set(r.month, (shorts.get(r.month) ?? 0) + 1)
      }
    }
    return { totals, shorts }
  }
  const pageCounts = shortfallCountsFor(lines)

  // Bulk-fetch (a) which (product, month) cells already have a comment,
  // and (b) which products have any opening-stock edit history and/or
  // comments — the latter drives the clock-button render on each row.
  const [commentedCells, openingHistorySummary] = await Promise.all([
    getCellsWithComments('product', allProducts.map((p) => p.id), firstMonth, lastMonth),
    getProductOpeningStockSummary(allProducts.map((p) => p.id)),
  ])

  // Build maker groups from lines. A dual product appears under both makers:
  // Brand Nation (its NZ line) and VMC (its AU line).
  const manufacturers = new Map<string, ProdLine[]>()
  const UNASSIGNED = '__unassigned__'
  for (const ln of lines) {
    const key = ln.maker ?? UNASSIGNED
    if (!manufacturers.has(key)) manufacturers.set(key, [])
    manufacturers.get(key)!.push(ln)
  }

  function shortfallCount(items: ProdLine[]): number {
    let n = 0
    for (const ln of items) {
      let bal = ln.opening
      for (const m of months) {
        bal = bal + (ln.productionByMonth[m] ?? 0) - (ln.forecastByMonth[m] ?? 0)
        if (bal < 0) n++
      }
    }
    return n
  }

  const view = searchParams.view === 'all' ? 'all' : 'grouped'
  const filterMfr = searchParams.manufacturer ?? 'all'

  // ─────────── Header + view toggle ───────────
  const header = (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Production schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · Balance = prev + production − forecast
        </p>
      </div>
      <div className="flex gap-2 items-center">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          <Link
            href="/production"
            className={`px-3 py-1.5 font-medium ${view === 'grouped' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Grouped by manufacturer
          </Link>
          <Link
            href="/production?view=all"
            className={`px-3 py-1.5 font-medium border-l border-gray-300 ${view === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            View all products
          </Link>
        </div>
      </div>
    </div>
  )

  const monthHeaders = (
    <>
      {months.map((m) => (
        <th key={m} colSpan={3} className="text-center font-medium px-3 py-2 border-l border-gray-200">
          {monthLabel(m)}
        </th>
      ))}
    </>
  )
  const monthSubHeaders = (
    <>
      {months.map((m) => (
        <Fragmented key={m} />
      ))}
    </>
  )

  // ─────────── GROUPED VIEW ───────────
  if (view === 'grouped') {
    return (
      <div className="space-y-5">
        {header}

        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-300"></span> Production (editable)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200"></span> Amber — saved by this month&rsquo;s production</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Red — short even with production</span>
          <span className="text-gray-300">·</span>
          <span>Opening stock = manual override where set, else inventory on hand.</span>
        </div>

        <MonthlyShortfallStrip months={months} totalsByMonth={pageCounts.totals} shortByMonth={pageCounts.shorts} />

        {Array.from(manufacturers.entries()).map(([key, items]) => {
          const label = key === UNASSIGNED ? 'Manufacturer not set' : key
          const chip  = key === UNASSIGNED ? null : (MANUFACTURER_CHIP_COLOURS[key] ?? null)
          const short = shortfallCount(items)
          return (
            <details key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden" open={short > 0}>
              <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">▶</span>
                  <span className="font-semibold text-sm">{label}</span>
                  {chip && <span className={`text-[10px] px-1.5 py-0.5 rounded ${chip}`}>{items.length} products</span>}
                  {!chip && <span className="text-xs text-gray-500">{items.length} products</span>}
                </div>
                {short > 0
                  ? <span className="text-xs text-red-600 font-medium">{short} shortfall{short === 1 ? '' : 's'}</span>
                  : <span className="text-xs text-gray-500">On track</span>}
              </summary>

              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs table-fixed" style={{ minWidth: 3000 }}>
                  <colgroup>
                    <col style={{ width: 280 }} />
                    <col style={{ width: 100 }} />
                    {months.map((m) => (
                      <Fragment key={m}>
                        <col style={{ width: 56 }} />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 64 }} />
                      </Fragment>
                    ))}
                    <col style={{ width: 96 }} />
                    <col style={{ width: 110 }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                      <th className="text-left font-medium px-4 py-2 sticky left-0 bg-gray-50 z-10">Product</th>
                      <th className="text-right font-medium px-3 py-2">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                      {monthHeaders}
                      <th className="text-right font-medium px-2 py-2 bg-gray-50 border-l border-gray-200">Total needed</th>
                      <th className="text-right font-medium px-2 py-2 border-l border-gray-200">Total shortfall</th>
                    </tr>
                    <tr className="bg-gray-50 text-[10px] text-gray-500">
                      <th className="sticky left-0 bg-gray-50 z-10"></th>
                      <th></th>
                      {monthSubHeaders}
                      <th></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ln) => {
                      return (
                        <ProductionRow
                          key={ln.key}
                          productId={ln.product.id}
                          market={ln.market}
                          marketTag={ln.showTag ? ln.market : undefined}
                          skuCode={ln.product.sku_code}
                          productName={ln.product.name}
                          manufacturer={ln.maker}
                          isActive={ln.product.is_active}
                          openingStock={ln.opening}
                          openingStockOverride={ln.canEditOpening ? ln.product.opening_stock_override : null}
                          canEditOpening={ln.canEditOpening}
                          months={months}
                          forecastByMonth={ln.forecastByMonth}
                          productionByMonth={ln.productionByMonth}
                          commentedCells={commentedCells}
                          openingHistory={openingHistorySummary.get(ln.product.id)}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </div>
    )
  }

  // ─────────── VIEW ALL ───────────
  const mfrOptions = ['all', ...Array.from(new Set(lines.map((ln) => ln.maker).filter((m): m is string => !!m))), UNASSIGNED]
  const filtered = filterMfr === 'all'
    ? lines
    : lines.filter((ln) => (ln.maker ?? UNASSIGNED) === filterMfr)

  const totals = {
    products: new Set(filtered.map((ln) => ln.product.id)).size,
    active:   filtered.filter((ln) => ln.product.is_active).length,
    inactive: filtered.filter((ln) => !ln.product.is_active).length,
    forecast: filtered.reduce((s, ln) => s + months.reduce((a, m) => a + (ln.forecastByMonth[m] ?? 0), 0), 0),
    production: filtered.reduce((s, ln) => s + months.reduce((a, m) => a + (ln.productionByMonth[m] ?? 0), 0), 0),
    shortfalls: shortfallCount(filtered),
    opening:    filtered.reduce((s, ln) => s + ln.opening, 0),
  }

  // Filter-aware monthly counts for the top-of-page summary strip.
  const filteredCounts = shortfallCountsFor(filtered)

  return (
    <div className="space-y-5">
      {header}

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Filter:</label>
        <ManufacturerFilter value={filterMfr} options={mfrOptions} unassignedKey={UNASSIGNED} />
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Tile label="Products" value={totals.products.toString()} sub={`${totals.active} active · ${totals.inactive} inactive`} />
        <Tile label="Forecast 12mo" value={totals.forecast.toLocaleString()} sub="units" />
        <Tile label="Production 12mo" value={totals.production.toLocaleString()} sub="scheduled" />
        <Tile label="Shortfalls" value={totals.shortfalls.toString()} sub="months × SKU" accent={totals.shortfalls > 0 ? 'red' : undefined} />
        <Tile label="Opening stock" value={totals.opening.toLocaleString()} sub="units on hand" />
      </div>

      <MonthlyShortfallStrip months={months} totalsByMonth={filteredCounts.totals} shortByMonth={filteredCounts.shorts} />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed" style={{ minWidth: 3100 }}>
            <colgroup>
              <col style={{ width: 280 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              {months.map((m) => (
                <Fragment key={m}>
                  <col style={{ width: 56 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 64 }} />
                </Fragment>
              ))}
              <col style={{ width: 96 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-medium px-4 py-2 sticky left-0 bg-gray-50 z-10">Product</th>
                <th className="text-left font-medium px-3 py-2">Manufacturer</th>
                <th className="text-right font-medium px-3 py-2">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                {monthHeaders}
                <th className="text-right font-medium px-2 py-2 bg-gray-50 border-l border-gray-200">Total needed</th>
                <th className="text-right font-medium px-2 py-2 border-l border-gray-200">Total shortfall</th>
              </tr>
              <tr className="bg-gray-50 text-[10px] text-gray-500">
                <th className="sticky left-0 bg-gray-50 z-10"></th>
                <th></th>
                <th></th>
                {monthSubHeaders}
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ln) => {
                return (
                  <ProductionRow
                    key={ln.key}
                    productId={ln.product.id}
                    market={ln.market}
                    marketTag={ln.showTag ? ln.market : undefined}
                    skuCode={ln.product.sku_code}
                    productName={ln.product.name}
                    manufacturer={ln.maker}
                    isActive={ln.product.is_active}
                    openingStock={ln.opening}
                    openingStockOverride={ln.canEditOpening ? ln.product.opening_stock_override : null}
                    canEditOpening={ln.canEditOpening}
                    months={months}
                    forecastByMonth={ln.forecastByMonth}
                    productionByMonth={ln.productionByMonth}
                    commentedCells={commentedCells}
                    openingHistory={openingHistorySummary.get(ln.product.id)}
                    showManufacturerChip
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Fragmented() {
  return (
    <>
      <th className="text-right px-2 py-1 border-l border-gray-200 font-medium text-[10px]">Fcst</th>
      <th className="text-right px-2 py-1 font-medium text-[10px]">Prod</th>
      <th className="text-right px-2 py-1 font-medium text-[10px]">Bal</th>
    </>
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
