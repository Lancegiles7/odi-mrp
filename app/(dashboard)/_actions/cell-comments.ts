'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type EntityType = 'ingredient' | 'packaging' | 'product'

export interface CellComment {
  id:               string
  comment:          string
  changed_at:       string
  changed_by_name:  string | null
}

/**
 * Append a comment to a single (entity, month) cell. Append-only:
 * past comments are never edited or deleted; the popover shows them
 * stacked with the newest first.
 */
export async function addDemandCellComment(
  entityType: EntityType,
  entityId:   string,
  yearMonth:  string,         // 'yyyy-mm-01'
  comment:    string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = comment.trim()
  if (!trimmed) return { ok: false, error: 'empty_comment' }
  if (!/^\d{4}-\d{2}-01$/.test(yearMonth)) return { ok: false, error: 'invalid_month' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { error } = await supabase
    .from('demand_cell_comments')
    .insert({
      entity_type: entityType,
      entity_id:   entityId,
      year_month:  yearMonth,
      comment:     trimmed,
      changed_by:  profile?.id ?? null,
    })
  if (error) return { ok: false, error: error.message }

  // Revalidate the three pages that surface these comments.
  revalidatePath('/ingredients/demand')
  revalidatePath('/packaging/demand')
  revalidatePath('/production')
  return { ok: true }
}

/**
 * Full comment thread for a single cell, newest first.
 */
export async function getDemandCellComments(
  entityType: EntityType,
  entityId:   string,
  yearMonth:  string,
): Promise<{ ok: boolean; rows: CellComment[]; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, rows: [], error: 'not_authenticated' }

  const { data, error } = await supabase
    .from('demand_cell_comments')
    .select('id, comment, changed_at, user_profiles:changed_by ( full_name )')
    .eq('entity_type', entityType)
    .eq('entity_id',   entityId)
    .eq('year_month',  yearMonth)
    .order('changed_at', { ascending: false }) as unknown as { data: Array<{
      id: string; comment: string; changed_at: string;
      user_profiles: { full_name: string } | null
    }> | null; error: { message: string } | null }

  if (error) return { ok: false, rows: [], error: error.message }

  const rows: CellComment[] = (data ?? []).map((r) => ({
    id:               r.id,
    comment:          r.comment,
    changed_at:       r.changed_at,
    changed_by_name:  r.user_profiles?.full_name ?? null,
  }))
  return { ok: true, rows }
}

/**
 * Bulk-fetch which (entity, month) cells have at least one comment.
 * Returns a Set keyed by "entity_id|yyyy-mm-01" so callers can render
 * the filled indicator dot in O(1) per cell. Called from the page
 * once and threaded down to every row.
 */
export async function getCellsWithComments(
  entityType:  EntityType,
  entityIds:   string[],
  monthStart:  string,        // 'yyyy-mm-01'
  monthEnd:    string,
): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set()
  const supabase = createClient()

  const rows = await fetchAllRows<{ entity_id: string; year_month: string }>((from, to) =>
    supabase
      .from('demand_cell_comments')
      .select('entity_id, year_month')
      .eq('entity_type', entityType)
      .in('entity_id', entityIds)
      .gte('year_month', monthStart).lte('year_month', monthEnd)
      .order('entity_id').order('year_month')
      .range(from, to) as unknown as PromiseLike<{ data: Array<{ entity_id: string; year_month: string }> | null; error: { message: string } | null }>,
  )

  const out = new Set<string>()
  for (const r of rows) {
    out.add(`${r.entity_id}|${r.year_month.slice(0, 10)}`)
  }
  return out
}
