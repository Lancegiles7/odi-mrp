import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import {
  fieldLabel, fmtAmount, fmtPct, pctChange, isBaseline, changeTone,
  type PriceChange,
} from '@/lib/price-history'

interface Props {
  history: PriceChange[]                       // newest first
  /** Which field drives the trend line. Defaults to the most-changed field. */
  trendField?: string
  namesByUser?: Record<string, string>
  /** Shown when there's nothing yet — tells the reader why, not just "no data". */
  emptyHint?: string
}

/**
 * One item's price history: a trend line for the headline field, then the
 * full ledger of every change. Used on ingredient, packaging and product
 * pages so the three read identically.
 */
export function PriceHistoryPanel({ history, trendField, namesByUser = {}, emptyHint }: Props) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {emptyHint ?? 'No price changes recorded yet — the log starts from the first change after 9 Sep 2026.'}
      </p>
    )
  }

  // Trend follows whichever field moved most often, unless one was named.
  const counts = history.reduce<Record<string, number>>((acc, h) => {
    acc[h.field] = (acc[h.field] ?? 0) + 1
    return acc
  }, {})
  const field = trendField ?? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]

  const series = history.filter((h) => h.field === field && h.new_value != null).reverse()
  const currency = series[0]?.currency ?? null

  return (
    <div className="space-y-5">
      {series.length > 1 && <Trend series={series} field={field} currency={currency} />}

      <div className="border border-gray-200 rounded-md overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">What changed</th>
              <th className="text-right px-3 py-2 font-medium">From</th>
              <th className="text-right px-3 py-2 font-medium">To</th>
              <th className="text-right px-3 py-2 font-medium w-[80px]">Change</th>
              <th className="text-left px-4 py-2 font-medium">Reason</th>
              <th className="text-left px-4 py-2 font-medium">Who</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map((row, i) => {
              const pct = pctChange(row)
              return (
                <tr key={row.id} className={i === 0 ? 'bg-amber-50/30' : ''}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(row.changed_at)}</td>
                  <td className="px-3 py-2 text-gray-700">{fieldLabel(row.field)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {isBaseline(row)
                      ? <span className="text-gray-300">—</span>
                      : row.old_text ?? fmtAmount(row.old_value, row.currency)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${i === 0 ? 'font-semibold' : ''}`}>
                    {row.new_text ?? fmtAmount(row.new_value, row.currency)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums text-xs ${changeTone(row.field, pct)}`}>
                    {isBaseline(row) ? <span className="text-gray-400">opening</span> : fmtPct(pct)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {row.reason ?? <span className="text-gray-300 italic">not given</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {row.changed_by ? (namesByUser[row.changed_by] ?? 'Unknown user') : <span className="text-gray-400">System</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        Landed cost isn&rsquo;t logged here — it moves whenever the exchange rate does. This is the price as entered.
        <Link href="/price-changes" className="text-blue-600 hover:underline ml-1">See all price changes</Link>
      </p>
    </div>
  )
}

/** Sparkline for one field. Pure SVG — no chart library. */
function Trend({ series, field, currency }: { series: PriceChange[]; field: string; currency: string | null }) {
  const values = series.map((h) => Number(h.new_value))
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 400, h = 80, pad = 6

  const pts = values.map((v, i) => ({
    x: series.length === 1 ? w / 2 : pad + (i / (series.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`

  const first = values[0], last = values[values.length - 1]
  const pct = first ? (last - first) / first : null
  const tone = changeTone(field, pct)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          {fieldLabel(field)} over time
        </h3>
        {pct !== null && (
          <span className={`text-xs font-medium ${tone}`}>
            {fmtAmount(first, currency)} → {fmtAmount(last, currency)} ({fmtPct(pct)})
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[80px]" preserveAspectRatio="none">
        <path d={area} fill="#11182710" />
        <path d={line} fill="none" stroke="#111827" strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between text-[11px] text-gray-500 mt-1">
        <span>{formatDate(series[0].changed_at)}</span>
        <span>{formatDate(series[series.length - 1].changed_at)}</span>
      </div>
    </div>
  )
}
