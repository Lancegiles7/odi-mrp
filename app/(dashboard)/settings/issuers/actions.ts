'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface IssuerForm {
  id?: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  is_default: boolean
  is_active: boolean
  notes: string | null
}

function parsePayload(formData: FormData): IssuerForm | string {
  const id   = (formData.get('id')   as string | null) || undefined
  const name = ((formData.get('name') as string | null) || '').trim()
  if (!name) return 'Name is required'

  return {
    id, name,
    title:      ((formData.get('title') as string | null) || '').trim() || null,
    phone:      ((formData.get('phone') as string | null) || '').trim() || null,
    email:      ((formData.get('email') as string | null) || '').trim() || null,
    notes:      ((formData.get('notes') as string | null) || '').trim() || null,
    is_default: formData.get('is_default') === 'on',
    is_active:  formData.get('is_active')  === 'on',
  }
}

async function clearOtherDefaults(supabase: ReturnType<typeof createClient>, excludeId?: string) {
  const q = supabase.from('po_issuers').update({ is_default: false }).eq('is_default', true)
  if (excludeId) await q.neq('id', excludeId)
  else           await q
}

export async function createIssuer(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/settings/issuers/new?error=${encodeURIComponent(parsed)}`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (parsed.is_default) await clearOtherDefaults(supabase)

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { data, error } = await supabase
    .from('po_issuers')
    .insert({ ...parsed, created_by: profile?.id ?? null })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) redirect(`/settings/issuers/new?error=${encodeURIComponent(error?.message ?? 'Save failed')}`)

  revalidatePath('/settings/issuers')
  revalidatePath('/settings')
  redirect(`/settings/issuers/${data.id}?saved=1`)
}

export async function updateIssuer(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/settings/issuers?error=${encodeURIComponent(parsed)}`)
  if (!parsed.id) redirect('/settings/issuers?error=missing_id')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (parsed.is_default) await clearOtherDefaults(supabase, parsed.id)

  const { id, ...update } = parsed
  const { error } = await supabase.from('po_issuers').update(update).eq('id', id!)
  if (error) redirect(`/settings/issuers/${id}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/settings/issuers')
  revalidatePath('/settings')
  redirect(`/settings/issuers/${id}?saved=1`)
}

export async function deleteIssuer(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing issuer id' }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Block if any POs reference this issuer — they'd otherwise lose the link silently
  const { count } = await supabase
    .from('purchase_orders').select('id', { count: 'exact', head: true }).eq('issuer_id', id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot delete: ${count} purchase order${count === 1 ? '' : 's'} reference${count === 1 ? 's' : ''} this issuer. Mark inactive instead, or reassign those POs first.`,
    }
  }

  const { error } = await supabase.from('po_issuers').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/issuers')
  revalidatePath('/settings')
  return { ok: true }
}
