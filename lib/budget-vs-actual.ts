/**
 * Budget vs Actual — pure calculation helpers.
 *
 * Stock model per (entity, year_month):
 *
 *   opening   = (FY-start month) monthly_stock_counts.opening_soh,
 *               OR products.current_soh / ingredient/packaging current_soh
 *               OR (M+1) prior month's effective EOM
 *
 *   total_out = (products) Σ channels of product_actuals.units
 *               (ingredients/packaging) override_units
 *                 OR Σ across products of (product total_out × BOM qty)
 *
 *   receipts  = Σ stock_movements with movement_type IN ('purchase_received',
 *               'opening_balance', 'transfer_in') AND created_at in month
 *
 *   calc_eom        = opening + receipts − total_out
 *   counted_eom     = monthly_stock_counts.counted_eom (manual)
 *   effective_eom   = counted_eom IF set, ELSE calc_eom
 *
 * Variance reads:
 *   var_sales = (retail + d2c) − budget    // sales-only beat/miss
 *   var_total = total_out − budget         // includes samples; for stock math
 */

export type EntityType = 'product' | 'ingredient' | 'packaging'
export type Channel = 'nz_retail' | 'nz_d2c' | 'nz_samples' | 'au_retail' | 'au_d2c' | 'au_samples'

export const NZ_CHANNELS: Channel[] = ['nz_retail', 'nz_d2c', 'nz_samples']
export const AU_CHANNELS: Channel[] = ['au_retail', 'au_d2c', 'au_samples']
export const SALES_CHANNELS: Channel[] = ['nz_retail', 'nz_d2c', 'au_retail', 'au_d2c']  // excludes samples
export const ALL_CHANNELS: Channel[] = [...NZ_CHANNELS, ...AU_CHANNELS]

export const CHANNEL_LABELS: Record<Channel, string> = {
  nz_retail:  'NZ Retail',
  nz_d2c:     'NZ D2C',
  nz_samples: 'NZ Samples',
  au_retail:  'AU Retail',
  au_d2c:     'AU D2C',
  au_samples: 'AU Samples',
}

// ============================================================
// Date helpers
// ============================================================

/** Returns the FY-start month (April 1) for the FY containing the given date.
 *  E.g. 2026-05-09 → 2026-04-01. 2026-02-15 → 2025-04-01. */
export function fyStartFor(date: Date): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const startYear = m >= 3 ? y : y - 1   // April = month index 3
  return `${startYear}-04-01`
}

/** Returns 12 month-keys (YYYY-MM-01) starting at the FY-start month. */
export function fyMonths(fyStart: string): string[] {
  const [yStr, mStr] = fyStart.split('-')
  const y = Number(yStr); const m = Number(mStr)
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const month = ((m - 1 + i) % 12) + 1
    const year  = y + Math.floor((m - 1 + i) / 12)
    out.push(`${year}-${String(month).padStart(2, '0')}-01`)
  }
  return out
}

/** Returns FY label string e.g. "FY 2026/27". */
export function fyLabel(fyStart: string): string {
  const y = Number(fyStart.slice(0, 4))
  return `FY ${y}/${String((y + 1) % 100).padStart(2, '0')}`
}

/** "2026-04-01" → "Apr 26". */
export function shortMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1]} ${y.slice(2)}`
}

/** Add N months to a YYYY-MM-01 string. */
export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

/** YYYY-MM-01 of a year_month (db dates may come back as Date objects). */
export function ymKey(d: string | Date | null | undefined): string | null {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// ============================================================
// Variance + thresholds
// ============================================================

export type VarSeverity = 'none' | 'amber' | 'red'

/** 0–10% = none, 10–25% = amber, >25% = red. */
export function varSeverity(actual: number, budget: number): VarSeverity {
  if (budget === 0) return actual === 0 ? 'none' : 'red'
  const pct = Math.abs((actual - budget) / budget)
  if (pct < 0.10) return 'none'
  if (pct < 0.25) return 'amber'
  return 'red'
}

/** Tailwind class pair (text + bg) for a variance badge. */
export function varBadgeClass(actual: number, budget: number): string {
  const sev = varSeverity(actual, budget)
  const positive = actual >= budget
  if (sev === 'none')  return 'bg-gray-100 text-gray-600'
  if (sev === 'amber') return positive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
  // red
  return positive ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-100 text-rose-800'
}

// ============================================================
// Aggregation helpers (called by server pages, given pre-fetched data)
// ============================================================

export interface ActualsByChannel { [productId: string]: { [channel: string]: number } }
export interface OpeningSoh { [entityId: string]: number | null }
export interface CountedEoms { [entityId: string]: number | null }
export interface BudgetByProduct { [productId: string]: number }

export interface ProductRow {
  product_id: string
  sku: string
  name: string
  opening: number | null
  /** Budget by channel (mapped from demand_forecasts: ecomm→d2c, pipefill→samples). */
  budget_by_channel: Record<Channel, number>
  /** Sum of all channel budgets. */
  budget_total: number
  /** Sum of D2C + Retail budgets (excludes pipefill/samples). */
  budget_sales: number
  /** Actual units by channel (from product_actuals). */
  channels: Record<Channel, number>
  total_out: number
  total_sales: number   // (retail + d2c) NZ + AU
  receipts: number
  calc_eom: number | null
  counted_eom: number | null
  effective_eom: number | null
  stock_variance: number | null  // counted − calc (only when counted is set)
}

const ZERO_BY_CHANNEL: Record<Channel, number> = {
  nz_retail: 0, nz_d2c: 0, nz_samples: 0, au_retail: 0, au_d2c: 0, au_samples: 0,
}

function fillChannels(partial: Partial<Record<Channel, number>>): Record<Channel, number> {
  return {
    nz_retail:  partial.nz_retail  ?? 0,
    nz_d2c:     partial.nz_d2c     ?? 0,
    nz_samples: partial.nz_samples ?? 0,
    au_retail:  partial.au_retail  ?? 0,
    au_d2c:     partial.au_d2c     ?? 0,
    au_samples: partial.au_samples ?? 0,
  }
}

export function computeProductRow(input: {
  product:   { id: string; sku_code: string; name: string }
  opening:   number | null
  budget_by_channel: Partial<Record<Channel, number>>
  channels:  Partial<Record<Channel, number>>
  receipts:  number
  counted_eom: number | null
}): ProductRow {
  const budgetFull   = fillChannels(input.budget_by_channel)
  const channelsFull = fillChannels(input.channels)

  const budget_total = Object.values(budgetFull).reduce((s, v) => s + v, 0)
  const budget_sales = SALES_CHANNELS.reduce((s, c) => s + budgetFull[c], 0)
  const total_out    = Object.values(channelsFull).reduce((s, v) => s + v, 0)
  const total_sales  = SALES_CHANNELS.reduce((s, c) => s + channelsFull[c], 0)
  const calc_eom     = input.opening != null ? input.opening + input.receipts - total_out : null
  const effective_eom = input.counted_eom ?? calc_eom
  const stock_variance = input.counted_eom != null && calc_eom != null
    ? input.counted_eom - calc_eom
    : null

  return {
    product_id: input.product.id,
    sku:        input.product.sku_code,
    name:       input.product.name,
    opening:    input.opening,
    budget_by_channel: budgetFull,
    budget_total,
    budget_sales,
    channels:   channelsFull,
    total_out,
    total_sales,
    receipts:   input.receipts,
    calc_eom,
    counted_eom: input.counted_eom,
    effective_eom,
    stock_variance,
  }
}

// Avoid unused-warning for the const consumers may not import
void ZERO_BY_CHANNEL

// ============================================================
// Ingredient / packaging derivation
// ============================================================

export interface BomLink { product_id: string; entity_id: string; qty_per_product_unit: number }

/** For each entity (ingredient or packaging), sum across all linked products
 *  of (product total_out × qty per unit). Returns map: entityId → derived units. */
export function deriveConsumption(
  productTotals: Record<string, number>,   // product_id → total_out (units sold/used)
  bomLinks: BomLink[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const link of bomLinks) {
    const total = productTotals[link.product_id]
    if (!total) continue
    out[link.entity_id] = (out[link.entity_id] ?? 0) + total * link.qty_per_product_unit
  }
  return out
}
