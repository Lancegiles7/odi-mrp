import { monthLabel } from '@/lib/demand'

interface Props {
  months: string[]
  /** For each month: how many entities have demand > 0 that month. */
  totalsByMonth:    Map<string, number>
  /** For each month: how many of those entities are in a 'red' shortfall state. */
  shortByMonth:     Map<string, number>
}

/**
 * 12-column strip surfaced under the top summary tiles on Ingredient
 * demand, Packaging demand, and Production. Reads at a glance which
 * months are clean and which are short. Polymorphic — the page
 * computes its own totals/shorts maps and hands them in.
 *
 * Server component — purely presentational.
 */
export function MonthlyShortfallStrip({ months, totalsByMonth, shortByMonth }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center justify-between mb-1.5">
        <span>Shortfalls by month — short / total with demand</span>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {months.map((m) => {
          const total = totalsByMonth.get(m) ?? 0
          const short = shortByMonth.get(m) ?? 0
          const isShort = short > 0
          return (
            <div
              key={m}
              className={`rounded text-center px-1.5 py-1.5 ${isShort ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}
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
