import { monthLabel } from '@/lib/demand'

interface Props {
  months: string[]
  totalsByMonth: Map<string, number>
  shortByMonth:  Map<string, number>
}

/**
 * Page-level "shortfalls by month" summary. Sits above the accordion
 * tables as a standalone card. Each month is a pill showing
 * "<short> / <total with demand>" — red when any shortfall, neutral
 * when clean. Doesn't try to column-align with the data tables below;
 * the tables own their own column layouts.
 *
 * Server component — purely presentational.
 */
export function MonthlyShortfallStrip({ months, totalsByMonth, shortByMonth }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
        Shortfalls by month
        <span className="ml-1 text-[10px] normal-case tracking-normal text-gray-400 font-normal">
          — short / total with demand · totals across the page
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
