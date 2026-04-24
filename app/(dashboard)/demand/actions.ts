'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { DemandChannel } from '@/lib/types/database.types'

const VALID_CHANNELS: DemandChannel[] = ['ecomm_nz', 'retail_nz', 'ecomm_au', 'retail_au', 'pipefill']

/**
 * Upsert a single demand cell. Sets is_edited = true when the user
 * changes a value manually so re-imports preserve the edit.
 */
export async function updateDemandCell(
  productId: string,
  yearMonth: string,
  channel: DemandChannel,
  units: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!VALID_CHANNELS.includes(channel)) return { ok: false, error: 'invalid_channel' }
  if (!/^\d{4}-\d{2}-01$/.test(yearMonth)) return { ok: false, error: 'invalid_month' }
  if (!Number.isFinite(units) || units < 0) return { ok: false, error: 'invalid_units' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Upsert: on conflict replace. Mark as edited (unless this is a pipefill entry from scratch).
  const source = channel === 'pipefill' ? 'pipefill' : 'manual'
  const { error } = await supabase
    .from('demand_forecasts')
    .upsert(
      {
        product_id: productId,
        year_month: yearMonth,
        channel,
        units: Math.round(units),
        is_edited: true,
        source,
        updated_by: profile?.id ?? null,
      },
      { onConflict: 'product_id,year_month,channel' },
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/demand')
  revalidatePath('/production')
  return { ok: true }
}
