'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BudgetLineItem } from '@/lib/budget-parser'

export interface CommitBudgetResult {
  ok: boolean
  snapshot_id?: string
  rows_inserted?: number
  error?: string
}

export async function commitBudgetSnapshot(
  source_filename: string,
  items: BudgetLineItem[],
): Promise<CommitBudgetResult> {
  if (!items.length) return { ok: false, error: 'No rows to import' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Clear current flag on all existing snapshots
  const { error: clearErr } = await supabase.from('budget_snapshots').update({ is_current: false }).eq('is_current', true)
  if (clearErr) {
    console.error('[budget commit] clear current failed:', clearErr)
    return { ok: false, error: `Could not clear previous snapshot: ${clearErr.message}` }
  }

  // Insert new snapshot
  const { data: snap, error: snapErr } = await supabase
    .from('budget_snapshots')
    .insert({
      source_filename,
      uploaded_by: profile?.id ?? null,
      is_current: true,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (snapErr || !snap) {
    console.error('[budget commit] snapshot insert failed:', snapErr)
    return { ok: false, error: snapErr?.message ?? 'Failed to create snapshot (likely migration 015 not applied — run the SQL block I gave you in Supabase)' }
  }

  // Insert line items in chunks
  const rows = items.map((it) => ({
    snapshot_id: snap.id,
    section: it.section,
    metric: it.metric,
    region: it.region,
    channel: it.channel,
    year_month: it.year_month,
    fiscal_year: it.fiscal_year,
    value: it.value,
  }))

  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from('budget_line_items').insert(slice)
    if (error) {
      console.error('[budget commit] line items insert failed (chunk', i, '):', error)
      // Roll back snapshot
      await supabase.from('budget_snapshots').delete().eq('id', snap.id)
      return { ok: false, error: `Line items failed: ${error.message}` }
    }
    inserted += slice.length
  }

  revalidatePath('/')
  revalidatePath('/budget')
  return { ok: true, snapshot_id: snap.id, rows_inserted: inserted }
}
