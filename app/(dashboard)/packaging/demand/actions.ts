'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Update the manual opening-stock override on a packaging item. */
export async function updatePackagingOpeningStock(
  packagingId: string,
  value: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'invalid_value' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { error } = await supabase
    .from('packaging')
    .update({ opening_stock_override: value })
    .eq('id', packagingId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/packaging/demand')
  revalidatePath(`/packaging/${packagingId}`)
  return { ok: true }
}
