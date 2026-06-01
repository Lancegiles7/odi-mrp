import { monthLabel } from '@/lib/demand'

interface Props {
  months: string[]
  /** For each month: how many entities have demand > 0 that month. */
  totalsByMonth:    Map<string, number>
  /** For each month: how many of those entities are in a 'red' shortfall state. */
  shortByMonth:     Map<string, number>
  /**
   * Column widths to mirror the data table below so the month cells
   * land in the same horizontal positions as the table's month columns.
   * Defaults match the Ingredient demand / Packaging demand tables
   * (Ingredient/Packaging w-[320px] + Opening w-[110px] + 12 × min-w-[72px]
   * + 12-mo total min-w-[90px]).
   */
  leadingWidthPx?:  number
  monthMinPx?:      number
  trailingWidthPx?: number
}

/**
 * Monthly-shortfall strip that sits below the top tiles on the
 * Ingredient demand, Packaging demand and Production pages. The grid
 * template mirrors the underlying data table's columns so the month
 * cells line up vertically with the table's month columns underneath.
 *
 * Server component — purely presentational.
 */
export function MonthlyShortfallStrip({
  months, totalsByMonth, shortByMonth,
  leadingWidthPx  = 430,   // 320 (name) + 110 (opening) on demand pages
  monthMinPx      = 72,
  trailingWidthPx = 90,
}: Props) {
  const gridStyle = {
    gridTemplateColumns: `${leadingWidthPx}px repeat(${months.length}, minmax(${monthMinPx}px, 1fr)) ${trailingWidthPx}px`,
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-gray-500 border-b border-gray-100">
        Shortfalls by month — short / total with demand
      </div>
      <div className="overflow-x-auto">
        <div className="grid" style={gridStyle}>
          {/* leading spacer */}
          <div />
          {months.map((m) => {
            const total = totalsByMonth.get(m) ?? 0
            const short = shortByMonth.get(m) ?? 0
            const isShort = short > 0
            return (
              <div
                key={m}
                className={`px-2 py-1.5 text-center border-l border-gray-100 ${isShort ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'}`}
              >
                <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">{monthLabel(m)}</div>
                <div className={`text-sm font-semibold tabular-nums mt-0.5 ${isShort ? '' : 'opacity-80'}`}>
                  {short}<span className="text-xs opacity-60 font-normal"> / </span>{total}
                </div>
              </div>
            )
          })}
          {/* trailing spacer (12-mo total column) */}
          <div className="border-l border-gray-200 bg-gray-50" />
        </div>
      </div>
    </div>
  )
}
