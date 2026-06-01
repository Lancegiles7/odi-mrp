'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server actions for the "PO companies" reference data — the legal entity
 * that appears in the letterhead at the top of each PO PDF.
 *
 * Mirrors the po_issuers actions.ts shape so the patterns stay aligned:
 * one default at a time (enforced by clearing other defaults on save),
 * soft-delete via is_active, and hard delete blocked when any PO still
 * references the row.
 */

interface CompanyForm {
  id?:                     string
  legal_name:              string
  country:                 string | null
  business_number_label:   string | null
  business_number:         string | null
  tax_number_label:        string | null
  tax_number:              string | null
  address:                 string | null
  website:                 string | null
  email:                   string | null
  phone:                   string | null
  logo_path:               string | null
  brand_colour:            string | null
  is_default:              boolean
  is_active:               boolean
  notes:                   string | null
}

function parsePayload(formData: FormData): CompanyForm | string {
  const id         = (formData.get('id') as string | null) || undefined
  const legal_name = ((formData.get('legal_name') as string | null) || '').trim()
  if (!legal_name) return 'Legal name is required'

  const trim = (k: string) => ((formData.get(k) as string | null) || '').trim() || null

  return {
    id, legal_name,
    country:               trim('country'),
    business_number_label: trim('business_number_label'),
    business_number:       trim('business_number'),
    tax_number_label:      trim('tax_number_label'),
    tax_number:            trim('tax_number'),
    address:               trim('address'),
    website:               trim('website'),
    email:                 trim('email'),
    phone:                 trim('phone'),
    logo_path:             trim('logo_path'),
    brand_colour:          trim('brand_colour'),
    notes:                 trim('notes'),
    is_default: formData.get('is_default') === 'on',
    is_active:  formData.get('is_active')  === 'on',
  }
}

async function clearOtherDefaults(supabase: ReturnType<typeof createClient>, excludeId?: string) {
  const q = supabase.from('po_companies').update({ is_default: false }).eq('is_default', true)
  if (excludeId) await q.neq('id', excludeId)
  else           await q
}

export async function createCompany(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/settings/companies/new?error=${encodeURIComponent(parsed)}`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (parsed.is_default) await clearOtherDefaults(supabase)

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { data, error } = await supabase
    .from('po_companies')
    .insert({ ...parsed, created_by: profile?.id ?? null })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) redirect(`/settings/companies/new?error=${encodeURIComponent(error?.message ?? 'Save failed')}`)

  revalidatePath('/settings/companies')
  revalidatePath('/settings')
  redirect(`/settings/companies/${data.id}?saved=1`)
}

export async function updateCompany(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/settings/companies?error=${encodeURIComponent(parsed)}`)
  if (!parsed.id) redirect('/settings/companies?error=missing_id')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (parsed.is_default) await clearOtherDefaults(supabase, parsed.id)

  const { id, ...update } = parsed
  const { error } = await supabase.from('po_companies').update(update).eq('id', id!)
  if (error) redirect(`/settings/companies/${id}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/settings/companies')
  revalidatePath('/settings')
  redirect(`/settings/companies/${id}?saved=1`)
}

export async function deleteCompany(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing company id' }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Block if any POs reference this company — they'd lose their letterhead silently.
  const { count } = await supabase
    .from('purchase_orders').select('id', { count: 'exact', head: true }).eq('company_id', id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot delete: ${count} purchase order${count === 1 ? '' : 's'} reference${count === 1 ? 's' : ''} this company. Mark inactive instead, or reassign those POs first.`,
    }
  }

  const { error } = await supabase.from('po_companies').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/companies')
  revalidatePath('/settings')
  return { ok: true }
}
