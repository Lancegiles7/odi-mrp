/**
 * Production auto-planner — suggests production per product per month from a
 * per-manufacturer methodology, run forward month by month off the opening stock.
 *
 *  • cover makers (I Eat Fresh, Radix, VMC, Brand Nation): a delivery in month M
 *    tops stock up to a target of weighted forward cover (e.g. next month 100% +
 *    the one after 75%), rounded up. Brand Nation runs one month further ahead.
 *  • batch makers (Flavour Makers pouches, Almighty Snacks): produce a fixed run
 *    (MOQ) per flavour when cover drops below ~1 month.
 *
 * Suggestions only fill months from `fromMonth` on; earlier months keep their
 * existing plan, and any month already covered by a firm PO is left untouched
 * (so we never re-order what's already committed).
 */

export type Methodology =
  | { kind: 'cover'; weights: number[]; roundTo: number }   // weights for months M+1, M+2, …
  | { kind: 'batch'; batch: number }                        // fixed run size per flavour (MOQ)

/** Methodology per maker name (matches products.manufacturer / manufacturer_au). */
export const METHODOLOGY_BY_MAKER: Record<string, Methodology> = {
  'I Eat Fresh':     { kind: 'cover', weights: [1, 0.75], roundTo: 100 },
  'I Eat Fresh AUS': { kind: 'cover', weights: [1, 0.75], roundTo: 100 },
  'Radix':           { kind: 'cover', weights: [1, 0.75], roundTo: 100 },
  'VMC':             { kind: 'cover', weights: [1, 1, 0.75], roundTo: 100 },  // placeholder — see note
  'Brand Nation':    { kind: 'cover', weights: [1, 1, 0.75], roundTo: 100 },  // one month further ahead
  'Flavour Makers':  { kind: 'batch', batch: 30000 },   // pouches: MOQ 20k, target ~30k per flavour
  'Almighty Snacks': { kind: 'batch', batch: 20000 },   // puffs/melts: 20k MOQ per flavour
}
// VMC follows I Eat Fresh (next month 100% + 75%); set explicitly so it's clear.
METHODOLOGY_BY_MAKER['VMC'] = { kind: 'cover', weights: [1, 0.75], roundTo: 100 }

export function methodologyFor(maker: string | null): Methodology | null {
  if (!maker) return null
  return METHODOLOGY_BY_MAKER[maker.trim()] ?? null
}

/** Short human description of a maker's rule, for the dialog. */
export function methodologyLabel(m: Methodology): string {
  if (m.kind === 'batch') return `Runs of ${m.batch.toLocaleString()} per flavour when cover drops below ~1 month`
  const parts = m.weights.map((w, i) => `${w === 1 ? '100%' : `${Math.round(w * 100)}%`} of month +${i + 1}`)
  return `Cover ${parts.join(' + ')}, rounded up to ${m.roundTo}`
}

export interface SuggestInput {
  opening: number
  months: string[]                       // every planning month, in order (YYYY-MM-01)
  forecast: Record<string, number>
  existingPlan: Record<string, number>
  firmPo: Record<string, number>         // firm (non-draft) PO cover per month
  transfers: Record<string, number>      // net NZ↔AU transfer per month (+in / −out)
  fromMonth: string                      // suggest from this month on (e.g. '2026-12-01')
}

export interface SuggestCell { suggested: number; closing: number; kept: boolean }

/** Suggested production per month (+ the resulting closing balance) for one product. */
export function suggestProduction(cfg: Methodology, inp: SuggestInput): Record<string, SuggestCell> {
  const fc = (m: string | undefined) => (m ? (inp.forecast[m] ?? 0) : 0)
  const out: Record<string, SuggestCell> = {}
  let bal = inp.opening
  for (let i = 0; i < inp.months.length; i++) {
    const m = inp.months[i]
    const demand = fc(m)
    const tr = inp.transfers[m] ?? 0
    let suggested: number
    let kept = false
    if (m < inp.fromMonth) {
      suggested = inp.existingPlan[m] ?? 0            // history / pre-window — unchanged
      kept = true
    } else if ((inp.firmPo[m] ?? 0) > 0) {
      suggested = inp.existingPlan[m] ?? 0            // already ordered — net off, leave as is
      kept = true
    } else if (cfg.kind === 'cover') {
      let target = 0
      for (let k = 0; k < cfg.weights.length; k++) target += cfg.weights[k] * fc(inp.months[i + 1 + k])
      const need = target + demand - bal - tr
      suggested = need > 0 ? Math.ceil(need / cfg.roundTo) * cfg.roundTo : 0
    } else {
      // batch: if stock entering the month is below ~1 month's demand, run a batch.
      const entering = bal + tr
      suggested = entering < demand && demand > 0 ? cfg.batch : 0
    }
    bal = bal + suggested + tr - demand
    out[m] = { suggested, closing: Math.round(bal), kept }
  }
  return out
}
