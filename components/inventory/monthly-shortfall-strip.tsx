import { monthLabel } from '@/lib/demand'

interface Props {
  months: string[]
  totalsByMonth: Map<string, number>
  shortByMonth:  Map<string, number>
}

/**
 * Page-level "shortfalls by month" overview. Renders as an evenly
 * spaced row of month pills — each pill shows the short / total
 * count for that month, red when any shortfall, neutral when clean.
 *
 * Earlier versions tried to align column-for-column with the data
 * tables below, but the column widths on Production (and to a lesser
 * extent on Demand) are content-driven and drift. The pill layout
 * sidesteps the problem: it reads as a standalone summary and lets
 * each table own its own column layout.
 *
 * Server component — purely presentational.
 */
export function MonthlyShortfallStrip({ months, totalsByMonth, shortByMonth }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
        Shortfalls by month
        <span className="ml-1 text-[10px] normal-case tracking-normal text-gray-400 font-normal">
          — short / total with demand
        </span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(64px, 1fr))` }}>
        {months.map((m) => {
          const total = totalsByMonth.get(m) ?? 0
          const short = shortByMonth.get(m) ?? 0
          const isShort = short > 0
          return (
            <div
              key={m}
              className={`rounded px-1.5 py-1.5 text-center ${isShort ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}
            >
              <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">{monthLabel(m)}</div>
              <div className={`text-sm font-semibold tabular-nums mt-0.5 ${isShort ? '' : 'opacity-80'}`}>
                {short}<span className="text-xs opacity-60 font-normal"> / </span>{total}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
