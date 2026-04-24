'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateProductionCell(
  productId: string,
  yearMonth: string,
  unitsPlanned: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-01$/.test(yearMonth)) return { ok: false, error: 'invalid_month' }
  if (!Number.isFinite(unitsPlanned) || unitsPlanned < 0) return { ok: false, error: 'invalid_units' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { error } = await supabase
    .from('production_plans')
    .upsert(
      {
        product_id:    productId,
        year_month:    yearMonth,
        units_planned: Math.round(unitsPlanned),
        updated_by:    profile?.id ?? null,
      },
      { onConflict: 'product_id,year_month' },
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/production')
  return { ok: true }
}

/**
 * Update the manual opening-stock override on a product.
 * Pass null to clear the override (falls back to inventory_balances).
 */
export async function updateOpeningStockOverride(
  productId: string,
  value: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'invalid_value' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { error } = await supabase
    .from('products')
    .update({ opening_stock_override: value })
    .eq('id', productId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/production')
  revalidatePath(`/products/${productId}`)
  return { ok: true }
}
