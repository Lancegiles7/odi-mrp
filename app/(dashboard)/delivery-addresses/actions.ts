'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface AddressForm {
  id?: string
  label: string
  street: string
  contact_name: string | null
  phone: string | null
  country: 'NZ' | 'AU'
  is_default: boolean
  is_active: boolean
  notes: string | null
}

function parsePayload(formData: FormData): AddressForm | string {
  const id      = (formData.get('id')      as string | null) || undefined
  const label   = ((formData.get('label')  as string | null) || '').trim()
  const street  = ((formData.get('street') as string | null) || '').trim()
  const country = ((formData.get('country') as string | null) || '').trim().toUpperCase()
  if (!label)  return 'Label is required'
  if (!street) return 'Street address is required'
  if (country !== 'NZ' && country !== 'AU') return 'Country must be NZ or AU'

  return {
    id, label, street, country: country as 'NZ' | 'AU',
    contact_name: ((formData.get('contact_name') as string | null) || '').trim() || null,
    phone:        ((formData.get('phone')        as string | null) || '').trim() || null,
    notes:        ((formData.get('notes')        as string | null) || '').trim() || null,
    is_default:   formData.get('is_default') === 'on',
    is_active:    formData.get('is_active')  === 'on',
  }
}

export async function createDeliveryAddress(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/delivery-addresses/new?error=${encodeURIComponent(parsed)}`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Clear default-flag for the same country if this row is set as default
  if (parsed.is_default) {
    await supabase.from('delivery_addresses')
      .update({ is_default: false })
      .eq('country', parsed.country)
      .eq('is_default', true)
  }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { data, error } = await supabase
    .from('delivery_addresses')
    .insert({ ...parsed, created_by: profile?.id ?? null })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) redirect(`/delivery-addresses/new?error=${encodeURIComponent(error?.message ?? 'Save failed')}`)

  revalidatePath('/delivery-addresses')
  redirect(`/delivery-addresses/${data.id}?saved=1`)
}

export async function updateDeliveryAddress(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/delivery-addresses?error=${encodeURIComponent(parsed)}`)
  if (!parsed.id) redirect('/delivery-addresses?error=missing_id')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Clear default-flag for the same country if this row is being set as default
  if (parsed.is_default) {
    await supabase.from('delivery_addresses')
      .update({ is_default: false })
      .eq('country', parsed.country)
      .eq('is_default', true)
      .neq('id', parsed.id!)
  }

  const { id, ...update } = parsed
  const { error } = await supabase
    .from('delivery_addresses')
    .update(update)
    .eq('id', id!)

  if (error) redirect(`/delivery-addresses/${id}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/delivery-addresses')
  revalidatePath(`/delivery-addresses/${id}`)
  redirect(`/delivery-addresses/${id}?saved=1`)
}
