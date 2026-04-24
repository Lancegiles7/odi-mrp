'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Update the manual opening-stock override on an ingredient.
 * Pass null to clear the override (falls back to inventory_balances later).
 */
export async function updateIngredientOpeningStock(
  ingredientId: string,
  value: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'invalid_value' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { error } = await supabase
    .from('ingredients')
    .update({ opening_stock_override: value })
    .eq('id', ingredientId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/ingredients/demand')
  revalidatePath(`/ingredients/${ingredientId}`)
  return { ok: true }
}
