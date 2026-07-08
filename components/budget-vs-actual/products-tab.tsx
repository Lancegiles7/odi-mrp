'use client'

import { Fragment } from 'react'
import { CountedEomInput } from './counted-eom-input'
import { ActualCellInput, OpeningCellInput } from './actual-cell-input'
import { varBadgeClass, type ProductRow } from '@/lib/budget-vs-actual'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'

type Sums = ReturnType<typeof sumRows>

function sumRows(rows: ProductRow[]) {
  return rows.reduce(
    (acc, r) => ({
      opening:     acc.opening   + (r.opening ?? 0),
      bud_retail:  acc.bud_retail  + r.budget_by_channel.nz_retail,
      bud_d2c:     acc.bud_d2c     + r.budget_by_channel.nz_d2c,
      bud_samples: acc.bud_samples + r.budget_by_channel.nz_samples,
      bud_total:   acc.bud_total   + r.budget_total,
      bud_sales:   acc.bud_sales   + r.budget_sales,
      retail:      acc.retail      + r.channels.nz_retail,
      d2c:         acc.d2c         + r.channels.nz_d2c,
      samples:     acc.samples     + r.channels.nz_samples,
      total_out:   acc.total_out   + r.total_out,
      total_sales: acc.total_sales + r.total_sales,
      calc_eom:    acc.calc_eom    + (r.calc_eom ?? 0),
      counted_eom: acc.counted_eom + (r.counted_eom ?? 0),
    }),
    { opening: 0, bud_retail: 0, bud_d2c: 0, bud_samples: 0, bud_total: 0, bud_sales: 0,
      retail: 0, d2c: 0, samples: 0, total_out: 0, total_sales: 0, calc_eom: 0, counted_eom: 0 },
  )
}

export function ProductsTab({
  rows, year_month, isLocked, scope = 'month', ytdLabel = null,
}: {
  rows: ProductRow[]; year_month: string; isLocked: boolean
  scope?: 'month' | 'ytd'; ytdLabel?: string | null
}) {
  const isYtd = scope === 'ytd'
  // Group rows by product group, in PRODUCT_GROUPS order; unknown groups last.
  const order = PRODUCT_GROUPS.map((g) => g.value as string)
  const grouped = new Map<string, ProductRow[]>()
  for (const r of rows) {
    const key = r.group ?? '__other__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  const grand = sumRows(rows)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {isYtd && (
        <div className="px-4 py-2.5 bg-emerald-50/60 border-b border-emerald-100 text-xs text-emerald-900 flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Year to date{ytdLabel ? ` · ${ytdLabel}` : ''}</span>
          <span className="text-emerald-800/80">Cumulative sales &amp; budget per product. Opening is the FY-start figure; stock closes at the latest month. Figures are read-only here — switch to <em>This month</em> to edit.</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 2000 }}>
          <thead>
            {/* Group header row */}
            <tr className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="px-3 py-1 sticky left-0 bg-gray-100 z-20 border-r-2 border-gray-300"></th>
              <th className="px-2 py-1 sticky left-[320px] bg-gray-100 z-20 border-r-2 border-gray-300"></th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-emerald-50/40">NZ Retail</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-emerald-50/40">NZ D2C</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-purple-50/60">NZ Pipefill / Samples</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-gray-100 text-gray-400">AU (soon)</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-emerald-50">Total</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200">Variance</th>
              <th colSpan={3} className="px-2 py-1 text-center bg-amber-50/40">Stock</th>
            </tr>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 w-[320px] min-w-[320px] max-w-[320px] z-20">Product</th>
              <th className="text-right px-2 py-2 w-[80px] sticky left-[320px] bg-gray-50 z-20 border-r-2 border-gray-300" title={isYtd ? 'Opening SOH at the FY start' : 'Opening SOH for the month'}>{isYtd ? 'Open (FY)' : 'Open'}</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50/40">Act</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50/40">Act</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40" title="Budget pipefill (covers samples + buffer)">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-purple-50/60">Act</th>
              <th className="text-right px-2 py-2 w-[80px] bg-gray-100 text-gray-400">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-gray-100 text-gray-400">Act</th>
              <th className="text-right px-2 py-2 w-[90px] bg-blue-50/40">Bud total</th>
              <th className="text-right px-2 py-2 w-[90px] bg-emerald-50">Act total</th>
              <th className="text-right px-2 py-2 w-[100px]" title="(Retail+D2C act) − (Retail+D2C bud) — sales beat or miss">Var sales</th>
              <th className="text-right px-2 py-2 w-[100px]" title="Total act − Total bud (incl pipefill/samples)">Var total</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40" title="Opening − Total out">Calc EOM</th>
              <th className="text-right px-2 py-2 w-[100px]" title="Counted closing stock (manual)">Counted EOM</th>
              <th className="text-right px-2 py-2 w-[100px]">Stock var</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-sm text-gray-500">
                  No products yet. Add products under <em>Planning → Products / BOMs</em>.
                </td>
              </tr>
            )}
            {groupKeys.map((key) => {
              const groupRows = grouped.get(key)!
              const label = key === '__other__' ? 'Other' : (PRODUCT_GROUP_LABELS[key] ?? key)
              return (
                <Fragment key={key}>
                  <tr className="bg-gray-100/80 border-y border-gray-200">
                    <td colSpan={17} className="px-3 py-1.5 sticky left-0 bg-gray-100/80 z-10 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                      {label} <span className="ml-1 normal-case font-normal text-gray-400">{groupRows.length}</span>
                    </td>
                  </tr>
                  {groupRows.map((r) => <ProductTr key={r.product_id} r={r} year_month={year_month} isLocked={isLocked} isYtd={isYtd} />)}
                  <SummaryRow label={`${label} — subtotal`} s={sumRows(groupRows)} subtle />
                </Fragment>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <SummaryRow label="Totals" s={grand} />
            </tfoot>
          )}
        </table>
      </div>
      <div className="p-3 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
        <strong>Legend:</strong>
        <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50/40">Budget (from demand forecast)</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-50/40">Actual sales channels</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-purple-50/60">Actual samples</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50/40">Calculated</span>
        <span className="ml-3 text-gray-400">Variance bands: 0–10% none · 10–25% amber · &gt;25% red. Pipefill (budget) is compared against samples (actual).</span>
      </div>
    </div>
  )
}

function ProductTr({ r, year_month, isLocked, isYtd }: { r: ProductRow; year_month: string; isLocked: boolean; isYtd: boolean }) {
  const noActuals = r.total_out === 0 && r.budget_total === 0
  return (
    <tr className="group border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
        <div className="font-medium text-gray-900">{r.name}</div>
        <div className="text-[10px] font-mono text-gray-500">{r.sku}</div>
      </td>
      <td className="px-1 py-1 text-right tabular-nums sticky left-[320px] bg-white group-hover:bg-gray-50 z-10 border-r-2 border-gray-300">
        {isYtd
          ? <span className="px-1 text-gray-700">{r.opening != null ? r.opening.toLocaleString() : <span className="text-gray-300">—</span>}</span>
          : <OpeningCellInput entity_id={r.product_id} year_month={year_month} initial={r.opening} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{cellOrDash(r.budget_by_channel.nz_retail)}</td>
      <td className={isYtd ? 'px-2 py-2 text-right tabular-nums bg-emerald-50/40' : 'px-1 py-1 bg-emerald-50/40'}>
        {isYtd ? cellOrDash(r.channels.nz_retail)
          : <ActualCellInput product_id={r.product_id} year_month={year_month} channel="nz_retail" initial={r.channels.nz_retail} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{cellOrDash(r.budget_by_channel.nz_d2c)}</td>
      <td className={isYtd ? 'px-2 py-2 text-right tabular-nums bg-emerald-50/40' : 'px-1 py-1 bg-emerald-50/40'}>
        {isYtd ? cellOrDash(r.channels.nz_d2c)
          : <ActualCellInput product_id={r.product_id} year_month={year_month} channel="nz_d2c" initial={r.channels.nz_d2c} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{cellOrDash(r.budget_by_channel.nz_samples)}</td>
      <td className={isYtd ? 'px-2 py-2 text-right tabular-nums bg-purple-50/60' : 'px-1 py-1 bg-purple-50/60'}>
        {isYtd ? cellOrDash(r.channels.nz_samples)
          : <ActualCellInput product_id={r.product_id} year_month={year_month} channel="nz_samples" initial={r.channels.nz_samples} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-gray-50 text-gray-300">—</td>
      <td className="px-2 py-2 text-right tabular-nums bg-gray-50 text-gray-300">—</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-medium">{r.budget_total > 0 ? r.budget_total.toLocaleString() : <span className="text-gray-300">—</span>}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-medium">
        {r.total_out > 0 ? r.total_out.toLocaleString() : <span className="text-gray-300 italic">not entered</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {noActuals ? <span className="text-gray-300">—</span> : <VarBadge actual={r.total_sales} budget={r.budget_sales} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {noActuals ? <span className="text-gray-300">—</span> : <VarBadge actual={r.total_out} budget={r.budget_total} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-medium">
        {r.calc_eom != null ? r.calc_eom.toLocaleString() : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {isYtd
          ? (r.counted_eom != null ? r.counted_eom.toLocaleString() : <span className="text-gray-300">—</span>)
          : <CountedEomInput entity_type="product" entity_id={r.product_id} year_month={year_month} initial={r.counted_eom} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.stock_variance != null
          ? <span className={`inline-block px-1.5 py-0.5 rounded ${Math.abs(r.stock_variance) === 0 ? 'text-gray-400' : r.stock_variance > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>{r.stock_variance > 0 ? '+' : ''}{r.stock_variance.toLocaleString()}</span>
          : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

function SummaryRow({ label, s, subtle = false }: { label: string; s: Sums; subtle?: boolean }) {
  const bg = subtle ? 'bg-gray-50' : 'bg-gray-50 border-t-2 border-gray-200'
  return (
    <tr className={`${bg} ${subtle ? 'border-t border-gray-200 text-[11px] text-gray-600' : 'text-sm'}`}>
      <td className={`px-3 py-2 sticky left-0 ${subtle ? 'bg-gray-50' : 'bg-gray-50'} font-semibold z-10`}>{label}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold sticky left-[320px] bg-gray-50 z-10 border-r-2 border-gray-300">{s.opening.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_retail.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 font-semibold">{s.retail.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_d2c.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 font-semibold">{s.d2c.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_samples.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-purple-50/60 font-semibold">{s.samples.toLocaleString()}</td>
      <td colSpan={2} className="px-2 py-2 text-right tabular-nums bg-gray-100 text-gray-300">—</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_total.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-semibold">{s.total_out.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.bud_sales > 0 ? <VarBadge actual={s.total_sales} budget={s.bud_sales} /> : '—'}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.bud_total > 0 ? <VarBadge actual={s.total_out} budget={s.bud_total} /> : '—'}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-semibold">{s.calc_eom.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.counted_eom.toLocaleString()}</td>
      <td></td>
    </tr>
  )
}

function cellOrDash(n: number): React.ReactNode {
  return n > 0 ? n.toLocaleString() : <span className="text-gray-300 italic">—</span>
}

function VarBadge({ actual, budget }: { actual: number; budget: number }) {
  const diff = actual - budget
  const pct  = budget !== 0 ? (diff / budget) * 100 : null
  const sign = diff >= 0 ? '+' : ''
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${varBadgeClass(actual, budget)}`}>
      {sign}{diff.toLocaleString()}{pct != null ? ` (${sign}${pct.toFixed(0)}%)` : ''}
    </span>
  )
}
