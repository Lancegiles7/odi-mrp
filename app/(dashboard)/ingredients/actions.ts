'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { IngredientStatus } from '@/lib/types/database.types'

// ============================================================
// Types
// ============================================================

export interface IngredientFormData {
  sku_code: string
  name: string
  confirmed_supplier?: string
  lead_time?: string
  status: IngredientStatus
  price?: string
  freight?: string
  total_loaded_cost?: string
  unit_of_measure?: string
  description?: string
  notes?: string
  is_organic?: string   // form radio sends 'true' or 'false'
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

function normaliseStatus(raw: string | undefined | null): IngredientStatus {
  if (!raw) return 'confirmed'
  if (raw.includes('🟠')) return 'pending'
  if (raw.includes('✅')) return 'confirmed'
  const lower = raw.toLowerCase().trim()
  if (lower === 'pending') return 'pending'
  if (lower === 'inactive') return 'inactive'
  return 'confirmed'
}

function buildIngredientPayload(data: IngredientFormData) {
  return {
    sku_code:           data.sku_code.trim().toUpperCase(),
    name:               data.name.trim(),
    confirmed_supplier: data.confirmed_supplier?.trim() || null,
    lead_time:          data.lead_time?.trim() || null,
    status:             data.status,
    price:              parseNumeric(data.price),
    freight:            parseNumeric(data.freight),
    total_loaded_cost:  parseNumeric(data.total_loaded_cost),
    unit_of_measure:    data.unit_of_measure?.trim() || null,
    description:        data.description?.trim() || null,
    is_organic:         data.is_organic !== 'false',  // default true
    is_active:          true,
  }
}

// ============================================================
// createIngredient
// ============================================================
export async function createIngredient(formData: FormData) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const data: IngredientFormData = {
    sku_code:           formData.get('sku_code') as string,
    name:               formData.get('name') as string,
    confirmed_supplier: formData.get('confirmed_supplier') as string,
    lead_time:          formData.get('lead_time') as string,
    status:             (formData.get('status') as IngredientStatus) || 'confirmed',
    price:              formData.get('price') as string,
    freight:            formData.get('freight') as string,
    total_loaded_cost:  formData.get('total_loaded_cost') as string,
    unit_of_measure:    formData.get('unit_of_measure') as string,
    description:        formData.get('description') as string,
    is_organic:         formData.get('is_organic') as string,
  }

  if (!data.sku_code?.trim() || !data.name?.trim()) {
    redirect('/ingredients/new?error=missing_fields')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  const { error } = await supabase
    .from('ingredients')
    .insert({ ...buildIngredientPayload(data), created_by: profile ? user.id : null })

  if (error) {
    if (error.code === '23505') {
      // Unique violation — duplicate SKU code
      redirect(`/ingredients/new?error=duplicate_sku&sku=${encodeURIComponent(data.sku_code)}`)
    }
    redirect('/ingredients/new?error=server')
  }

  revalidatePath('/ingredients')
  redirect('/ingredients')
}

// ============================================================
// updateIngredient
// ============================================================
export async function updateIngredient(id: string, formData: FormData) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const data: IngredientFormData = {
    sku_code:           formData.get('sku_code') as string,
    name:               formData.get('name') as string,
    confirmed_supplier: formData.get('confirmed_supplier') as string,
    lead_time:          formData.get('lead_time') as string,
    status:             (formData.get('status') as IngredientStatus) || 'confirmed',
    price:              formData.get('price') as string,
    freight:            formData.get('freight') as string,
    total_loaded_cost:  formData.get('total_loaded_cost') as string,
    unit_of_measure:    formData.get('unit_of_measure') as string,
    description:        formData.get('description') as string,
    is_organic:         formData.get('is_organic') as string,
  }

  if (!data.sku_code?.trim() || !data.name?.trim()) {
    redirect(`/ingredients/${id}/edit?error=missing_fields`)
  }

  const { error } = await supabase
    .from('ingredients')
    .update(buildIngredientPayload(data))
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      redirect(`/ingredients/${id}/edit?error=duplicate_sku`)
    }
    redirect(`/ingredients/${id}/edit?error=server`)
  }

  revalidatePath('/ingredients')
  redirect('/ingredients')
}

// ============================================================
// importIngredients
// Called from the import page with pre-parsed JSON rows.
// Upserts by sku_code — inserts new, updates existing.
// ============================================================
export async function importIngredients(rows: ImportRow[]): Promise<ImportResult> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { created: 0, updated: 0, failed: rows.length, errors: [] }
  }

  // Only set created_by if the user has a user_profiles row.
  // A missing profile (e.g. admin account not yet set up) must not block the import.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  const createdBy: string | null = profile ? user.id : null

  const result: ImportResult = { created: 0, updated: 0, failed: 0, errors: [] }

  // Fetch all existing sku_codes in one query for efficient lookup
  const { data: existing } = await supabase
    .from('ingredients')
    .select('id, sku_code')

  const existingMap = new Map<string, string>(
    (existing ?? []).map((r) => [r.sku_code.toUpperCase(), r.id])
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
      const { error } = await supabase
        .from('ingredients')
        .update(payload)
        .eq('id', existingId)

      if (error) {
        result.failed++
        result.errors.push({ row: i + 1, sku_code: skuNormalised, error: error.message })
      } else {
        result.updated++
      }
    } else {
      const { error } = await supabase
        .from('ingredients')
        .insert({ ...payload, created_by: createdBy })

      if (error) {
        result.failed++
        result.errors.push({ row: i + 1, sku_code: skuNormalised, error: error.message })
      } else {
        result.created++
        // Add to map so duplicate rows within the same import are caught
        existingMap.set(skuNormalised, 'new')
      }
    }
  }

  revalidatePath('/ingredients')
  return result
}
