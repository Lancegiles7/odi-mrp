import { createClient } from '@/lib/supabase/server'

/**
 * Per-entity summary of opening-stock edit history, used to drive the
 * popover trigger UI:
 *   - `hasHistory`: at least one edit has ever happened → show the clock
 *     button. Unedited rows hide the clock so the table stays quiet.
 *   - `hasComment`: at least one history row carries a non-empty note →
 *     the clock button renders in green so admins can spot rows that
 *     have context attached without opening every popover.
 *
 * Implemented as three thin wrappers (one per table) rather than one
 * generic helper because the column name differs (product_id /
 * ingredient_id / packaging_id) and Supabase typings get fiddly when
 * the column is generic.
 */
export interface OpeningStockSummary {
  hasHistory: boolean
  hasComment: boolean
}

interface HistoryRow { id: string; note: string | null }

/** Roll up `[id, note]` rows into a Map<id, {hasHistory, hasComment}>. */
function rollUp<T extends { note: string | null }>(rows: T[], idOf: (r: T) => string): Map<string, OpeningStockSummary> {
  const out = new Map<string, OpeningStockSummary>()
  for (const r of rows) {
    const id   = idOf(r)
    const cur  = out.get(id) ?? { hasHistory: false, hasComment: false }
    cur.hasHistory = true
    if (r.note != null && r.note.trim() !== '') cur.hasComment = true
    out.set(id, cur)
  }
  return out
}

export async function getProductOpeningStockSummary(productIds: string[]): Promise<Map<string, OpeningStockSummary>> {
  if (productIds.length === 0) return new Map()
  const supabase = createClient()
  const { data } = await supabase
    .from('product_opening_stock_history')
    .select('product_id, note')
    .in('product_id', productIds) as unknown as { data: Array<HistoryRow & { product_id: string }> | null }
  return rollUp(data ?? [], (r) => r.product_id)
}

export async function getIngredientOpeningStockSummary(ingredientIds: string[]): Promise<Map<string, OpeningStockSummary>> {
  if (ingredientIds.length === 0) return new Map()
  const supabase = createClient()
  const { data } = await supabase
    .from('ingredient_opening_stock_history')
    .select('ingredient_id, note')
    .in('ingredient_id', ingredientIds) as unknown as { data: Array<HistoryRow & { ingredient_id: string }> | null }
  return rollUp(data ?? [], (r) => r.ingredient_id)
}

export async function getPackagingOpeningStockSummary(packagingIds: string[]): Promise<Map<string, OpeningStockSummary>> {
  if (packagingIds.length === 0) return new Map()
  const supabase = createClient()
  const { data } = await supabase
    .from('packaging_opening_stock_history')
    .select('packaging_id, note')
    .in('packaging_id', packagingIds) as unknown as { data: Array<HistoryRow & { packaging_id: string }> | null }
  return rollUp(data ?? [], (r) => r.packaging_id)
}
