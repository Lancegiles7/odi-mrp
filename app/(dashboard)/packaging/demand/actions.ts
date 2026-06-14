'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { OpeningStockHistoryRow } from '@/lib/opening-stock-history'

/**
 * Update the manual opening-stock override on a packaging item and
 * append an audit row to packaging_opening_stock_history.
 *
 * No-op when the value hasn't changed AND no note is supplied.
 */
export async function updatePackagingOpeningStock(
  packagingId: string,
  value: number | null,
  note?: string | null,
  market: 'NZ' | 'AU' = 'NZ',
): Promise<{ ok: boolean; error?: string }> {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'invalid_value' }
  }
  const mkt = market === 'AU' ? 'AU' : 'NZ'
  const col = mkt === 'AU' ? 'opening_stock_override_au' : 'opening_stock_override'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: existing } = await supabase
    .from('packaging')
    .select(col)
    .eq('id', packagingId)
    .maybeSingle() as { data: Record<string, number | null> | null }
  const previousValue = existing?.[col] ?? null

  const trimmedNote   = note?.trim() || null
  const valueChanged  = (previousValue ?? null) !== (value ?? null)

  if (!valueChanged && !trimmedNote) return { ok: true }

  if (valueChanged) {
    const { error: updateErr } = await supabase
      .from('packaging')
      .update({ [col]: value })
      .eq('id', packagingId)
    if (updateErr) return { ok: false, error: updateErr.message }
  }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { error: histErr } = await supabase
    .from('packaging_opening_stock_history')
    .insert({
      packaging_id:   packagingId,
      previous_value: previousValue,
      new_value:      value,
      note:           trimmedNote,
      market:         mkt,
      changed_by:     profile?.id ?? null,
    })
  if (histErr) return { ok: false, error: `Couldn't save audit: ${histErr.message}` }

  revalidatePath('/packaging/demand')
  revalidatePath(`/packaging/${packagingId}`)
  return { ok: true }
}

/**
 * Recent opening-stock audit entries for a packaging item. Newest first,
 * capped at 50.
 */
export async function getPackagingOpeningStockHistory(
  packagingId: string,
  market: 'NZ' | 'AU' = 'NZ',
): Promise<{ ok: boolean; rows: OpeningStockHistoryRow[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, rows: [], error: 'not_authenticated' }

  const { data, error } = await supabase
    .from('packaging_opening_stock_history')
    .select('id, previous_value, new_value, note, changed_at, user_profiles:changed_by ( full_name )')
    .eq('packaging_id', packagingId)
    .eq('market', market === 'AU' ? 'AU' : 'NZ')
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
