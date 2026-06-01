import { monthLabel } from '@/lib/demand'

interface Props {
  months: string[]
  totalsByMonth:    Map<string, number>
  shortByMonth:     Map<string, number>
  /**
   * Widths (px) of the leading column(s) before the month columns,
   * matching the data table below 1-for-1. The strip renders a single
   * cell that spans all of these (with the title inside), so the
   * column boundaries match the data table exactly.
   *
   * Defaults match Ingredient demand / Packaging demand (Packaging 320 + Opening 110).
   */
  leadingColWidths?:  number[]
  /** Min width applied to each month col — should match the table. */
  monthMinPx?:        number
  /** Width of the trailing column (e.g. 12-mo total). 0 = no trailing column. */
  trailingWidthPx?:   number
}

/**
 * Monthly-shortfall strip rendered as a real <table> with a <colgroup>
 * that mirrors the data table directly below. Because both tables
 * share the same column-sizing semantics and identical column widths,
 * the strip's month cells line up vertically with the table's month
 * columns underneath.
 *
 * Server component — purely presentational.
 */
export function MonthlyShortfallStrip({
  months, totalsByMonth, shortByMonth,
  leadingColWidths = [320, 110],
  monthMinPx       = 72,
  trailingWidthPx  = 90,
}: Props) {
  const leadingSum = leadingColWidths.reduce((a, b) => a + b, 0)
  const minWidth   = leadingSum + months.length * monthMinPx + trailingWidthPx
  const hasTrailing = trailingWidthPx > 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth }}>
          <colgroup>
            {leadingColWidths.map((w, i) => (
              <col key={`lead-${i}`} style={{ width: `${w}px`, minWidth: `${w}px` }} />
            ))}
            {months.map((m) => (
              <col key={m} style={{ minWidth: `${monthMinPx}px` }} />
            ))}
            {hasTrailing && <col style={{ width: `${trailingWidthPx}px`, minWidth: `${trailingWidthPx}px` }} />}
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={leadingColWidths.length} className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500 align-middle">
                Shortfalls by month
                <div className="text-[9px] normal-case tracking-normal text-gray-400 font-normal mt-0.5">short / total with demand</div>
              </td>
              {months.map((m) => {
                const total = totalsByMonth.get(m) ?? 0
                const short = shortByMonth.get(m) ?? 0
                const isShort = short > 0
                return (
                  <td
                    key={m}
                    className={`px-2 py-1.5 text-center border-l border-gray-100 ${isShort ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'}`}
                  >
                    <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">{monthLabel(m)}</div>
                    <div className={`text-sm font-semibold tabular-nums mt-0.5 ${isShort ? '' : 'opacity-80'}`}>
                      {short}<span className="text-xs opacity-60 font-normal"> / </span>{total}
                    </div>
                  </td>
                )
              })}
              {hasTrailing && <td className="border-l border-gray-200 bg-gray-50" />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
