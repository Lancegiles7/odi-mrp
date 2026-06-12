/**
 * Demand + Production helpers. Pure functions, no DB calls.
 *
 * Month keys are ISO date strings of the first day of the month
 * (e.g. '2026-04-01'), matching the shape stored in year_month columns.
 */

import type {
  DemandChannel,
  DemandForecast,
  ProductionPlan,
} from './types/database.types'
import { PLANNING_MONTHS, NZ_CHANNEL_SET, AUS_CHANNEL_SET } from './constants'

// ============================================================
// Month utilities
// ============================================================

export function monthKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/**
 * Build the rolling N-month window starting from the first of the
 * current month. Returns ISO date strings.
 */
export function rollingMonths(n: number = PLANNING_MONTHS, startFrom?: Date): string[] {
  const start = startFrom ?? new Date()
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1))
    out.push(monthKey(d))
  }
  return out
}

/** Short label for a month key, e.g. '2026-04-01' → 'Apr 26'. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  return `${mon} ${String(y).slice(2)}`
}

// ============================================================
// Demand aggregation
// ============================================================

/**
 * Build a lookup: productId → monthKey → channel → units.
 * Cells absent from the database are treated as 0.
 */
export function indexDemand(
  rows: Pick<DemandForecast, 'product_id' | 'year_month' | 'channel' | 'units' | 'is_edited'>[],
): Map<string, Map<string, Map<DemandChannel, { units: number; edited: boolean }>>> {
  const idx = new Map<string, Map<string, Map<DemandChannel, { units: number; edited: boolean }>>>()
  for (const r of rows) {
    if (!idx.has(r.product_id)) idx.set(r.product_id, new Map())
    const byMonth = idx.get(r.product_id)!
    const key = typeof r.year_month === 'string' ? r.year_month.slice(0, 10) : r.year_month
    if (!byMonth.has(key)) byMonth.set(key, new Map())
    byMonth.get(key)!.set(r.channel as DemandChannel, { units: r.units, edited: !!r.is_edited })
  }
  return idx
}

/** Get demand units for a specific (product, month, channel). Returns 0 if not present. */
export function getDemandCell(
  idx: ReturnType<typeof indexDemand>,
  productId: string,
  month: string,
  channel: DemandChannel,
): { units: number; edited: boolean } {
  return idx.get(productId)?.get(month)?.get(channel) ?? { units: 0, edited: false }
}

/** Sum of all channels (including pipefill) for a given (product, month). */
export function getGrandTotal(
  idx: ReturnType<typeof indexDemand>,
  productId: string,
  month: string,
): number {
  const byCh = idx.get(productId)?.get(month)
  if (!byCh) return 0
  let s = 0
  for (const v of byCh.values()) s += v.units
  return s
}

/** Sum of one country's channels for a given (product, month). Used to route a
 *  dual-build product's demand into the right recipe (NZ → Brand Nation, AU →
 *  VMC). `country` is 'NZ' or 'AUS' (matching ChannelCountry). */
export function getCountryTotal(
  idx: ReturnType<typeof indexDemand>,
  productId: string,
  month: string,
  country: 'NZ' | 'AUS',
): number {
  const byCh = idx.get(productId)?.get(month)
  if (!byCh) return 0
  const set = country === 'AUS' ? AUS_CHANNEL_SET : NZ_CHANNEL_SET
  let s = 0
  byCh.forEach((v, ch) => { if (set.has(ch as string)) s += v.units })
  return s
}

// ============================================================
// Production aggregation
// ============================================================

export function indexProduction(
  rows: Pick<ProductionPlan, 'product_id' | 'year_month' | 'units_planned'>[],
): Map<string, Map<string, number>> {
  const idx = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!idx.has(r.product_id)) idx.set(r.product_id, new Map())
    const key = typeof r.year_month === 'string' ? r.year_month.slice(0, 10) : r.year_month
    idx.get(r.product_id)!.set(key, r.units_planned)
  }
  return idx
}

export function getProductionCell(
  idx: ReturnType<typeof indexProduction>,
  productId: string,
  month: string,
): number {
  return idx.get(productId)?.get(month) ?? 0
}

// ============================================================
// Rolling balance calc
//   balance[m] = (m == first ? opening : balance[m-1]) + production[m] - forecast[m]
// ============================================================

export type ShortfallState = 'ok' | 'amber' | 'red'

export interface MonthRow {
  month: string
  forecast: number
  production: number
  balance: number
  shortfall: boolean        // back-compat: true iff state === 'red'
  state: ShortfallState     // 'red' = bal < 0; 'amber' = production this month saved a would-be shortfall; 'ok' otherwise
  shortAmount: number       // units short THIS month: max(0, forecast − (max(0, carried) + production))
}

export function calcRollingBalance(
  months: string[],
  opening: number,
  forecastByMonth: (m: string) => number,
  productionByMonth: (m: string) => number,
): MonthRow[] {
  const out: MonthRow[] = []
  let bal = opening
  for (const m of months) {
    const f = forecastByMonth(m)
    const p = productionByMonth(m)
    const carried   = bal                  // balance before this month's production / forecast applied
    const available = Math.max(0, carried) + p
    const shortAmount = Math.max(0, f - available)
    bal = bal + p - f
    // 'amber' = production this month saved a would-be shortfall AND the
    // resulting buffer is thin (less than one month's forecast). A
    // production run that lands with a comfortable buffer (>= 1 month's
    // forecast) stays neutral — no need to flag.
    let state: ShortfallState = 'ok'
    if (bal < 0) state = 'red'
    else if (carried - f < 0 && f > 0 && bal < f) state = 'amber'
    out.push({
      month:       m,
      forecast:    f,
      production:  p,
      balance:     bal,
      shortfall:   state === 'red',
      state,
      shortAmount,
    })
  }
  return out
}

/** Resolve opening stock: manual override takes precedence over inventory_balances. */
export function resolveOpeningStock(
  override: number | null | undefined,
  inventoryQtyOnHand: number | null | undefined,
): number {
  if (override != null) return Number(override)
  if (inventoryQtyOnHand != null) return Number(inventoryQtyOnHand)
  return 0
}
