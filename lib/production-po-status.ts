/**
 * Purchase-order cover for the Production schedule.
 *
 * For every (product, build market, month) this sums the finished-goods PO
 * quantity due that month — month taken from the PO's expected delivery date —
 * so each planned production cell can show whether a PO is in for it:
 *   green  = a sent PO matches the planned qty (within rounding tolerance)
 *   amber  = a sent PO is in but for a different qty (difference shown)
 *   grey   = only a draft PO so far
 *   white  = no PO
 * Transfers and cancelled POs are ignored. Quantity is the full amount
 * ordered (not what's left to receive) because the plan is the full run.
 */
export interface PoCoverRef {
  po: string
  supplier: string | null
  status: string
  expected: string
  units: number
}

export interface PoCover {
  /** Sum ordered on submitted / partially received / received POs. */
  firm: number
  /** Sum ordered on draft POs. */
  draft: number
  refs: PoCoverRef[]
}

/** market → product_id → month (YYYY-MM-01) → cover */
export type PoCoverIndex = Record<'NZ' | 'AU', Map<string, Map<string, PoCover>>>

export type PoCoverState = 'none' | 'match' | 'diff' | 'draft'

/** Differences within 1% of the planned qty count as a match (carton rounding). */
export const PO_MATCH_TOLERANCE = 0.01

export function poCoverState(planned: number, cover: PoCover | undefined): PoCoverState {
  if (!cover || (cover.firm <= 0 && cover.draft <= 0)) return 'none'
  if (cover.firm <= 0) return 'draft'
  if (planned > 0 && Math.abs(cover.firm - planned) <= planned * PO_MATCH_TOLERANCE) return 'match'
  return 'diff'
}

/** Combine the cover for several markets (a single-line product carries both). */
export function coverFor(idx: PoCoverIndex, productId: string, markets: Array<'NZ' | 'AU'>, months: string[]): Record<string, PoCover> {
  const res: Record<string, PoCover> = {}
  for (const month of months) {
    let merged: PoCover | null = null
    for (const mk of markets) {
      const c = idx[mk].get(productId)?.get(month)
      if (!c) continue
      merged = merged
        ? { firm: merged.firm + c.firm, draft: merged.draft + c.draft, refs: [...merged.refs, ...c.refs] }
        : { ...c, refs: [...c.refs] }
    }
    if (merged) res[month] = merged
  }
  return res
}
