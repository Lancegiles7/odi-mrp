/**
 * Price change log — shared types and presentation helpers.
 *
 * Rows are written by database triggers (migration 062), never by the app, so
 * anything that changes an entered price is captured: a screen, an import, or
 * SQL run by hand. Derived landed costs are deliberately not tracked, which is
 * why an FX rate change produces no rows here.
 */

export type PriceEntity = 'ingredient' | 'packaging' | 'product'

export interface PriceChange {
  id: string
  entity_type: PriceEntity
  entity_id: string
  field: string
  old_value: number | null
  new_value: number | null
  old_text: string | null
  new_text: string | null
  currency: string | null
  reason: string | null
  changed_by: string | null
  changed_at: string
}

export const ENTITY_LABELS: Record<PriceEntity, string> = {
  ingredient: 'Ingredient',
  packaging:  'Packaging',
  product:    'Finished good',
}

/** Colour per entity type — matches the badge palette used across the app. */
export const ENTITY_BADGE: Record<PriceEntity, string> = {
  ingredient: 'bg-green-100 text-green-800',
  packaging:  'bg-blue-100 text-blue-800',
  product:    'bg-purple-100 text-purple-800',
}

/** Column name → what a person would call it. */
export const FIELD_LABELS: Record<string, string> = {
  price:                'Price',
  freight:              'Freight',
  freight_per_unit_nzd: 'Freight per unit',
  cost_per_unit:        'Cost per unit',
  currency:             'Currency',
  rrp:                  'RRP (NZ)',
  rrp_au:               'RRP (AU)',
  toll:                 'Toll',
  toll_au:              'Toll (AU)',
  margin:               'Margin',
  other:                'Other',
  freight_nz:           'Freight (NZ)',
  freight_au:           'Freight (AU)',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ')
}

/** True when the row records a currency switch rather than an amount. */
export function isTextChange(c: PriceChange): boolean {
  return c.old_text !== null || c.new_text !== null
}

/** Percent movement, or null when there's nothing to compare against. */
export function pctChange(c: PriceChange): number | null {
  if (c.old_value == null || c.new_value == null || Number(c.old_value) === 0) return null
  return (Number(c.new_value) - Number(c.old_value)) / Number(c.old_value)
}

/** A first sighting — an item's opening price, not a change. */
export function isBaseline(c: PriceChange): boolean {
  return c.old_value == null && c.old_text == null
}

export function fmtAmount(v: number | null, currency: string | null): string {
  if (v == null) return '—'
  const symbol = currency && currency !== 'NZD' ? `${currency} ` : '$'
  return `${symbol}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

export function fmtPct(p: number | null): string {
  if (p == null) return '—'
  return `${p > 0 ? '+' : ''}${(p * 100).toFixed(1)}%`
}

/**
 * A rise in a cost is bad and a rise in an RRP is good, so the colour can't
 * come from the sign alone — it depends which field moved.
 */
export function changeTone(field: string, pct: number | null): string {
  if (pct == null || pct === 0) return 'text-gray-500'
  const isRevenue = field === 'rrp' || field === 'rrp_au' || field === 'margin'
  const good = isRevenue ? pct > 0 : pct < 0
  return good ? 'text-emerald-700' : 'text-red-700'
}
