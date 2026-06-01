'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { OpeningStockHistoryRow } from '@/lib/opening-stock-history'

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
 * Update the manual opening-stock override on a product, and append an
 * audit row to product_opening_stock_history capturing who changed it,
 * when, the previous + new values, and an optional comment. Pass null
 * to clear the override (falls back to inventory_balances).
 *
 * No-op when the new value matches the existing one AND no note is
 * provided — keeps the history table free of empty rows from accidental
 * blur-without-change events on the input.
 */
export async function updateOpeningStockOverride(
  productId: string,
  value: number | null,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'invalid_value' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Read the existing value first so the history row captures the full change.
  const { data: existing } = await supabase
    .from('products')
    .select('opening_stock_override')
    .eq('id', productId)
    .maybeSingle() as { data: { opening_stock_override: number | null } | null }
  const previousValue = existing?.opening_stock_override ?? null

  const trimmedNote   = note?.trim() || null
  const valueChanged  = (previousValue ?? null) !== (value ?? null)

  // Nothing to record — skip everything.
  if (!valueChanged && !trimmedNote) return { ok: true }

  if (valueChanged) {
    const { error: updateErr } = await supabase
      .from('products')
      .update({ opening_stock_override: value })
      .eq('id', productId)
    if (updateErr) return { ok: false, error: updateErr.message }
  }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Append audit row. Surface the error so silent insert failures
  // (e.g. RLS denial, schema mismatch) don't leave the user thinking
  // their comment was saved when it wasn't.
  const { error: histErr } = await supabase
    .from('product_opening_stock_history')
    .insert({
      product_id:     productId,
      previous_value: previousValue,
      new_value:      value,
      note:           trimmedNote,
      changed_by:     profile?.id ?? null,
    })
  if (histErr) return { ok: false, error: `Couldn't save audit: ${histErr.message}` }

  revalidatePath('/production')
  revalidatePath(`/products/${productId}`)
  return { ok: true }
}

/**
 * Read recent opening-stock audit entries for a product. Newest first,
 * capped at 50 (the popover lazy-loads when opened, so this is enough
 * for browsing without paginating). Returns the shared
 * OpeningStockHistoryRow shape from lib/opening-stock-history.
 */
export async function getOpeningStockHistory(
  productId: string,
): Promise<{ ok: boolean; rows: OpeningStockHistoryRow[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, rows: [], error: 'not_authenticated' }

  const { data, error } = await supabase
    .from('product_opening_stock_history')
    .select('id, previous_value, new_value, note, changed_at, user_profiles:changed_by ( full_name )')
    .eq('product_id', productId)
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
