import type { Metadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { monthLabel } from '@/lib/demand'
import { loadProductionLines, productionShortfallCounts, netTransfers, type ProductionLine } from '@/lib/production-lines'
import { getPlanningWindow, fyLabel } from '@/lib/settings'
import { PlanningHistoryToggle } from '@/components/shared/planning-history-toggle'
import { MANUFACTURER_CHIP_COLOURS } from '@/lib/constants'
import { ProductionRow } from '@/components/production/production-row'
import { ManufacturerFilter } from '@/components/production/manufacturer-filter'
import { MonthlyShortfallStrip } from '@/components/inventory/monthly-shortfall-strip'
import { getCellsWithComments } from '@/app/(dashboard)/_actions/cell-comments'
import { coverFor, type PoCover } from '@/lib/production-po-status'
import { loadPoCover } from '@/lib/production-po-status-data'

export const metadata: Metadata = { title: 'Production schedule' }

// One production line per product per build market — see lib/production-lines.
interface ProdLine extends ProductionLine {
  /** Finished-goods POs due per live month (by expected delivery date). */
  poCoverByMonth: Record<string, PoCover>
}

interface PageProps {
  searchParams: { view?: string; manufacturer?: string; history?: string }
}

export default async function ProductionPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const planning = await getPlanningWindow(searchParams.history === 'fy')
  const months = planning.months
  // Balances, shortfalls and totals stay on the live window — a look-back
  // shows what was forecast/produced but never moves the planning numbers.
  const activeMonths = planning.months.filter((m) => !planning.lockedMonths.includes(m))
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  // Lines come from the shared calculation the dashboard strip also uses.
  const [{ products: allProducts, lines: baseLines, ledger }, poCover] = await Promise.all([
    loadProductionLines(supabase, months),
    // PO colouring is for live months only — completed months stay plain.
    loadPoCover(activeMonths[0] ?? firstMonth, lastMonth),
  ])

  const closedMonth = ledger.actualThrough
  const closedMonthLabel = closedMonth ? monthLabel(closedMonth) : null
  const netOf = netTransfers

  const lines: ProdLine[] = baseLines.map((ln) => ({
    ...ln,
    poCoverByMonth: coverFor(poCover, ln.product.id, ln.markets, activeMonths),
  }))

  // Grouped view uses the all-active set; view-all uses the filtered set so
  // the strip respects the manufacturer filter.
  const shortfallCountsFor = (items: ProdLine[]) => productionShortfallCounts(items, activeMonths)
  const pageCounts = shortfallCountsFor(lines)

  // Bulk-fetch which (product, month) cells already have a comment.
  const commentedCells = await getCellsWithComments('product', allProducts.map((p) => p.id), firstMonth, lastMonth)

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
      for (const m of activeMonths) {
        bal = bal + (ln.productionByMonth[m] ?? 0) + netOf(ln.transfersByMonth[m]) - (ln.forecastByMonth[m] ?? 0)
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
          {planning.isHistory
            ? <>Completed months included ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · closed months are read-only, balances run from {monthLabel(planning.anchorMonth)}</>
            : <>Planning through {fyLabel(lastMonth)} ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · Balance = prev + production ± transfers − forecast</>}
        </p>
      </div>
      <div className="flex gap-2 items-center">
        {planning.canShowHistory && (
          <PlanningHistoryToggle isHistory={planning.isHistory} fromLabel={monthLabel(planning.fyStartMonth)} />
        )}
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
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-gray-300"></span> Production — no PO yet</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-500"></span> PO in, matches</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-500"></span> PO in, different qty</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200 border border-gray-400"></span> Draft PO only</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200"></span> Amber — saved by this month&rsquo;s production</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Red — short even with production</span>
          <span className="flex items-center gap-1.5"><span className="text-[9px] font-bold px-1 rounded border bg-teal-50 text-teal-700 border-teal-200">⇄</span> NZ ↔ AU transfer order — moves stock, not production</span>
          <span className="text-gray-300">·</span>
          <span>Opening stock = closing (EOM) of the last closed month from Stock Movements{closedMonthLabel ? ` (${closedMonthLabel})` : ''}.</span>
        </div>

        <MonthlyShortfallStrip months={activeMonths} totalsByMonth={pageCounts.totals} shortByMonth={pageCounts.shorts} />

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
                <table className="w-full text-xs table-fixed" style={{ minWidth: 600 + months.length * 200 }}>
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
                      <span className="block text-[9px] normal-case tracking-normal text-gray-400 font-normal">{closedMonthLabel ? `Stock Mvmts · ${closedMonthLabel}` : 'Stock Movements'}</span>
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
                          openingSource={closedMonthLabel}
                          months={months}
                          lockedMonths={planning.lockedMonths}
                          forecastByMonth={ln.forecastByMonth}
                          productionByMonth={ln.productionByMonth}
                          transfersByMonth={ln.transfersByMonth}
                          poCoverByMonth={ln.poCoverByMonth}
                          commentedCells={commentedCells}
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
    forecast: filtered.reduce((s, ln) => s + activeMonths.reduce((a, m) => a + (ln.forecastByMonth[m] ?? 0), 0), 0),
    production: filtered.reduce((s, ln) => s + activeMonths.reduce((a, m) => a + (ln.productionByMonth[m] ?? 0), 0), 0),
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
        <Tile label={`Forecast ${activeMonths.length}mo`} value={totals.forecast.toLocaleString()} sub="units" />
        <Tile label={`Production ${activeMonths.length}mo`} value={totals.production.toLocaleString()} sub="scheduled" />
        <Tile label="Shortfalls" value={totals.shortfalls.toString()} sub="months × SKU" accent={totals.shortfalls > 0 ? 'red' : undefined} />
        <Tile label="Opening stock" value={totals.opening.toLocaleString()} sub="units on hand" />
      </div>

      <MonthlyShortfallStrip months={activeMonths} totalsByMonth={filteredCounts.totals} shortByMonth={filteredCounts.shorts} />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed" style={{ minWidth: 700 + months.length * 200 }}>
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
                      <span className="block text-[9px] normal-case tracking-normal text-gray-400 font-normal">{closedMonthLabel ? `Stock Mvmts · ${closedMonthLabel}` : 'Stock Movements'}</span>
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
                    openingSource={closedMonthLabel}
                    months={months}
                    lockedMonths={planning.lockedMonths}
                    forecastByMonth={ln.forecastByMonth}
                    productionByMonth={ln.productionByMonth}
                    transfersByMonth={ln.transfersByMonth}
                          poCoverByMonth={ln.poCoverByMonth}
                    commentedCells={commentedCells}
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
