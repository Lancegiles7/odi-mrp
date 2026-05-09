'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeLoadedNzd, type FxRates } from '@/lib/packaging-cost'
import { isKnownPackagingType, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/constants'

interface PackagingForm {
  id?: string
  sku_code: string
  name: string
  type: string
  unit_of_measure: string
  description: string | null

  supplier_id: string | null
  supplier_sku_code: string | null
  supplier_pack_size: number | null
  supplier_pack_unit: string | null

  price: number | null
  currency: CurrencyCode
  fx_rate_override: number | null
  freight_per_unit_nzd: number | null

  opening_stock_override: number | null
  reorder_point: number | null
  is_active: boolean
  notes: string | null
}

function num(raw: FormDataEntryValue | null): number | null {
  if (raw == null || raw === '') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

function parsePayload(formData: FormData): PackagingForm | string {
  const id = (formData.get('id') as string | null) || undefined
  const sku_code = ((formData.get('sku_code') as string | null) || '').trim()
  const name     = ((formData.get('name')     as string | null) || '').trim()
  const type     = ((formData.get('type')     as string | null) || 'OTHER').trim()
  const currency = ((formData.get('currency') as string | null) || 'NZD').trim().toUpperCase() as CurrencyCode

  if (!sku_code) return 'SKU code is required'
  if (!name)     return 'Name is required'
  if (!isKnownPackagingType(type)) return 'Invalid type'
  if (!SUPPORTED_CURRENCIES.includes(currency as CurrencyCode)) return 'Invalid currency'

  return {
    id, sku_code, name, type, currency,
    unit_of_measure:        ((formData.get('unit_of_measure') as string | null) || 'each').trim(),
    description:            ((formData.get('description')     as string | null) || '').trim() || null,
    supplier_id:            ((formData.get('supplier_id')     as string | null) || '').trim() || null,
    supplier_sku_code:      ((formData.get('supplier_sku_code') as string | null) || '').trim() || null,
    supplier_pack_size:     num(formData.get('supplier_pack_size')),
    supplier_pack_unit:     ((formData.get('supplier_pack_unit') as string | null) || '').trim() || null,
    price:                  num(formData.get('price')),
    fx_rate_override:       num(formData.get('fx_rate_override')),
    freight_per_unit_nzd:   num(formData.get('freight_per_unit_nzd')),
    opening_stock_override: num(formData.get('opening_stock_override')),
    reorder_point:          num(formData.get('reorder_point')),
    is_active:              formData.get('is_active') === 'on',
    notes:                  ((formData.get('notes') as string | null) || '').trim() || null,
  }
}

async function loadFxRates(): Promise<FxRates> {
  const supabase = createClient()
  const { data } = await supabase
    .from('app_settings').select('fx_rates').eq('id', 1).maybeSingle() as { data: { fx_rates: FxRates } | null }
  return data?.fx_rates ?? { NZD: 1 }
}

export async function createPackaging(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/packaging/new?error=${encodeURIComponent(parsed)}`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const fxRates = await loadFxRates()
  const total_loaded_cost_nzd = computeLoadedNzd({
    price: parsed.price, currency: parsed.currency, fx_rate_override: parsed.fx_rate_override,
    freight_per_unit_nzd: parsed.freight_per_unit_nzd,
  }, fxRates)

  const { data, error } = await supabase
    .from('packaging')
    .insert({ ...parsed, total_loaded_cost_nzd, created_by: profile?.id ?? null })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) redirect(`/packaging/new?error=${encodeURIComponent(error?.message ?? 'Save failed')}`)

  revalidatePath('/packaging')
  redirect(`/packaging/${data.id}?saved=1`)
}

export async function updatePackaging(formData: FormData) {
  const parsed = parsePayload(formData)
  if (typeof parsed === 'string') redirect(`/packaging?error=${encodeURIComponent(parsed)}`)
  if (!parsed.id) redirect('/packaging?error=missing_id')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fxRates = await loadFxRates()
  const total_loaded_cost_nzd = computeLoadedNzd({
    price: parsed.price, currency: parsed.currency, fx_rate_override: parsed.fx_rate_override,
    freight_per_unit_nzd: parsed.freight_per_unit_nzd,
  }, fxRates)

  const { id, ...update } = parsed
  const { error } = await supabase
    .from('packaging')
    .update({ ...update, total_loaded_cost_nzd })
    .eq('id', id!)

  if (error) redirect(`/packaging/${id}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/packaging')
  revalidatePath(`/packaging/${id}`)
  redirect(`/packaging/${id}?saved=1`)
}

// ============================================================
// Product → Packaging BOM (called from the product edit page)
// ============================================================
export async function setProductPackagingBom(input: {
  product_id: string
  rows: Array<{ packaging_id: string; quantity_per_unit: number; notes: string | null }>
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Replace the whole set wholesale (simplest correct approach)
  const { error: delErr } = await supabase
    .from('product_packaging').delete().eq('product_id', input.product_id)
  if (delErr) return { ok: false, error: delErr.message }

  if (input.rows.length === 0) {
    revalidatePath(`/products/${input.product_id}`)
    revalidatePath('/packaging')
    return { ok: true }
  }

  const inserts = input.rows
    .filter((r) => r.packaging_id && r.quantity_per_unit > 0)
    .map((r) => ({
      product_id:        input.product_id,
      packaging_id:      r.packaging_id,
      quantity_per_unit: r.quantity_per_unit,
      notes:             r.notes,
    }))

  if (inserts.length === 0) {
    revalidatePath(`/products/${input.product_id}`)
    return { ok: true }
  }

  const { error: insErr } = await supabase.from('product_packaging').insert(inserts)
  if (insErr) return { ok: false, error: insErr.message }

  revalidatePath(`/products/${input.product_id}`)
  revalidatePath('/packaging')
  revalidatePath('/packaging/demand')
  return { ok: true }
}
