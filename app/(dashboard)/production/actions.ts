'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { OpeningStockHistoryRow } from '@/lib/opening-stock-history'

export async function updateProductionCell(
  productId: string,
  yearMonth: string,
  unitsPlanned: number,
  market: 'NZ' | 'AU' = 'NZ',
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-01$/.test(yearMonth)) return { ok: false, error: 'invalid_month' }
  if (!Number.isFinite(unitsPlanned) || unitsPlanned < 0) return { ok: false, error: 'invalid_units' }
  const mkt = market === 'AU' ? 'AU' : 'NZ'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // A person typed this number → it's now a confirmed (manual) cell. We don't
  // touch suggested_units, so the model's figure stays available to show beside
  // the override on the schedule.
  const { error } = await supabase
    .from('production_plans')
    .upsert(
      {
        product_id:    productId,
        year_month:    yearMonth,
        market:        mkt,
        units_planned: Math.round(unitsPlanned),
        source:        'manual',
        updated_by:    profile?.id ?? null,
      } as never,
      { onConflict: 'product_id,year_month,market' },
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/production')
  return { ok: true }
}

// ============================================================
// applySuggestedProduction — write the auto-planner's suggested numbers into the
// production plan (bulk upsert). The dialog only sends the months it's suggesting
// (December onward), so existing earlier months are never touched.
// ============================================================
export async function applySuggestedProduction(input: {
  rows: Array<{
    product_id: string
    year_month: string
    market: 'NZ' | 'AU'
    units_planned: number
    source?: 'manual' | 'suggested'
    suggested_units?: number | null
  }>
}): Promise<{ ok: boolean; applied?: number; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Each cell is tagged 'suggested' (model number, shown as a draft) unless the
  // user overrode it in the planner, in which case it's 'manual'. We keep the
  // model's figure in suggested_units either way, so the schedule can show it
  // greyed beside an override.
  const rows = input.rows
    .filter((r) => /^\d{4}-\d{2}-01$/.test(r.year_month) && Number.isFinite(r.units_planned) && r.units_planned >= 0)
    .map((r) => ({
      product_id:      r.product_id,
      year_month:      r.year_month,
      market:          r.market === 'AU' ? 'AU' : 'NZ',
      units_planned:   Math.round(r.units_planned),
      source:          r.source === 'manual' ? 'manual' : 'suggested',
      suggested_units: r.suggested_units == null ? null : Math.round(r.suggested_units),
      updated_by:      profile?.id ?? null,
    }))
  if (!rows.length) return { ok: false, error: 'Nothing to apply.' }

  const { error } = await supabase
    .from('production_plans')
    .upsert(rows as never, { onConflict: 'product_id,year_month,market' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/production')
  return { ok: true, applied: rows.length }
}

// ============================================================
// Accept / clear model suggestions for a manufacturer section.
//   accept — confirm the model's draft numbers (source → 'manual'); the
//            numbers stay, they just stop showing as drafts.
//   clear  — drop the model's draft rows entirely (back to no plan). Only
//            touches 'suggested' cells, so manual numbers are never affected.
// Both act on the exact (product_id, market) cells in that section, from
// `fromMonth` on, so a dual product's other-market cells aren't caught.
// ============================================================
async function suggestionIds(
  supabase: ReturnType<typeof createClient>,
  pairs: Array<{ product_id: string; market: 'NZ' | 'AU' }>,
  fromMonth: string,
): Promise<string[]> {
  const pids = Array.from(new Set(pairs.map((p) => p.product_id)))
  if (!pids.length) return []
  const { data } = await supabase
    .from('production_plans')
    .select('id, product_id, market, year_month')
    .in('product_id', pids)
    .eq('source', 'suggested')
    .gte('year_month', fromMonth) as unknown as {
      data: Array<{ id: string; product_id: string; market: string | null; year_month: string }> | null
    }
  const want = new Set(pairs.map((p) => `${p.product_id}:${p.market}`))
  return (data ?? [])
    .filter((r) => want.has(`${r.product_id}:${(r.market ?? 'NZ') === 'AU' ? 'AU' : 'NZ'}`))
    .map((r) => r.id)
}

export async function acceptSuggestions(input: {
  pairs: Array<{ product_id: string; market: 'NZ' | 'AU' }>
  fromMonth: string
}): Promise<{ ok: boolean; changed?: number; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const ids = await suggestionIds(supabase, input.pairs, input.fromMonth)
  if (!ids.length) return { ok: true, changed: 0 }

  const { error } = await supabase
    .from('production_plans')
    .update({ source: 'manual' } as never)
    .in('id', ids)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/production')
  return { ok: true, changed: ids.length }
}

export async function clearSuggestions(input: {
  pairs: Array<{ product_id: string; market: 'NZ' | 'AU' }>
  fromMonth: string
}): Promise<{ ok: boolean; changed?: number; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const ids = await suggestionIds(supabase, input.pairs, input.fromMonth)
  if (!ids.length) return { ok: true, changed: 0 }

  const { error } = await supabase
    .from('production_plans')
    .delete()
    .in('id', ids)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/production')
  return { ok: true, changed: ids.length }
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
