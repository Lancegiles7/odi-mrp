'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/constants'
import type { EnhancementStatus, EnhancementPriority, EnhancementCategory } from '@/lib/types/database.types'

/**
 * Server actions for the Enhancement log.
 *
 * Anyone signed in can submit / comment. Status changes (and deletes) are
 * gated to admin both here and at the RLS layer in migration 035.
 */

const VALID_STATUSES   = new Set<EnhancementStatus>(['new','under_review','approved','in_progress','built','declined','on_hold'])
const VALID_PRIORITIES = new Set<EnhancementPriority>(['low','medium','high','urgent'])
const VALID_CATEGORIES = new Set<EnhancementCategory>(['demand','production','ingredients','packaging','purchase_orders','inventory','reporting','settings','other'])

async function currentUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('user_profiles').select('id, roles(name)').eq('id', user.id).maybeSingle() as
      { data: { id: string; roles: { name: string } | null } | null }
  return { supabase, userId: user.id, profileId: profile?.id ?? null, role: profile?.roles?.name ?? null }
}

// ────────────────────────────────────────────────────────────
// Submit a new enhancement
// ────────────────────────────────────────────────────────────
export async function createEnhancement(formData: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { supabase, profileId } = await currentUser()

  const title       = ((formData.get('title') as string | null) ?? '').trim()
  const description = ((formData.get('description') as string | null) ?? '').trim()
  const category    = ((formData.get('category') as string | null) ?? '').trim() as EnhancementCategory
  const priority    = (((formData.get('priority') as string | null) ?? 'medium').trim() || 'medium') as EnhancementPriority

  if (!title)                          return { ok: false, error: 'Title is required' }
  if (!description)                    return { ok: false, error: 'Description is required' }
  if (!VALID_CATEGORIES.has(category)) return { ok: false, error: 'Pick a category' }
  if (!VALID_PRIORITIES.has(priority)) return { ok: false, error: 'Invalid priority' }

  const { data, error } = await supabase
    .from('enhancements')
    .insert({
      title, description, category, priority,
      status: 'new',
      submitted_by: profileId,
    } as never)
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) return { ok: false, error: error?.message ?? 'Submit failed' }

  revalidatePath('/enhancements')
  return { ok: true, id: data.id }
}

// ────────────────────────────────────────────────────────────
// Post a comment on an enhancement
// ────────────────────────────────────────────────────────────
export async function addComment(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { supabase, profileId } = await currentUser()

  const enhancementId = ((formData.get('enhancement_id') as string | null) ?? '').trim()
  const body          = ((formData.get('body') as string | null) ?? '').trim()

  if (!enhancementId)  return { ok: false, error: 'Missing enhancement id' }
  if (!body)           return { ok: false, error: 'Type a comment first' }
  if (body.length > 4000) return { ok: false, error: 'Comment too long' }

  const { error } = await supabase
    .from('enhancement_comments')
    .insert({ enhancement_id: enhancementId, author_id: profileId, body } as never)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/enhancements/${enhancementId}`)
  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// Update status (admin only)
// ────────────────────────────────────────────────────────────
export async function updateEnhancementStatus(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { supabase, profileId, role } = await currentUser()
  if (role !== ROLES.ADMIN) return { ok: false, error: 'Admin only' }

  const id        = ((formData.get('id') as string | null) ?? '').trim()
  const status    = ((formData.get('status') as string | null) ?? '').trim() as EnhancementStatus
  const statusNote = ((formData.get('status_note') as string | null) ?? '').trim() || null
  const builtUrl   = ((formData.get('built_url') as string | null) ?? '').trim() || null

  if (!id)                       return { ok: false, error: 'Missing id' }
  if (!VALID_STATUSES.has(status)) return { ok: false, error: 'Invalid status' }

  const { error } = await supabase
    .from('enhancements')
    .update({
      status,
      status_note:        statusNote,
      built_url:          status === 'built' ? builtUrl : null,
      status_changed_by:  profileId,
      status_changed_at:  new Date().toISOString(),
    } as never)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/enhancements')
  revalidatePath(`/enhancements/${id}`)
  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// Delete enhancement / comment (admin moderation)
// ────────────────────────────────────────────────────────────
export async function deleteEnhancement(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, role } = await currentUser()
  if (role !== ROLES.ADMIN) return { ok: false, error: 'Admin only' }

  const { error } = await supabase.from('enhancements').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/enhancements')
  return { ok: true }
}

export async function deleteComment(id: string, enhancementId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, role } = await currentUser()
  if (role !== ROLES.ADMIN) return { ok: false, error: 'Admin only' }

  const { error } = await supabase.from('enhancement_comments').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/enhancements/${enhancementId}`)
  return { ok: true }
}
