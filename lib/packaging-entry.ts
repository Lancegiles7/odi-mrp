/**
 * product_packaging entry-mode helpers.
 *
 * The user can enter packaging quantity in the natural direction:
 *   per_pack   — entry_value = how many of the packaging per 1 product
 *   per_group  — entry_value = how many products fit in 1 of this packaging
 *
 * quantity_per_unit (the canonical column used by demand + cost) is always
 * the per-product number. resolveQuantityPerUnit() does the conversion.
 */

export type EntryMode = 'per_pack' | 'per_group'

export function resolveQuantityPerUnit(mode: EntryMode, value: number): number {
  if (!value || value <= 0) return 0
  return mode === 'per_group' ? 1 / value : value
}
