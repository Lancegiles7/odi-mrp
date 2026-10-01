import { Fragment } from 'react'
import type { FgValueSummary } from '@/lib/stock-movements-data'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
const money = (n: number) => (n ? `NZ$${Math.round(n).toLocaleString()}` : '—')

const METRICS = [
  { key: 'inbound',  label: 'In',           tone: 'text-emerald-700' },
  { key: 'out',      label: 'Out',          tone: 'text-blue-700' },
  { key: 'writeoff', label: 'Write-off',    tone: 'text-rose-700' },
  { key: 'eom',      label: 'End of month', tone: 'text-gray-900 font-semibold' },
] as const

export function FgValueSummaryCard({ summary, months }: { summary: FgValueSummary; months: string[] }) {
  if (months.length === 0) return null
  return (
    <details open className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <summary className="list-none cursor-pointer px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
        <span className="text-sm font-semibold text-gray-800">
          Value summary <span className="text-gray-400">— NZ$</span>
          <span className="ml-2 text-[11px] font-normal text-gray-400">per month · cost = full MRP landed (incl. packaging) · AUS converted A$→NZ$</span>
        </span>
        <span className="text-gray-400 text-xs">▾</span>
      </summary>
      <div className="border-t border-gray-100 overflow-x-auto">
        <table className="text-xs tabular-nums border-separate border-spacing-0" style={{ minWidth: 240 + months.length * 96 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-r border-gray-200 w-[200px] min-w-[200px]">Metric</th>
              {months.map((m, i) => (
                <th key={m} className={`px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-50 border-b border-gray-200 ${i > 0 ? 'border-l border-emerald-100' : ''}`}>{label(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <Fragment key={metric.key}>
                <tr>
                  <td className={`sticky left-0 z-10 bg-white px-3 pt-2 pb-0.5 border-r border-gray-100 font-medium ${metric.tone}`}>
                    {metric.label} <span className="text-[10px] font-normal text-gray-400">cost</span>
                  </td>
                  {months.map((m) => (
                    <td key={m} className="px-3 pt-2 pb-0.5 text-right text-gray-900">{money(summary[m]?.[metric.key].cost ?? 0)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-10 bg-white px-3 pt-0 pb-2 border-r border-b border-gray-100 text-[10px] text-gray-400">RRP ex‑GST</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 pt-0 pb-2 text-right text-gray-500 border-b border-gray-100">{money(summary[m]?.[metric.key].rrp ?? 0)}</td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
