import { Fragment } from 'react'
import type { FgValueSummary } from '@/lib/stock-movements-data'

const money = (n: number) => (n ? Math.round(n).toLocaleString() : '—')

const METRICS = [
  { key: 'inbound',  label: 'In',           tone: 'text-emerald-700' },
  { key: 'out',      label: 'Out',          tone: 'text-blue-700' },
  { key: 'writeoff', label: 'Write-off',    tone: 'text-rose-700' },
  { key: 'eom',      label: 'End of month', tone: 'text-gray-900 font-semibold' },
] as const

/**
 * Value summary rows, rendered INSIDE the stock movements table so each
 * month's value sits directly above that month's movement columns (and
 * scrolls with them). Each month spans its 4 actual / 3 forecast columns.
 */
export function FgValueSummaryRows({
  summary, actualMonths, forecastMonths, totalCols,
}: {
  summary: FgValueSummary
  actualMonths: string[]
  forecastMonths: string[]
  totalCols: number
}) {
  const months = [
    ...actualMonths.map((m) => ({ m, span: 4, fc: false, first: false })),
    ...forecastMonths.map((m, i) => ({ m, span: 3, fc: true, first: i === 0 })),
  ]
  if (months.length === 0) return null
  const monthBorder = (first: boolean) =>
    first ? 'border-l-2 border-amber-300' : 'border-l border-gray-200'

  return (
    <>
      <tr className="bg-emerald-50/70 [&>td]:border-y [&>td]:border-emerald-100">
        <td colSpan={totalCols} className="px-3 py-1.5 sticky left-0 bg-emerald-50 z-10 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
          Value summary <span className="normal-case font-normal text-emerald-700/70">— NZ$ · cost = full MRP landed (incl. packaging) · AUS converted A$→NZ$</span>
        </td>
      </tr>
      {METRICS.map((metric) => (
        <Fragment key={metric.key}>
          <tr>
            <td className={`sticky left-0 z-10 bg-white px-3 pt-2 pb-0.5 font-medium ${metric.tone}`}>
              {metric.label} <span className="text-[10px] font-normal text-gray-400">cost</span>
            </td>
            <td className="sticky left-[240px] z-10 bg-white border-r-2 border-gray-300" />
            {months.map(({ m, span, fc, first }) => (
              <td key={m} colSpan={span} className={`px-1.5 pt-2 pb-0.5 text-right text-gray-900 ${fc ? 'bg-amber-50/20' : ''} ${monthBorder(first)}`}>
                {money(summary[m]?.[metric.key].cost ?? 0)}
              </td>
            ))}
          </tr>
          <tr className="[&>td]:border-b [&>td]:border-gray-100">
            <td className="sticky left-0 z-10 bg-white px-3 pt-0 pb-2 text-[10px] text-gray-400">RRP ex‑GST</td>
            <td className="sticky left-[240px] z-10 bg-white border-r-2 border-gray-300" />
            {months.map(({ m, span, fc, first }) => (
              <td key={m} colSpan={span} className={`px-1.5 pt-0 pb-2 text-right text-gray-500 ${fc ? 'bg-amber-50/20' : ''} ${monthBorder(first)}`}>
                {money(summary[m]?.[metric.key].rrp ?? 0)}
              </td>
            ))}
          </tr>
        </Fragment>
      ))}
    </>
  )
}
