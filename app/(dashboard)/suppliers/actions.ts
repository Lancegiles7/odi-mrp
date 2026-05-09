'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface SupplierForm {
  id?: string
  code: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  payment_terms: string | null
  lead_time_days: number | null
  notes: string | null
  is_active: boolean
}

function parsePayload(formData: FormData): SupplierForm | string {
  const id    = (formData.get('id')    as string | null) || undefined
  const code  = ((formData.get('code') as string | null) || '').trim()
  const name  = ((formData.get('name') as string | null) || '').trim()
  if (!code) return 'Code is required'
  if (!name) return 'Name is required'

  const lt = formData.get('lead_time_days') as string | null
  const ltn = lt && lt.trim() !== '' ? Number(lt) : null

  return {
    id, code, name,
    contact_name:   ((formData.get('contact_name')  as string | null) || '').trim() || null,
    email:          ((formData.get('email')         as string | null) || '').trim() || null,
    phone:          ((formData.get('phone')         as string | null) || '').trim() || null,
    address:        ((formData.get('address')       as string | null) || '').trim() || null,
    payment_terms:  ((formData.get('payment_terms') as string | null) || '').trim() || null,
    lead_time_days: ltn != null && Number.isFinite(ltn) && ltn >= 0 ? Math.round(ltn) : null,
    notes:          ((formData.get('notes')         as string | null) || '').trim() || null,
    is_active:      (formData.get('is_active') === 'on'),
  }
}

export async function createSupplier(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/suppliers/new?error=${encodeURIComponent(parsed)}`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...parsed, created_by: profile?.id ?? null })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) redirect(`/suppliers/new?error=${encodeURIComponent(error?.message ?? 'Save failed')}`)

  revalidatePath('/suppliers')
  redirect(`/suppliers/${data.id}?saved=1`)
}

export async function deleteSupplier(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing supplier id' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const [poRes, ingRes, pakRes] = await Promise.all([
    supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
    supabase.from('ingredients').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
    supabase.from('packaging').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
  ])
  const refs: string[] = []
  if ((poRes.count ?? 0)  > 0) refs.push(`${poRes.count} purchase order${poRes.count === 1 ? '' : 's'}`)
  if ((ingRes.count ?? 0) > 0) refs.push(`${ingRes.count} ingredient${ingRes.count === 1 ? '' : 's'}`)
  if ((pakRes.count ?? 0) > 0) refs.push(`${pakRes.count} packaging item${pakRes.count === 1 ? '' : 's'}`)

  if (refs.length > 0) {
    return {
      ok: false,
      error: `Cannot delete: this supplier is referenced by ${refs.join(', ')}. Mark it inactive instead, or reassign those records first.`,
    }
  }

  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/suppliers')
  return { ok: true }
}

export async function updateSupplier(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/suppliers?error=${encodeURIComponent(parsed)}`)
  if (!parsed.id) redirect('/suppliers?error=missing_id')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id, ...update } = parsed
  const { error } = await supabase
    .from('suppliers')
    .update(update)
    .eq('id', id!)

  if (error) redirect(`/suppliers/${id}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/suppliers')
  revalidatePath(`/suppliers/${id}`)
  redirect(`/suppliers/${id}?saved=1`)
}
