/**
 * Budget vs Actual — actuals import parsing.
 *
 * Pure functions that turn the three monthly exports into bva_figures
 * "actual" lines for a target month. Validated against the real files:
 *   - Shopify orders export  → D2C revenue, D2C orders, units by group
 *   - Upstock orders export  → Retail revenue (wholesale), retail orders
 *                              (Woolworths vs rest), units by group (pouches ×6)
 *   - Sample tracker (.xlsx) → indicative sample units by group (MONTHLY TOTAL
 *                              row, which already excludes the "already in
 *                              Shopify" rows below the divider)
 *
 * SheetJS parsing (reading the File buffers) happens in the server action;
 * these functions take already-parsed rows so they stay testable.
 */

export type GroupKey = 'sachets' | 'tubs' | 'snacks' | 'pouches' | 'other'

/** Product group from any of the SKU schemes (FG-/SRC-/SHIP-…). */
export function bvaGroup(sku: string | null | undefined): GroupKey {
  const s = (sku ?? '').toUpperCase()
  if (s.includes('SAC')) return 'sachets'
  if (s.includes('TUB')) return 'tubs'
  if (s.includes('PCH')) return 'pouches'
  if (s.includes('BITE') || s.includes('-BAR') || s.includes('BAL') || s.includes('CCO') || s.includes('COOK')) return 'snacks'
  return 'other'
}

/** "2026-06-26 13:16:20 +1200" / "2026-05-01 08:56" → "2026-06". */
export function monthOf(s: unknown): string {
  return String(s ?? '').trim().slice(0, 7)
}

type Row = Record<string, unknown>
const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string => String(v ?? '').trim()

export interface D2cActuals { revenue: number; orders: number; units: Record<GroupKey, number> }
export interface RetailActuals { revenue: number; ordersWw: number; ordersOther: number; units: Record<GroupKey, number> }

function zeroUnits(): Record<GroupKey, number> {
  return { sachets: 0, tubs: 0, snacks: 0, pouches: 0, other: 0 }
}

/** Shopify export → D2C actuals for `ym` (YYYY-MM).
 *  Orders span multiple rows: the first row of an order carries Created at +
 *  Subtotal; line rows carry only Lineitem fields. We carry the month down. */
export function d2cFromShopify(rows: Row[], ym: string): D2cActuals {
  const units = zeroUnits()
  let revenue = 0
  const orders = new Set<string>()
  let curMonth: string | null = null
  for (const r of rows) {
    const created = str(r['Created at'])
    if (created) curMonth = monthOf(created)
    if (str(r['Cancelled at'])) continue
    if (curMonth !== ym) continue
    const name = str(r['Name'])
    if (name && created) orders.add(name)
    // Subtotal sits on the order's first row only (net of discount, ex ship/tax)
    if (str(r['Subtotal'])) revenue += num(r['Subtotal'])
    const sku = str(r['Lineitem sku'])
    const qty = r['Lineitem quantity']
    if (sku && str(qty)) units[bvaGroup(sku)] += num(qty)
  }
  return { revenue, orders: orders.size, units }
}

/** Upstock export → Retail actuals for `ym`. Wholesale revenue (Line Amount);
 *  retail pouches counted as single units (×6); Woolworths split off by
 *  customer name. */
export function retailFromUpstock(rows: Row[], ym: string): RetailActuals {
  const units = zeroUnits()
  let revenue = 0
  const ww = new Set<string>()
  const other = new Set<string>()
  for (const r of rows) {
    if (monthOf(r['Created Date']) !== ym) continue
    revenue += num(r['Line Amount'])
    const code = str(r['Product Code'])
    const mult = code.toUpperCase().includes('PCH') ? 6 : 1
    if (code) units[bvaGroup(code)] += num(r['Quantity']) * mult
    const ordNo = str(r['Order Number'])
    if (ordNo) {
      if (str(r['Customer']).toLowerCase().startsWith('woolworths')) ww.add(ordNo)
      else other.add(ordNo)
    }
  }
  return { revenue, ordersWw: ww.size, ordersOther: other.size, units }
}

/** Sample tracker month sheet (array-of-arrays) → indicative sample units by
 *  group. Reads the MONTHLY TOTAL row across the SKU columns (row that lists
 *  the FG- SKUs). The MONTHLY TOTAL already excludes the rows below the
 *  "SHOPIFY ORDERS ALREADY REFLECTED" divider, so no double counting. */
export function samplesFromSheet(aoa: unknown[][]): Record<GroupKey, number> {
  const units = zeroUnits()
  // Find the SKU header row (the one with FG- codes) and the MONTHLY TOTAL row.
  let skuRow: unknown[] | null = null
  let totalRow: unknown[] | null = null
  for (const row of aoa) {
    if (!skuRow && row.some((c) => str(c).startsWith('FG-ODI'))) skuRow = row
    if (!totalRow && str(row[0]).toUpperCase().startsWith('MONTHLY TOTAL')) totalRow = row
  }
  if (!skuRow || !totalRow) return units
  for (let c = 0; c < skuRow.length; c++) {
    const sku = str(skuRow[c])
    if (sku.startsWith('FG-ODI')) units[bvaGroup(sku)] += num(totalRow[c])
  }
  return units
}

/** Map the computed actuals into bva_figures line_key → value. */
export function actualsToFigureLines(d2c: D2cActuals, retail: RetailActuals, samples: Record<GroupKey, number>): Record<string, number> {
  const groups: GroupKey[] = ['sachets', 'tubs', 'snacks', 'pouches']
  const out: Record<string, number> = {
    rev_d2c:          d2c.revenue,
    rev_retail:       retail.revenue,
    ord_d2c:          d2c.orders,
    ord_retail:       retail.ordersWw + retail.ordersOther,
    ord_retail_ww:    retail.ordersWw,
    ord_retail_other: retail.ordersOther,
  }
  for (const g of groups) {
    // Sales units = D2C + Retail (samples tracked separately, indicative).
    out[`units_${g}`] = d2c.units[g] + retail.units[g]
    out[`smpl_${g}`]  = samples[g]
  }
  return out
}

/** "2026-07-01" → "July 2026" (sample tracker sheet name). */
export function sampleSheetName(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[m - 1]} ${y}`
}
