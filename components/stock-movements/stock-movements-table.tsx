import { Fragment } from 'react'
import type { StockRow } from '@/lib/stock-movements'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'
import { InboundCell } from '@/components/stock-movements/inbound-cell'
import { OpenPoChips } from '@/components/stock-movements/open-po-chips'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const dash = <span className="text-gray-300">—</span>
const cell = (n: number) => (n ? nf(n) : dash)

function eomClass(v: number): string {
  if (v < 0) return 'text-rose-700'
  if (v < 500) return 'text-amber-700'
  return 'text-emerald-700'
}

export function StockMovementsTable({
  rows, actualMonths, forecastMonths, label,
}: {
  rows: StockRow[]
  actualMonths: string[]
  forecastMonths: string[]
  label: (m: string) => string
}) {
  const order = PRODUCT_GROUPS.map((g) => g.value as string)
  const grouped = new Map<string, StockRow[]>()
  for (const r of rows) {
    const key = r.group ?? '__other__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  const totalCols = 2 + actualMonths.length * 4 + forecastMonths.length * 3
  const minWidth = 310 + actualMonths.length * 4 * 62 + forecastMonths.length * 3 * 70

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-210px)]">
        <table className="text-xs tabular-nums border-separate border-spacing-0" style={{ minWidth }}>
          <thead>
            {/* Zone row (sticky top, h-7 = 28px) */}
            <tr>
              <th className="sticky left-0 top-0 z-40 bg-gray-50 h-7" />
              <th className="sticky left-[240px] top-0 z-40 bg-gray-50 border-r-2 border-gray-300 h-7" />
              {actualMonths.length > 0 && (
                <th colSpan={actualMonths.length * 4} className="sticky top-0 z-30 h-7 px-2 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border-b border-gray-200">
                  Actual · real movements
                </th>
              )}
              {forecastMonths.length > 0 && (
                <th colSpan={forecastMonths.length * 3} className="sticky top-0 z-30 h-7 px-2 text-center text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border-b border-gray-200 border-l-2 border-amber-300">
                  Forecast · plan vs demand
                </th>
              )}
            </tr>
            {/* Month row (sticky at 28px, h-7) */}
            <tr className="text-[10px] uppercase tracking-wider text-gray-600">
              <th className="text-left px-3 sticky left-0 top-7 z-40 bg-gray-100 w-[240px] min-w-[240px] h-7">Product</th>
              <th className="text-right px-2 sticky left-[240px] top-7 z-40 bg-gray-100 border-r-2 border-gray-300 w-[70px] h-7">Open</th>
              {actualMonths.map((m) => (
                <th key={m} colSpan={4} className="sticky top-7 z-30 h-7 px-2 text-center font-semibold bg-gray-100 border-l border-gray-200">{label(m)}</th>
              ))}
              {forecastMonths.map((m, i) => (
                <th key={m} colSpan={3} className={`sticky top-7 z-30 h-7 px-2 text-center font-semibold bg-amber-50 ${i === 0 ? 'border-l-2 border-amber-300' : 'border-l border-gray-200'}`}>
                  {label(m)} <span className="text-amber-600 normal-case">· fc</span>
                </th>
              ))}
            </tr>
            {/* Column row (sticky at 56px, h-6 = 24px) */}
            <tr className="text-[9px] uppercase tracking-wide text-gray-500">
              <th className="sticky left-0 top-14 z-40 bg-gray-50 h-6" />
              <th className="sticky left-[240px] top-14 z-40 bg-gray-50 border-r-2 border-gray-300 h-6" />
              {actualMonths.map((m) => (
                <Fragment key={m}>
                  <th className="sticky top-14 z-30 h-6 text-right px-1.5 font-medium text-emerald-700 bg-white border-l border-gray-200">In</th>
                  <th className="sticky top-14 z-30 h-6 text-right px-1.5 font-medium text-blue-700 bg-white">Out</th>
                  <th className="sticky top-14 z-30 h-6 text-right px-1.5 font-medium text-rose-700 bg-white">W/off</th>
                  <th className="sticky top-14 z-30 h-6 text-right px-1.5 font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">EOM</th>
                </Fragment>
              ))}
              {forecastMonths.map((m, i) => (
                <Fragment key={m}>
                  <th className={`sticky top-14 z-30 h-6 text-right px-1.5 font-medium text-emerald-700 bg-amber-50 ${i === 0 ? 'border-l-2 border-amber-300' : 'border-l border-gray-200'}`}>Prod</th>
                  <th className="sticky top-14 z-30 h-6 text-right px-1.5 font-medium text-blue-700 bg-amber-50">Demand</th>
                  <th className="sticky top-14 z-30 h-6 text-right px-1.5 font-semibold text-gray-700 bg-amber-50 border-r border-gray-200">EOM</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={totalCols} className="px-4 py-10 text-center text-sm text-gray-500">
                No stock movements yet. Upload the Inwards Finished Goods sheet to populate arrivals.
              </td></tr>
            )}
            {groupKeys.map((key) => {
              const groupRows = grouped.get(key)!
              const gLabel = key === '__other__' ? 'Other' : (PRODUCT_GROUP_LABELS[key] ?? key)
              return (
                <Fragment key={key}>
                  <tr className="bg-gray-100/80 [&>td]:border-y [&>td]:border-gray-200">
                    <td colSpan={totalCols} className="px-3 py-1.5 sticky left-0 bg-gray-100/80 z-10 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                      {gLabel} <span className="ml-1 normal-case font-normal text-gray-400">{groupRows.length}</span>
                    </td>
                  </tr>
                  {groupRows.map((r) => <LedgerRow key={r.product_id} r={r} actualMonths={actualMonths} forecastMonths={forecastMonths} />)}
                  <SubtotalRow label={`${gLabel} — subtotal`} rows={groupRows} actualMonths={actualMonths} forecastMonths={forecastMonths} />
                </Fragment>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <SubtotalRow label="All products" rows={rows} actualMonths={actualMonths} forecastMonths={forecastMonths} grand />
            </tfoot>
          )}
        </table>
      </div>
      <div className="p-3 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span><b>EOM</b> = opening + inbound − sold/samples − write-offs (carries to next month)</span>
        <span className="text-gray-300">·</span>
        <span className="text-emerald-700">In / Prod</span>
        <span className="text-blue-700">Out / Demand</span>
        <span className="text-rose-700">Write-off</span>
        <span className="ml-auto"><span className="text-rose-700 font-medium">Red EOM</span> = shortfall (stock runs out)</span>
      </div>
    </div>
  )
}

function LedgerRow({ r, actualMonths, forecastMonths }: { r: StockRow; actualMonths: string[]; forecastMonths: string[] }) {
  return (
    <tr className="group hover:bg-gray-50 [&>td]:border-b [&>td]:border-gray-100">
      <td className="px-3 py-2 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
        <div className="font-medium text-gray-900 truncate max-w-[224px]">{r.name}</div>
        <div className="text-[10px] font-mono text-gray-500">{r.sku}</div>
      </td>
      <td className="px-2 py-2 text-right sticky left-[240px] bg-white group-hover:bg-gray-50 z-10 border-r-2 border-gray-300 text-gray-500">{nf(r.opening)}</td>
      {actualMonths.map((m) => {
        const c = r.actual[m] ?? { inbound: 0, outbound: 0, writeoff: 0, eom: 0, receipts: [], toReceipt: [] }
        return (
          <Fragment key={m}>
            <InboundCell value={c.inbound} receipts={c.receipts ?? []} toReceipt={c.toReceipt ?? []} />
            <td className="px-1.5 py-2 text-right text-blue-700">{cell(c.outbound)}</td>
            <td className="px-1.5 py-2 text-right text-rose-700">{cell(c.writeoff)}</td>
            <td className={`px-1.5 py-2 text-right font-semibold bg-gray-50/60 border-r border-gray-100 ${eomClass(c.eom)}`}>{nf(c.eom)}</td>
          </Fragment>
        )
      })}
      {forecastMonths.map((m, i) => {
        const c = r.forecast[m] ?? { produced: 0, demand: 0, eom: 0, shortfall: false, onOrder: [], noPo: false }
        return (
          <Fragment key={m}>
            <td className={`px-1.5 py-2 text-right text-emerald-700 bg-amber-50/20 ${i === 0 ? 'border-l-2 border-amber-200' : 'border-l border-gray-100'}`}>
              {cell(c.produced)}
              {(c.onOrder?.length ?? 0) > 0 && <div><OpenPoChips items={c.onOrder} kind="onorder" /></div>}
              {c.noPo && <div className="mt-0.5 text-[9px] font-bold px-1.5 rounded border bg-amber-50 text-amber-700 border-amber-200 inline-block">⚑ no PO</div>}
            </td>
            <td className="px-1.5 py-2 text-right text-blue-700 bg-amber-50/20">{cell(c.demand)}</td>
            <td className={`px-1.5 py-2 text-right font-semibold bg-amber-50/40 border-r border-gray-100 ${eomClass(c.eom)}`}>
              {c.shortfall ? <span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">{nf(c.eom)}</span> : nf(c.eom)}
            </td>
          </Fragment>
        )
      })}
    </tr>
  )
}

function SubtotalRow({
  label, rows, actualMonths, forecastMonths, grand = false,
}: {
  label: string; rows: StockRow[]; actualMonths: string[]; forecastMonths: string[]; grand?: boolean
}) {
  const sumA = (m: string, k: 'inbound' | 'outbound' | 'writeoff' | 'eom') =>
    rows.reduce((s, r) => s + (r.actual[m]?.[k] ?? 0), 0)
  const sumF = (m: string, k: 'produced' | 'demand' | 'eom') =>
    rows.reduce((s, r) => s + (r.forecast[m]?.[k] ?? 0), 0)
  const bg = grand ? 'bg-gray-100 [&>td]:border-t-2 [&>td]:border-gray-300 text-[12px]' : 'bg-gray-50 [&>td]:border-t [&>td]:border-gray-200 text-[11px]'

  return (
    <tr className={`${bg} font-semibold text-gray-700`}>
      <td className={`px-3 py-2 sticky left-0 z-10 ${grand ? 'bg-gray-100' : 'bg-gray-50'}`}>{label}</td>
      <td className={`px-2 py-2 text-right sticky left-[240px] z-10 border-r-2 border-gray-300 ${grand ? 'bg-gray-100' : 'bg-gray-50'}`}>{nf(rows.reduce((s, r) => s + r.opening, 0))}</td>
      {actualMonths.map((m) => (
        <Fragment key={m}>
          <td className="px-1.5 py-2 text-right text-emerald-700 border-l border-gray-200">{cell(sumA(m, 'inbound'))}</td>
          <td className="px-1.5 py-2 text-right text-blue-700">{cell(sumA(m, 'outbound'))}</td>
          <td className="px-1.5 py-2 text-right text-rose-700">{cell(sumA(m, 'writeoff'))}</td>
          <td className={`px-1.5 py-2 text-right border-r border-gray-200 ${eomClass(sumA(m, 'eom'))}`}>{nf(sumA(m, 'eom'))}</td>
        </Fragment>
      ))}
      {forecastMonths.map((m, i) => (
        <Fragment key={m}>
          <td className={`px-1.5 py-2 text-right text-emerald-700 ${i === 0 ? 'border-l-2 border-amber-300' : 'border-l border-gray-200'}`}>{cell(sumF(m, 'produced'))}</td>
          <td className="px-1.5 py-2 text-right text-blue-700">{cell(sumF(m, 'demand'))}</td>
          <td className={`px-1.5 py-2 text-right border-r border-gray-200 ${eomClass(sumF(m, 'eom'))}`}>{nf(sumF(m, 'eom'))}</td>
        </Fragment>
      ))}
    </tr>
  )
}
