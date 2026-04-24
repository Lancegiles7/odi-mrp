import type { IngredientPriceHistory } from '@/lib/types/database.types'
import { formatDate, formatCurrency } from '@/lib/utils'

const REASON_LABELS: Record<string, string> = {
  initial:       'Initial',
  manual_update: 'Manual update',
  import:        'Import',
  po_received:   'PO receipt',
  correction:    'Correction',
}

interface Props {
  history: IngredientPriceHistory[]        // newest first
}

/**
 * Renders a small sparkline of total_loaded_cost over time plus a
 * chronological table. Pure SVG — no chart library.
 */
export function PriceHistory({ history }: Props) {
  if (history.length === 0) {
    return <p className="text-sm text-gray-500">No price changes recorded yet.</p>
  }

  // Oldest → newest for the chart
  const series = [...history].reverse()
  const values = series.map((h) => Number(h.total_loaded_cost ?? 0))
  const max    = Math.max(...values, 1)
  const min    = Math.min(...values, 0)
  const range  = max - min || 1

  // Map each point to SVG x,y in a viewBox of 400×90 with 5px padding
  const w = 400
  const h = 90
  const pad = 5
  const points = series.map((row, i) => {
    const x = series.length === 1 ? w / 2 : pad + (i / (series.length - 1)) * (w - pad * 2)
    const v = Number(row.total_loaded_cost ?? 0)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return { x, y }
  })

  const linePath  = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath  = `${linePath} L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`

  // Year-on-year delta on latest row vs previous
  const latest = history[0]
  const prev   = history[1]
  const delta  =
    prev && latest.total_loaded_cost != null && prev.total_loaded_cost != null
      ? Number(latest.total_loaded_cost) - Number(prev.total_loaded_cost)
      : null
  const deltaPct =
    prev && prev.total_loaded_cost
      ? ((Number(latest.total_loaded_cost ?? 0) - Number(prev.total_loaded_cost)) /
          Number(prev.total_loaded_cost)) *
        100
      : null

  return (
    <div className="space-y-5">
      {/* Sparkline */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Total loaded cost trend
          </h3>
          {delta !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              delta > 0 ? 'bg-red-50 text-red-700'
              : delta < 0 ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
            }`}>
              {delta > 0 ? '+' : ''}{formatCurrency(delta)}
              {deltaPct !== null ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}
            </span>
          )}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]" preserveAspectRatio="none">
          <path d={areaPath} fill="#11182710" />
          <path d={linePath} fill="none" stroke="#111827" strokeWidth="1.5" />
        </svg>
        <div className="flex justify-between text-[11px] text-gray-500 mt-1">
          <span>{formatDate(series[0]?.changed_at)}</span>
          <span>{formatDate(series[series.length - 1]?.changed_at)}</span>
        </div>
      </div>

      {/* Ledger */}
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-right px-4 py-2 font-medium">Price</th>
              <th className="text-right px-4 py-2 font-medium">Freight</th>
              <th className="text-right px-4 py-2 font-medium">Total loaded</th>
              <th className="text-right px-4 py-2 font-medium">Δ vs prev</th>
              <th className="text-left px-4 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map((row, i) => {
              const prevRow = history[i + 1]
              const d = prevRow && prevRow.total_loaded_cost != null && row.total_loaded_cost != null
                ? Number(row.total_loaded_cost) - Number(prevRow.total_loaded_cost)
                : null
              return (
                <tr key={row.id} className={i === 0 ? 'bg-amber-50/30' : ''}>
                  <td className="px-4 py-2">{formatDate(row.changed_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.price != null ? formatCurrency(row.price) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.freight != null ? formatCurrency(row.freight) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${i === 0 ? 'font-semibold' : ''}`}>
                    {row.total_loaded_cost != null ? formatCurrency(row.total_loaded_cost) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums text-xs ${
                    d === null ? 'text-gray-400' : d > 0 ? 'text-red-700' : d < 0 ? 'text-green-700' : 'text-gray-500'
                  }`}>
                    {d === null ? 'Initial' : `${d > 0 ? '+' : ''}${formatCurrency(d)}`}
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {REASON_LABELS[row.change_reason] ?? row.change_reason}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
