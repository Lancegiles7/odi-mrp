'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { OpeningStockHistoryRow } from '@/lib/opening-stock-history'

/**
 * Update the manual opening-stock override on an ingredient and
 * append an audit row to ingredient_opening_stock_history. Pass
 * null to clear the override (falls back to inventory_balances).
 *
 * No-op when the value hasn't changed AND no note is supplied.
 */
export async function updateIngredientOpeningStock(
  ingredientId: string,
  value: number | null,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'invalid_value' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: existing } = await supabase
    .from('ingredients')
    .select('opening_stock_override')
    .eq('id', ingredientId)
    .maybeSingle() as { data: { opening_stock_override: number | null } | null }
  const previousValue = existing?.opening_stock_override ?? null

  const trimmedNote   = note?.trim() || null
  const valueChanged  = (previousValue ?? null) !== (value ?? null)

  if (!valueChanged && !trimmedNote) return { ok: true }

  if (valueChanged) {
    const { error: updateErr } = await supabase
      .from('ingredients')
      .update({ opening_stock_override: value })
      .eq('id', ingredientId)
    if (updateErr) return { ok: false, error: updateErr.message }
  }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  await supabase
    .from('ingredient_opening_stock_history')
    .insert({
      ingredient_id:  ingredientId,
      previous_value: previousValue,
      new_value:      value,
      note:           trimmedNote,
      changed_by:     profile?.id ?? null,
    })

  revalidatePath('/ingredients/demand')
  revalidatePath(`/ingredients/${ingredientId}`)
  return { ok: true }
}

/**
 * Recent opening-stock audit entries for an ingredient. Newest first,
 * capped at 50.
 */
export async function getIngredientOpeningStockHistory(
  ingredientId: string,
): Promise<{ ok: boolean; rows: OpeningStockHistoryRow[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, rows: [], error: 'not_authenticated' }

  const { data, error } = await supabase
    .from('ingredient_opening_stock_history')
    .select('id, previous_value, new_value, note, changed_at, user_profiles:changed_by ( full_name )')
    .eq('ingredient_id', ingredientId)
    .order('changed_at', { ascending: false })
    .limit(50) as unknown as { data: Array<{
      id: string
      previous_value: number | null
      new_value: number | null
      note: string | null
      changed_at: string
      user_profiles: { full_name: string } | null
    }> | null; error: { message: string } | null }

  if (error) return { ok: false, rows: [], error: error.message }

  const rows: OpeningStockHistoryRow[] = (data ?? []).map((r) => ({
    id:               r.id,
    previous_value:   r.previous_value,
    new_value:        r.new_value,
    note:             r.note,
    changed_at:       r.changed_at,
    changed_by_name:  r.user_profiles?.full_name ?? null,
  }))
  return { ok: true, rows }
}
