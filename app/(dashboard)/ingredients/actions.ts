'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { IngredientStatus, PriceChangeReason } from '@/lib/types/database.types'

// ============================================================
// Types
// ============================================================

export interface IngredientFormData {
  sku_code: string
  name: string
  confirmed_supplier?: string
  supplier_id?: string
  lead_time?: string
  status: IngredientStatus
  price?: string
  freight?: string
  total_loaded_cost?: string
  unit_of_measure?: string
  description?: string
  is_organic?: string
}

export interface ImportRow {
  sku_code: string
  name: string
  confirmed_supplier?: string
  lead_time?: string
  status?: string
  price?: number | null
  freight?: number | null
  total_loaded_cost?: number | null
  unit_of_measure?: string
}

export interface ImportResult {
  created: number
  updated: number
  failed: number
  errors: Array<{ row: number; sku_code: string; error: string }>
}

// ============================================================
// Helpers
// ============================================================

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

function str(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s === '' ? null : s
}

function normaliseStatus(raw: string | undefined | null): IngredientStatus {
  if (!raw) return 'confirmed'
  if (raw.includes('🟠')) return 'pending'
  if (raw.includes('✅')) return 'confirmed'
  const lower = raw.toLowerCase().trim()
  if (lower === 'pending') return 'pending'
  if (lower === 'inactive') return 'inactive'
  return 'confirmed'
}

function syntheticSupplierCode(name: string): string {
  return ('SUP-' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')).slice(0, 50)
}

/**
 * Resolve the supplier_id to link on the ingredient.
 *   - If supplier_id form field is set → use it.
 *   - Else if new_supplier_name is set → insert a new supplier row and return its id.
 *   - Else → null.
 */
async function resolveSupplierId(
  supabase: ReturnType<typeof createClient>,
  formData: FormData,
  createdBy: string | null,
): Promise<{ supplierId: string | null; supplierName: string | null; error?: string }> {
  const existingId = str(formData.get('supplier_id'))
  if (existingId) {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', existingId)
      .single()
    return { supplierId: data?.id ?? null, supplierName: data?.name ?? null }
  }

  const newName = str(formData.get('new_supplier_name'))
  if (!newName) return { supplierId: null, supplierName: null }

  let code = str(formData.get('new_supplier_code'))?.toUpperCase() ?? syntheticSupplierCode(newName)
  // Collision guard
  const { data: clash } = await supabase.from('suppliers').select('id').eq('code', code).maybeSingle()
  if (clash) code = `${code.slice(0, 44)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      code,
      name:                newName,
      contact_name:        str(formData.get('new_supplier_contact_name')),
      email:               str(formData.get('new_supplier_email')),
      phone:               str(formData.get('new_supplier_phone')),
      country_of_origin:   str(formData.get('new_supplier_country_of_origin')),
      country_of_purchase: str(formData.get('new_supplier_country_of_purchase')),
      currency:            str(formData.get('new_supplier_currency')),
      is_active:           true,
      created_by:          createdBy,
    })
    .select('id, name')
    .single()

  if (error || !data) {
    return { supplierId: null, supplierName: newName, error: error?.message ?? 'Failed to create supplier' }
  }
  return { supplierId: data.id, supplierName: data.name }
}

interface IngredientPayload {
  sku_code: string
  name: string
  confirmed_supplier: string | null
  supplier_id: string | null
  lead_time: string | null
  status: IngredientStatus
  price: number | null
  freight: number | null
  total_loaded_cost: number | null
  unit_of_measure: string | null
  description: string | null
  is_organic: boolean
  is_active: boolean
}

function buildPayloadFromForm(
  formData: FormData,
  supplierId: string | null,
  supplierName: string | null,
): IngredientPayload {
  const sku    = ((formData.get('sku_code') as string) ?? '').trim().toUpperCase()
  const name   = ((formData.get('name') as string) ?? '').trim()
  return {
    sku_code:           sku,
    name,
    confirmed_supplier: supplierName,                   // mirror for legacy readers
    supplier_id:        supplierId,
    lead_time:          str(formData.get('lead_time')),
    status:             ((formData.get('status') as IngredientStatus) || 'confirmed'),
    price:              parseNumeric(formData.get('price')),
    freight:            parseNumeric(formData.get('freight')),
    total_loaded_cost:  parseNumeric(formData.get('total_loaded_cost')),
    unit_of_measure:    str(formData.get('unit_of_measure')),
    description:        str(formData.get('description')),
    is_organic:         (formData.get('is_organic') as string) !== 'false',
    is_active:          true,
  }
}

/**
 * Append a price-history row when pricing changed (or on initial insert).
 * Called by the app layer so changed_by is always accurate.
 */
async function logPriceHistory(
  supabase: ReturnType<typeof createClient>,
  ingredientId: string,
  payload: Pick<IngredientPayload, 'price' | 'freight' | 'total_loaded_cost'>,
  reason: PriceChangeReason,
  changedBy: string | null,
) {
  if (payload.price == null && payload.freight == null && payload.total_loaded_cost == null) return
  await supabase.from('ingredient_price_history').insert({
    ingredient_id:     ingredientId,
    price:             payload.price,
    freight:           payload.freight,
    total_loaded_cost: payload.total_loaded_cost,
    change_reason:     reason,
    changed_by:        changedBy,
  })
}

function pricingChanged(
  before: { price: number | null; freight: number | null; total_loaded_cost: number | null },
  after:  { price: number | null; freight: number | null; total_loaded_cost: number | null },
) {
  return before.price             !== after.price
      || before.freight           !== after.freight
      || before.total_loaded_cost !== after.total_loaded_cost
}

// ============================================================
// createIngredient
// ============================================================
export async function createIngredient(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const returnTo = str(formData.get('return_to'))

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  const createdBy: string | null = profile ? user.id : null

  const { supplierId, supplierName } = await resolveSupplierId(supabase, formData, createdBy)
  const payload = buildPayloadFromForm(formData, supplierId, supplierName)

  if (!payload.sku_code || !payload.name) {
    redirect('/ingredients/new?error=missing_fields')
  }

  const { data: created, error } = await supabase
    .from('ingredients')
    .insert({ ...payload, created_by: createdBy })
    .select('id')
    .single()

  if (error || !created) {
    if (error?.code === '23505') {
      redirect(`/ingredients/new?error=duplicate_sku&sku=${encodeURIComponent(payload.sku_code)}`)
    }
    redirect('/ingredients/new?error=server')
  }

  await logPriceHistory(supabase, created.id, payload, 'initial', createdBy)

  revalidatePath('/ingredients')
  redirect(returnTo ?? '/ingredients')
}

// ============================================================
// updateIngredient
// ============================================================
export async function updateIngredient(id: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  const changedBy: string | null = profile ? user.id : null

  const { supplierId, supplierName } = await resolveSupplierId(supabase, formData, changedBy)
  const payload = buildPayloadFromForm(formData, supplierId, supplierName)

  if (!payload.sku_code || !payload.name) {
    redirect(`/ingredients/${id}/edit?error=missing_fields`)
  }

  // Read previous pricing to decide whether to log a history row
  const { data: before } = await supabase
    .from('ingredients')
    .select('price, freight, total_loaded_cost')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('ingredients')
    .update(payload)
    .eq('id', id)

  if (error) {
    if (error.code === '23505') redirect(`/ingredients/${id}/edit?error=duplicate_sku`)
    redirect(`/ingredients/${id}/edit?error=server`)
  }

  if (before && pricingChanged(before, payload)) {
    await logPriceHistory(supabase, id, payload, 'manual_update', changedBy)
  }

  revalidatePath('/ingredients')
  revalidatePath(`/ingredients/${id}`)
  redirect(`/ingredients/${id}`)
}

// ============================================================
// importIngredients (unchanged schema — legacy confirmed_supplier
// text is still accepted and stored; supplier FK is left null and
// can be linked from the ingredient detail page).
// ============================================================
export async function importIngredients(rows: ImportRow[]): Promise<ImportResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { created: 0, updated: 0, failed: rows.length, errors: [] }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  const createdBy: string | null = profile ? user.id : null

  const result: ImportResult = { created: 0, updated: 0, failed: 0, errors: [] }

  const { data: existing } = await supabase.from('ingredients').select('id, sku_code')
  const existingMap = new Map<string, string>(
    (existing ?? []).map((r) => [r.sku_code.toUpperCase(), r.id]),
  )

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const skuNormalised = (row.sku_code ?? '').trim().toUpperCase()

    if (!skuNormalised || !row.name?.trim()) {
      result.failed++
      result.errors.push({
        row: i + 1,
        sku_code: skuNormalised || '(blank)',
        error: 'SKU Code and Ingredient name are required.',
      })
      continue
    }

    const payload = {
      sku_code:           skuNormalised,
      name:               row.name.trim(),
      confirmed_supplier: row.confirmed_supplier?.trim() || null,
      lead_time:          row.lead_time?.trim() || null,
      status:             normaliseStatus(row.status),
      price:              parseNumeric(row.price),
      freight:            parseNumeric(row.freight),
      total_loaded_cost:  parseNumeric(row.total_loaded_cost),
      unit_of_measure:    row.unit_of_measure?.trim() || null,
      is_active:          true,
    }

    const existingId = existingMap.get(skuNormalised)

    if (existingId) {
      const { data: before } = await supabase
        .from('ingredients')
        .select('price, freight, total_loaded_cost')
        .eq('id', existingId)
        .single()

      const { error } = await supabase.from('ingredients').update(payload).eq('id', existingId)
      if (error) {
        result.failed++
        result.errors.push({ row: i + 1, sku_code: skuNormalised, error: error.message })
      } else {
        result.updated++
        if (before && pricingChanged(before, payload)) {
          await logPriceHistory(supabase, existingId, payload, 'import', createdBy)
        }
      }
    } else {
      const { data: created, error } = await supabase
        .from('ingredients')
        .insert({ ...payload, created_by: createdBy })
        .select('id')
        .single()

      if (error || !created) {
        result.failed++
        result.errors.push({ row: i + 1, sku_code: skuNormalised, error: error?.message ?? 'insert failed' })
      } else {
        result.created++
        existingMap.set(skuNormalised, created.id)
        await logPriceHistory(supabase, created.id, payload, 'initial', createdBy)
      }
    }
  }

  revalidatePath('/ingredients')
  return result
}
