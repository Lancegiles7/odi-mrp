/**
 * Stock lock helpers.
 *
 * A single setting, `stock_locked_through` (first day of the last locked month,
 * e.g. '2026-09-01'), freezes all finished-goods stock data on or before that
 * month. Bulk imports and month-level edits skip locked months; later months
 * behave normally. NULL = nothing locked.
 */

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Normalise a month/date string to 'yyyy-mm' for comparison. */
const ym = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 7) : null)

/** True when `month` is on or before the lock month (i.e. frozen). */
export function isMonthLocked(
  month: string | null | undefined,
  lockedThrough: string | null | undefined,
): boolean {
  const m = ym(month), lock = ym(lockedThrough)
  if (!m || !lock) return false
  return m <= lock
}

/** Human label for the lock month, e.g. '2026-09-01' → 'Sep 2026'. */
export function lockLabel(lockedThrough: string | null | undefined): string | null {
  const m = ym(lockedThrough)
  if (!m) return null
  const [y, mo] = m.split('-').map(Number)
  return `${MON3[mo - 1] ?? '?'} ${y}`
}
