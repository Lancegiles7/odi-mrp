'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeLoadedNzd, type FxRates } from '@/lib/packaging-cost'
import { resolveQuantityPerUnit, type EntryMode } from '@/lib/packaging-entry'
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

  // Original Order baseline (migration 018)
  original_order_qty:    number | null
  original_order_date:   string | null
  original_order_notes:  string | null
  current_soh:           number | null
  current_soh_as_of:     string | null
}

function txt(raw: FormDataEntryValue | null): string | null {
  if (raw == null) return null
  const v = String(raw).trim()
  return v === '' ? null : v
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
    original_order_qty:    num(formData.get('original_order_qty')),
    original_order_date:   txt(formData.get('original_order_date')),
    original_order_notes:  txt(formData.get('original_order_notes')),
    current_soh:           num(formData.get('current_soh')),
    current_soh_as_of:     txt(formData.get('current_soh_as_of')),
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

  // Propagate cost change to every product that links to this packaging
  const { data: linked } = await supabase
    .from('product_packaging').select('product_id').eq('packaging_id', id!) as
    { data: Array<{ product_id: string }> | null }
  for (const row of linked ?? []) {
    await recomputeProductPackagingCost(supabase, row.product_id)
    revalidatePath(`/products/${row.product_id}`)
    revalidatePath(`/products/${row.product_id}/edit`)
  }

  revalidatePath('/packaging')
  revalidatePath(`/packaging/${id}`)
  revalidatePath('/packaging/demand')
  redirect(`/packaging/${id}?saved=1`)
}

// ============================================================
// Delete packaging item
// Blocks if PO lines or stock movements reference it (operational data).
// Cleans up product_packaging links + inventory_balances (BOM / derived).
// ============================================================
export async function deletePackaging(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing packaging id' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Operational refs: block delete
  const [poRes, smRes] = await Promise.all([
    supabase.from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('packaging_id', id),
    supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('packaging_id', id),
  ])
  const blockers: string[] = []
  if ((poRes.count ?? 0) > 0) blockers.push(`${poRes.count} purchase-order line${poRes.count === 1 ? '' : 's'}`)
  if ((smRes.count ?? 0) > 0) blockers.push(`${smRes.count} stock movement${smRes.count === 1 ? '' : 's'}`)
  if (blockers.length > 0) {
    return {
      ok: false,
      error: `Cannot delete: this packaging item is referenced by ${blockers.join(' and ')}. Mark it inactive instead.`,
    }
  }

  // Capture affected products so we can recompute their packaging cost after the delete
  const { data: priorLinks } = await supabase
    .from('product_packaging').select('product_id').eq('packaging_id', id) as
    { data: Array<{ product_id: string }> | null }
  const productIds = Array.from(new Set((priorLinks ?? []).map((l) => l.product_id)))

  // Clean up derived tables first
  const { error: ppErr } = await supabase.from('product_packaging').delete().eq('packaging_id', id)
  if (ppErr) return { ok: false, error: ppErr.message }
  const { error: ibErr } = await supabase.from('inventory_balances').delete().eq('packaging_id', id)
  if (ibErr) return { ok: false, error: ibErr.message }

  const { error: delErr } = await supabase.from('packaging').delete().eq('id', id)
  if (delErr) return { ok: false, error: delErr.message }

  // Recompute affected products' packaging cost
  for (const pid of productIds) {
    await recomputeProductPackagingCost(supabase, pid)
    revalidatePath(`/products/${pid}`)
    revalidatePath(`/products/${pid}/edit`)
  }

  revalidatePath('/packaging')
  revalidatePath('/packaging/demand')
  return { ok: true }
}

// ============================================================
// Batch create — packaging items + product BOM links in one go
// Called from the new product-first /packaging/new form.
// ============================================================
export interface BatchCreateRow {
  sku_code: string
  name: string
  type: string
  unit_of_measure: string
  supplier_id: string | null
  price: number | null
  currency: CurrencyCode
  freight_per_unit_nzd: number | null
  /** How the user entered the quantity. */
  entry_mode: EntryMode
  /** The number the user typed (per_pack: items per product; per_group: products per packaging). */
  entry_value: number
  include_in_cost: boolean
  current_soh: number | null
  original_order_qty: number | null
}

export async function batchCreatePackagingForProduct(input: {
  product_id: string
  original_order_date: string | null
  rows: BatchCreateRow[]
}): Promise<{ ok: boolean; error?: string; created?: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  if (!input.product_id) return { ok: false, error: 'Pick a product first' }
  const valid = input.rows.filter((r) => r.sku_code.trim() && r.name.trim() && r.entry_value > 0)
  if (valid.length === 0) return { ok: false, error: 'Add at least one packaging row with SKU, name and qty.' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const fxRates = await loadFxRates()

  const newPackagingIds: string[] = []
  for (const r of valid) {
    if (!isKnownPackagingType(r.type)) return { ok: false, error: `Invalid type "${r.type}" on ${r.sku_code}` }
    if (!SUPPORTED_CURRENCIES.includes(r.currency)) return { ok: false, error: `Invalid currency on ${r.sku_code}` }

    const total_loaded_cost_nzd = computeLoadedNzd({
      price: r.price, currency: r.currency, fx_rate_override: null, freight_per_unit_nzd: r.freight_per_unit_nzd,
    }, fxRates)

    const { data: pak, error: pakErr } = await supabase
      .from('packaging')
      .insert({
        sku_code:             r.sku_code.trim(),
        name:                 r.name.trim(),
        type:                 r.type,
        unit_of_measure:      r.unit_of_measure || 'each',
        supplier_id:          r.supplier_id,
        price:                r.price,
        currency:             r.currency,
        freight_per_unit_nzd: r.freight_per_unit_nzd,
        total_loaded_cost_nzd,
        opening_stock_override: r.current_soh,
        original_order_qty:    r.original_order_qty,
        original_order_date:   input.original_order_date,
        current_soh:           r.current_soh,
        current_soh_as_of:     input.original_order_date,   // sensible default; user can edit later
        is_active:             true,
        created_by:            profile?.id ?? null,
      })
      .select('id').single() as { data: { id: string } | null; error: { message: string; code?: string } | null }

    if (pakErr || !pak) {
      const msg = pakErr?.code === '23505'
        ? `SKU "${r.sku_code}" already exists. Pick a different SKU code.`
        : (pakErr?.message ?? 'Save failed')
      return { ok: false, error: msg }
    }
    newPackagingIds.push(pak.id)

    const qty = resolveQuantityPerUnit(r.entry_mode, r.entry_value)
    const { error: linkErr } = await supabase
      .from('product_packaging')
      .insert({
        product_id:        input.product_id,
        packaging_id:      pak.id,
        quantity_per_unit: qty,
        entry_mode:        r.entry_mode,
        entry_value:       r.entry_value,
        include_in_cost:   r.include_in_cost,
      })
    if (linkErr) return { ok: false, error: linkErr.message }
  }

  await recomputeProductPackagingCost(supabase, input.product_id)

  revalidatePath('/packaging')
  revalidatePath('/packaging/demand')
  revalidatePath(`/products/${input.product_id}`)
  revalidatePath(`/products/${input.product_id}/edit`)
  return { ok: true, created: newPackagingIds.length }
}

// ============================================================
// Product → Packaging BOM (called from the product edit page)
// ============================================================
export async function setProductPackagingBom(input: {
  product_id: string
  rows: Array<{
    packaging_id: string
    entry_mode?: EntryMode
    entry_value?: number
    /** Legacy callers can still pass quantity_per_unit; treated as per_pack. */
    quantity_per_unit?: number
    include_in_cost?: boolean
    notes: string | null
  }>
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Replace the whole set wholesale (simplest correct approach)
  const { error: delErr } = await supabase
    .from('product_packaging').delete().eq('product_id', input.product_id)
  if (delErr) return { ok: false, error: delErr.message }

  const inserts = input.rows
    .map((r) => {
      const mode  = r.entry_mode ?? 'per_pack'
      const value = r.entry_value ?? r.quantity_per_unit ?? 0
      const qty   = resolveQuantityPerUnit(mode, value)
      return { row: r, mode, value, qty }
    })
    .filter((x) => x.row.packaging_id && x.qty > 0)
    .map((x) => ({
      product_id:        input.product_id,
      packaging_id:      x.row.packaging_id,
      quantity_per_unit: x.qty,
      entry_mode:        x.mode,
      entry_value:       x.value,
      include_in_cost:   x.row.include_in_cost ?? true,
      notes:             x.row.notes,
    }))

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from('product_packaging').insert(inserts)
    if (insErr) return { ok: false, error: insErr.message }
  }

  // Recompute the product's per-pack packaging cost from the In-cost rows so
  // the existing product cost summary picks it up automatically.
  await recomputeProductPackagingCost(supabase, input.product_id)

  revalidatePath(`/products/${input.product_id}`)
  revalidatePath(`/products/${input.product_id}/edit`)
  revalidatePath('/packaging')
  revalidatePath('/packaging/demand')
  return { ok: true }
}

export async function recomputeProductPackagingCost(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<void> {
  const { data: links } = await supabase
    .from('product_packaging')
    .select('quantity_per_unit, include_in_cost, packaging:packaging_id ( total_loaded_cost_nzd )')
    .eq('product_id', productId) as {
      data: Array<{
        quantity_per_unit: number
        include_in_cost: boolean
        packaging: { total_loaded_cost_nzd: number | null } | null
      }> | null
    }

  let total = 0
  for (const r of links ?? []) {
    if (!r.include_in_cost) continue
    const cost = Number(r.packaging?.total_loaded_cost_nzd) || 0
    const qty  = Number(r.quantity_per_unit) || 0
    total += cost * qty
  }

  // Round to 4 dp (matches numeric(12,4) on products.packaging)
  const rounded = Math.round(total * 10000) / 10000

  await supabase.from('products').update({ packaging: rounded }).eq('id', productId)
}

// ============================================================
// Packaging → Products (called from the packaging edit page)
// Same join table, opposite direction. Replaces the set wholesale.
// ============================================================
export async function setPackagingProducts(input: {
  packaging_id: string
  rows: Array<{
    product_id: string
    entry_mode?: EntryMode
    entry_value?: number
    quantity_per_unit?: number
    include_in_cost?: boolean
    notes: string | null
  }>
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Capture which products were previously linked so we can recompute them
  // even if they're being removed in this save.
  const { data: priorLinks } = await supabase
    .from('product_packaging').select('product_id').eq('packaging_id', input.packaging_id) as
    { data: Array<{ product_id: string }> | null }

  const { error: delErr } = await supabase
    .from('product_packaging').delete().eq('packaging_id', input.packaging_id)
  if (delErr) return { ok: false, error: delErr.message }

  const inserts = input.rows
    .map((r) => {
      const mode  = r.entry_mode ?? 'per_pack'
      const value = r.entry_value ?? r.quantity_per_unit ?? 0
      const qty   = resolveQuantityPerUnit(mode, value)
      return { row: r, mode, value, qty }
    })
    .filter((x) => x.row.product_id && x.qty > 0)
    .map((x) => ({
      product_id:        x.row.product_id,
      packaging_id:      input.packaging_id,
      quantity_per_unit: x.qty,
      entry_mode:        x.mode,
      entry_value:       x.value,
      include_in_cost:   x.row.include_in_cost ?? true,
      notes:             x.row.notes,
    }))

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from('product_packaging').insert(inserts)
    if (insErr) return { ok: false, error: insErr.message }
  }

  // Recompute every product touched (added, removed, or unchanged via this save)
  const productIds = new Set<string>([
    ...(priorLinks ?? []).map((l) => l.product_id),
    ...inserts.map((r) => r.product_id),
  ])
  for (const pid of productIds) {
    await recomputeProductPackagingCost(supabase, pid)
  }

  revalidatePath(`/packaging/${input.packaging_id}`)
  revalidatePath('/packaging')
  revalidatePath('/packaging/demand')
  for (const pid of productIds) {
    revalidatePath(`/products/${pid}`)
    revalidatePath(`/products/${pid}/edit`)
  }
  return { ok: true }
}
