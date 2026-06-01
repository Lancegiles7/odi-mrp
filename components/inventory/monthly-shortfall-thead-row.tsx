import { monthLabel } from '@/lib/demand'

interface Props {
  months: string[]
  /** Number of entities IN THIS GROUP with demand > 0 each month. */
  totalsByMonth: Map<string, number>
  /** Number of those in 'red' shortfall state each month. */
  shortByMonth:  Map<string, number>
  /** Columns the leading title cell should span. (Packaging + Opening = 2; Product + Mfr + Opening = 3, etc.) */
  leadingColSpan: number
  /** Columns each month cell spans. 1 on demand pages; 3 on Production for Fcst/Prod/Bal sub-cols. */
  monthColSpan?:    number
  /** Columns the trailing cell should span. 1 for demand pages' 12-mo total + total shortfall; 0 when no trailing cols. */
  trailingColSpan?: number
  /** Sticky-left for Production's pinned Product column. */
  stickyLeading?:   boolean
}

/**
 * Renders as a <tr> ready to drop into a table's <thead>. Sharing the
 * data table's <colgroup> / column widths guarantees the strip's month
 * cells sit directly above the table's month columns. Counts are
 * per-group — each accordion's strip is for that group only.
 */
export function MonthlyShortfallTheadRow({
  months, totalsByMonth, shortByMonth,
  leadingColSpan, monthColSpan = 1, trailingColSpan = 0, stickyLeading = false,
}: Props) {
  return (
    <tr className="bg-gray-50 border-b border-gray-200">
      <th
        colSpan={leadingColSpan}
        className={`text-left text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 py-1.5 ${stickyLeading ? 'sticky left-0 bg-gray-50 z-10' : ''}`}
      >
        Shortfalls by month
        <span className="ml-1 normal-case tracking-normal text-gray-400 font-normal">— short / total with demand</span>
      </th>
      {months.map((m) => {
        const total = totalsByMonth.get(m) ?? 0
        const short = shortByMonth.get(m) ?? 0
        const isShort = short > 0
        return (
          <th
            key={m}
            colSpan={monthColSpan}
            className={`text-center px-2 py-1.5 border-l border-gray-200 font-normal ${isShort ? 'bg-red-50 text-red-700' : 'text-gray-600'}`}
          >
            <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">{monthLabel(m)}</div>
            <div className={`text-sm font-semibold tabular-nums mt-0.5 ${isShort ? '' : 'opacity-80'}`}>
              {short}<span className="text-xs opacity-60 font-normal"> / </span>{total}
            </div>
          </th>
        )
      })}
      {trailingColSpan > 0 && (
        <th colSpan={trailingColSpan} className="bg-gray-100 border-l border-gray-200" />
      )}
    </tr>
  )
}
