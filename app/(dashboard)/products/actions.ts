'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { recomputeProductPackagingCost } from '@/app/(dashboard)/packaging/actions'
import { ROLES, SOFT_DELETE_WINDOW_DAYS } from '@/lib/constants'

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, roles(name)')
    .eq('id', user.id)
    .single() as { data: { id: string; roles: { name: string } | null } | null }

  if (profile?.roles?.name !== ROLES.ADMIN) redirect('/?error=forbidden')
  return { supabase, profileId: profile.id }
}

// ============================================================
// Types
// ============================================================

export interface ProductFormData {
  sku_code: string
  name: string
  product_type?: string
  size_g?: string
  hero_call_out?: string
  back_of_pack?: string
  serving_size?: string
  wet_weight_g?: string
  rrp?: string
  rrp_au?: string
  unit_of_measure?: string
  description?: string
  packaging?: string
  toll?: string
  margin?: string
  other?: string
  freight_nz?: string
  freight_au?: string
  toll_currency?: string
  margin_currency?: string
  other_currency?: string
  freight_nz_currency?: string
  freight_au_currency?: string
  apply_fx?: string
  wastage_pct_input?: string
  manufacturer?: string
  manufacturer_au?: string
  manufacture_market?: string
  toll_au?: string
  opening_stock_override?: string
  // Original Order baseline (migration 018)
  original_order_qty?: string
  original_order_date?: string
  original_order_notes?: string
  current_soh?: string
  current_soh_as_of?: string
}

const VALID_GROUPS = new Set([
  'pouches', 'snacks_4bs', 'puffs_melts', 'tubs', 'sachets', 'noodles', 'vitamin_d',
])

export interface BomItemInput {
  ingredient_id: string
  quantity_g: number
  wet_quantity_g?: number | null
  unit_quantity?: number | null
  price_override?: number | null
  notes?: string | null
  sort_order: number
}

export interface ImportProductInput {
  sku_code: string
  name: string
  product_type?: string
  size_g?: number | null
  hero_call_out?: string | null
  back_of_pack?: string | null
  serving_size?: number | null
  rrp?: number | null
  packaging?: number | null
  toll?: number | null
  margin?: number | null
  other?: number | null
  currency_exchange?: number | null
  freight?: number | null
  bom_items: Array<{
    ingredient_sku_code: string
    ingredient_name: string
    quantity_g: number
    price_per_kg?: number | null   // stored on ingredient if new
    notes?: string | null
    is_organic?: boolean
    sort_order: number
  }>
}

export interface ImportResult {
  products_created: number
  products_updated: number
  ingredients_created: number
  bom_items_created: number
  failed: number
  errors: Array<{ product: string; error: string }>
}

// ============================================================
// Helpers
// ============================================================

function parseNum(val: string | undefined | null): number | null {
  if (!val?.trim()) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

// Normalise a currency form value to 'AUD' | 'NZD', falling back to `def`.
function parseCurrency(val: string | undefined | null, def: 'AUD' | 'NZD'): 'AUD' | 'NZD' {
  return val === 'AUD' || val === 'NZD' ? val : def
}

function buildProductPayload(data: ProductFormData) {
  const rawType = data.product_type?.trim() || null
  const productType = rawType && VALID_GROUPS.has(rawType) ? rawType : null

  const wastagePctInput = parseNum(data.wastage_pct_input)
  // Convert % (0–100) → fraction (0–1), clamped.
  const wastagePct = wastagePctInput != null
    ? Math.max(0, Math.min(1, wastagePctInput / 100))
    : 0

  return {
    sku_code:        data.sku_code.trim().toUpperCase(),
    name:            data.name.trim(),
    product_type:    productType,
    size_g:          parseNum(data.size_g),
    hero_call_out:   data.hero_call_out?.trim() || null,
    back_of_pack:    data.back_of_pack?.trim() || null,
    serving_size:    parseNum(data.serving_size),
    wet_weight_g:    parseNum(data.wet_weight_g),
    rrp:             parseNum(data.rrp),
    rrp_au:          parseNum(data.rrp_au),
    unit_of_measure: data.unit_of_measure?.trim() || 'each',
    description:     data.description?.trim() || null,
    packaging:       parseNum(data.packaging),
    toll:            parseNum(data.toll),
    toll_au:         parseNum(data.toll_au),
    margin:          parseNum(data.margin),
    other:           parseNum(data.other),
    freight_nz:      parseNum(data.freight_nz),
    freight_au:      parseNum(data.freight_au),
    toll_currency:       parseCurrency(data.toll_currency,       'AUD'),
    margin_currency:     parseCurrency(data.margin_currency,     'AUD'),
    other_currency:      parseCurrency(data.other_currency,      'AUD'),
    freight_nz_currency: parseCurrency(data.freight_nz_currency, 'NZD'),
    freight_au_currency: parseCurrency(data.freight_au_currency, 'NZD'),
    apply_fx:        data.apply_fx === 'true',
    wastage_pct:     wastagePct,
    manufacturer:    data.manufacturer?.trim() || null,
    manufacturer_au: data.manufacturer_au?.trim() || null,
    manufacture_market: (['NZ','AU','BOTH'] as const).includes(data.manufacture_market as 'NZ'|'AU'|'BOTH')
      ? (data.manufacture_market as 'NZ'|'AU'|'BOTH') : 'NZ',
    opening_stock_override: parseNum(data.opening_stock_override),
    is_active:       true,
    original_order_qty:    parseNum(data.original_order_qty),
    original_order_date:   data.original_order_date?.trim() || null,
    original_order_notes:  data.original_order_notes?.trim() || null,
    current_soh:           parseNum(data.current_soh),
    current_soh_as_of:     data.current_soh_as_of?.trim() || null,
  }
}

function formDataToProductForm(formData: FormData): ProductFormData {
  return {
    sku_code:          formData.get('sku_code') as string,
    name:              formData.get('name') as string,
    product_type:      formData.get('product_type') as string,
    size_g:            formData.get('size_g') as string,
    hero_call_out:     formData.get('hero_call_out') as string,
    back_of_pack:      formData.get('back_of_pack') as string,
    serving_size:      formData.get('serving_size') as string,
    wet_weight_g:      formData.get('wet_weight_g') as string,
    rrp:               formData.get('rrp') as string,
    rrp_au:            formData.get('rrp_au') as string,
    unit_of_measure:   formData.get('unit_of_measure') as string,
    description:       formData.get('description') as string,
    packaging:         formData.get('packaging') as string,
    toll:              formData.get('toll') as string,
    toll_au:           formData.get('toll_au') as string,
    margin:            formData.get('margin') as string,
    other:             formData.get('other') as string,
    freight_nz:        formData.get('freight_nz') as string,
    freight_au:        formData.get('freight_au') as string,
    toll_currency:       formData.get('toll_currency') as string,
    margin_currency:     formData.get('margin_currency') as string,
    other_currency:      formData.get('other_currency') as string,
    freight_nz_currency: formData.get('freight_nz_currency') as string,
    freight_au_currency: formData.get('freight_au_currency') as string,
    apply_fx:          formData.get('apply_fx') as string,
    wastage_pct_input: formData.get('wastage_pct_input') as string,
    manufacturer:      formData.get('manufacturer') as string,
    manufacturer_au:   formData.get('manufacturer_au') as string,
    manufacture_market: formData.get('manufacture_market') as string,
    opening_stock_override: formData.get('opening_stock_override') as string,
    original_order_qty:    formData.get('original_order_qty') as string,
    original_order_date:   formData.get('original_order_date') as string,
    original_order_notes:  formData.get('original_order_notes') as string,
    current_soh:           formData.get('current_soh') as string,
    current_soh_as_of:     formData.get('current_soh_as_of') as string,
  }
}

// ============================================================
// createProduct
// ============================================================
export async function createProduct(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = formDataToProductForm(formData)

  if (!data.sku_code?.trim() || !data.name?.trim()) {
    redirect('/products/new?error=missing_fields')
  }

  const { data: { id: profileId } = {}, } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Insert product
  const { data: product, error } = await supabase
    .from('products')
    .insert({ ...buildProductPayload(data), created_by: profileId ?? null })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') redirect('/products/new?error=duplicate_sku')
    redirect('/products/new?error=server')
  }

  // Create empty BOM version 1
  await supabase.from('boms').insert({
    product_id: product.id,
    version: 1,
    is_active: true,
    created_by: profileId ?? null,
  })

  revalidatePath('/products')
  redirect(`/products/${product.id}`)
}

// ============================================================
// updateProduct
// ============================================================
export async function updateProduct(id: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = formDataToProductForm(formData)

  if (!data.sku_code?.trim() || !data.name?.trim()) {
    redirect(`/products/${id}/edit?error=missing_fields`)
  }

  const { error } = await supabase
    .from('products')
    .update(buildProductPayload(data))
    .eq('id', id)

  if (error) {
    if (error.code === '23505') redirect(`/products/${id}/edit?error=duplicate_sku`)
    redirect(`/products/${id}/edit?error=server`)
  }

  revalidatePath('/products')
  revalidatePath(`/products/${id}`)
  revalidatePath(`/products/${id}/print`)
  redirect(`/products/${id}`)
}

// ============================================================
// saveBomItems
// Replaces ALL bom_items for a given bom_id in one operation.
// Called from the BOM editor client component.
// ============================================================
export async function saveBomItems(
  bomId: string,
  items: BomItemInput[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Delete existing items
  const { error: delError } = await supabase
    .from('bom_items')
    .delete()
    .eq('bom_id', bomId)

  if (delError) return { success: false, error: delError.message }

  // Insert new items (skip empty rows)
  const validItems = items.filter((i) => i.ingredient_id && i.quantity_g > 0)
  if (validItems.length > 0) {
    const { error: insError } = await supabase.from('bom_items').insert(
      validItems.map((item) => ({
        bom_id:         bomId,
        ingredient_id:  item.ingredient_id,
        quantity_g:     item.quantity_g,
        wet_quantity_g: item.wet_quantity_g ?? null,
        unit_quantity:  item.unit_quantity ?? null,
        uom:            'g',
        price_override: item.price_override ?? null,
        notes:          item.notes ?? null,
        sort_order:     item.sort_order,
      }))
    )
    if (insError) return { success: false, error: insError.message }
  }

  revalidatePath('/products')
  return { success: true }
}

// ============================================================
// addAuBuild — turn a product into a dual build.
// Creates an AU (VMC) recipe + packaging seeded as a copy of the NZ build, so
// the user only edits what VMC does differently. Idempotent: if an AU build
// already exists it's a no-op.
// ============================================================
export async function addAuBuild(productId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Already has an active AU build? Nothing to do.
  const { data: existingAu } = await supabase
    .from('boms').select('id').eq('product_id', productId).eq('market', 'AU').eq('is_active', true).maybeSingle() as
    { data: { id: string } | null }
  if (existingAu) return { ok: true }

  // Source = the active NZ build.
  const { data: nzBom } = await supabase
    .from('boms').select('id').eq('product_id', productId).eq('market', 'NZ').eq('is_active', true).maybeSingle() as
    { data: { id: string } | null }

  // Create the AU BOM shell.
  const { data: auBom, error: bomErr } = await supabase
    .from('boms').insert({ product_id: productId, market: 'AU', version: 1, is_active: true, created_by: user.id })
    .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
  if (bomErr || !auBom) return { ok: false, error: bomErr?.message ?? 'Could not create AU build' }

  // Copy the NZ recipe lines into the AU BOM.
  if (nzBom) {
    const { data: srcItems } = await supabase
      .from('bom_items')
      .select('ingredient_id, quantity_g, wet_quantity_g, unit_quantity, uom, price_override, notes, sort_order')
      .eq('bom_id', nzBom.id) as { data: Array<Record<string, unknown>> | null }
    if (srcItems && srcItems.length > 0) {
      const { error: copyErr } = await supabase
        .from('bom_items')
        .insert(srcItems.map((it) => ({ ...it, bom_id: auBom.id })))
      if (copyErr) return { ok: false, error: copyErr.message }
    }
  }

  // Copy the NZ packaging links into the AU market.
  const { data: nzPack } = await supabase
    .from('product_packaging')
    .select('packaging_id, quantity_per_unit, entry_mode, entry_value, include_in_cost, notes')
    .eq('product_id', productId).eq('market', 'NZ') as { data: Array<Record<string, unknown>> | null }
  if (nzPack && nzPack.length > 0) {
    await supabase.from('product_packaging').insert(nzPack.map((p) => ({ ...p, product_id: productId, market: 'AU' })))
  }

  // Seed the dual-build switches: name VMC + copy toll + AU packaging rollup.
  const { data: prod } = await supabase
    .from('products').select('manufacturer_au, toll, toll_au').eq('id', productId).maybeSingle() as
    { data: { manufacturer_au: string | null; toll: number | null; toll_au: number | null } | null }
  await supabase.from('products').update({
    manufacturer_au: prod?.manufacturer_au?.trim() || 'VMC',
    toll_au:         prod?.toll_au ?? prod?.toll ?? null,
  }).eq('id', productId)
  await recomputeProductPackagingCost(supabase, productId, 'AU')

  revalidatePath(`/products/${productId}`)
  revalidatePath(`/products/${productId}/edit`)
  return { ok: true }
}

// ============================================================
// removeAuBuild — drop the AU build entirely (back to NZ-only).
// ============================================================
export async function removeAuBuild(productId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: auBoms } = await supabase
    .from('boms').select('id').eq('product_id', productId).eq('market', 'AU') as
    { data: Array<{ id: string }> | null }
  for (const b of auBoms ?? []) {
    await supabase.from('bom_items').delete().eq('bom_id', b.id)
  }
  await supabase.from('boms').delete().eq('product_id', productId).eq('market', 'AU')
  await supabase.from('product_packaging').delete().eq('product_id', productId).eq('market', 'AU')
  await supabase.from('products')
    .update({ packaging_au: null, manufacturer_au: null, toll_au: null })
    .eq('id', productId)

  revalidatePath(`/products/${productId}`)
  revalidatePath(`/products/${productId}/edit`)
  return { ok: true }
}

// ============================================================
// importProductsAndBoms
// Full import: creates/updates products, BOMs, BOM items,
// and auto-creates missing ingredients.
// ============================================================
export async function importProductsAndBoms(
  products: ImportProductInput[]
): Promise<ImportResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { products_created: 0, products_updated: 0, ingredients_created: 0, bom_items_created: 0, failed: products.length, errors: [] }
  }

  const { data: profileRow } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profileRow ? user.id : null

  // Pre-load all existing ingredients by sku_code
  const { data: existingIngredients } = await supabase
    .from('ingredients')
    .select('id, sku_code, total_loaded_cost')

  const ingredientMap = new Map<string, string>(
    (existingIngredients ?? []).map((i) => [i.sku_code.toUpperCase(), i.id])
  )

  const result: ImportResult = {
    products_created: 0,
    products_updated: 0,
    ingredients_created: 0,
    bom_items_created: 0,
    failed: 0,
    errors: [],
  }

  for (const prod of products) {
    try {
      // ── Resolve / create ingredients ─────────────────────
      const resolvedItems: BomItemInput[] = []

      for (const item of prod.bom_items) {
        const skuNorm = item.ingredient_sku_code.trim().toUpperCase()
        let ingredientId = ingredientMap.get(skuNorm)

        if (!ingredientId) {
          // Auto-create ingredient
          const { data: newIng, error: ingErr } = await supabase
            .from('ingredients')
            .insert({
              sku_code:          skuNorm,
              name:              item.ingredient_name.trim(),
              unit_of_measure:   'g',
              total_loaded_cost: item.price_per_kg ?? null,
              cost_per_unit:     item.price_per_kg ?? null,
              is_organic:        item.is_organic ?? true,
              status:            'confirmed',
              is_active:         true,
              created_by:        createdBy,
            })
            .select('id')
            .single()

          if (ingErr || !newIng) {
            // Ingredient may already exist (race) — try to fetch
            const { data: existing } = await supabase
              .from('ingredients')
              .select('id')
              .eq('sku_code', skuNorm)
              .single()
            if (existing) {
              ingredientId = existing.id
            } else {
              continue // skip this line
            }
          } else {
            ingredientId = newIng.id
            ingredientMap.set(skuNorm, ingredientId)
            result.ingredients_created++
          }
        }

        resolvedItems.push({
          ingredient_id:  ingredientId,
          quantity_g:     item.quantity_g,
          price_override: null,
          notes:          item.notes ?? null,
          sort_order:     item.sort_order,
        })
      }

      // ── Upsert product ───────────────────────────────────
      const skuNorm = prod.sku_code.trim().toUpperCase()

      const { data: existingProduct } = await supabase
        .from('products')
        .select('id')
        .eq('sku_code', skuNorm)
        .maybeSingle()

      let productId: string

      if (existingProduct) {
        await supabase
          .from('products')
          .update({
            name:              prod.name.trim(),
            product_type:      prod.product_type ?? null,
            size_g:            prod.size_g ?? null,
            hero_call_out:     prod.hero_call_out ?? null,
            back_of_pack:      prod.back_of_pack ?? null,
            serving_size:      prod.serving_size ?? null,
            rrp:               prod.rrp ?? null,
            rrp_au:            prod.rrp ?? null,
            packaging:         prod.packaging ?? null,
            toll:              prod.toll ?? null,
            margin:            prod.margin ?? null,
            other:             prod.other ?? null,
            currency_exchange: prod.currency_exchange ?? null,
            freight:           prod.freight ?? null,
            freight_nz:        prod.freight ?? null,
            freight_au:        prod.freight ?? null,
            toll_currency:       'AUD',
            margin_currency:     'AUD',
            other_currency:      'AUD',
            freight_nz_currency: 'NZD',
            freight_au_currency: 'NZD',
            unit_of_measure:   'each',
            is_active:         true,
          })
          .eq('id', existingProduct.id)

        productId = existingProduct.id
        result.products_updated++
      } else {
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            sku_code:          skuNorm,
            name:              prod.name.trim(),
            product_type:      prod.product_type ?? null,
            size_g:            prod.size_g ?? null,
            hero_call_out:     prod.hero_call_out ?? null,
            back_of_pack:      prod.back_of_pack ?? null,
            serving_size:      prod.serving_size ?? null,
            rrp:               prod.rrp ?? null,
            rrp_au:            prod.rrp ?? null,
            packaging:         prod.packaging ?? null,
            toll:              prod.toll ?? null,
            margin:            prod.margin ?? null,
            other:             prod.other ?? null,
            currency_exchange: prod.currency_exchange ?? null,
            freight:           prod.freight ?? null,
            freight_nz:        prod.freight ?? null,
            freight_au:        prod.freight ?? null,
            toll_currency:       'AUD',
            margin_currency:     'AUD',
            other_currency:      'AUD',
            freight_nz_currency: 'NZD',
            freight_au_currency: 'NZD',
            unit_of_measure:   'each',
            is_active:         true,
            created_by:        createdBy,
          })
          .select('id')
          .single()

        if (prodErr || !newProd) throw new Error(prodErr?.message ?? 'Failed to create product')

        productId = newProd.id
        result.products_created++
      }

      // ── Upsert BOM (always version 1 for import) ─────────
      const { data: existingBom } = await supabase
        .from('boms')
        .select('id')
        .eq('product_id', productId)
        .eq('version', 1)
        .maybeSingle()

      let bomId: string

      if (existingBom) {
        bomId = existingBom.id
      } else {
        const { data: newBom, error: bomErr } = await supabase
          .from('boms')
          .insert({ product_id: productId, version: 1, is_active: true, created_by: createdBy })
          .select('id')
          .single()
        if (bomErr || !newBom) throw new Error(bomErr?.message ?? 'Failed to create BOM')
        bomId = newBom.id
      }

      // ── Replace BOM items ─────────────────────────────────
      await supabase.from('bom_items').delete().eq('bom_id', bomId)

      if (resolvedItems.length > 0) {
        await supabase.from('bom_items').insert(
          resolvedItems.map((item) => ({
            bom_id:        bomId,
            ingredient_id: item.ingredient_id,
            quantity_g:    item.quantity_g,
            uom:           'g',
            price_override: item.price_override,
            notes:         item.notes,
            sort_order:    item.sort_order,
          }))
        )
        result.bom_items_created += resolvedItems.length
      }
    } catch (err) {
      result.failed++
      result.errors.push({
        product: prod.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  revalidatePath('/products')
  return result
}

// ============================================================
// SOFT DELETE — sets deleted_at + is_active=false. Admin only.
// Recoverable from /products/trash for 30 days.
// ============================================================
export async function softDeleteProduct(id: string) {
  const { supabase, profileId } = await requireAdmin()

  const { error } = await supabase
    .from('products')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profileId,
      is_active:  false,
    })
    .eq('id', id)

  if (error) redirect(`/products/${id}?error=delete_failed`)

  revalidatePath('/products')
  revalidatePath('/products/trash')
  redirect('/products?deleted=1')
}

// ============================================================
// RESTORE — clears deleted_at, sets is_active=true. Admin only.
// ============================================================
export async function restoreProduct(id: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('products')
    .update({
      deleted_at: null,
      deleted_by: null,
      is_active:  true,
    })
    .eq('id', id)

  if (error) redirect('/products/trash?error=restore_failed')

  revalidatePath('/products')
  revalidatePath('/products/trash')
  redirect(`/products/${id}?restored=1`)
}

// ============================================================
// PERMANENT DELETE — hard delete. Admin only.
// Cascades to boms + bom_items via FK ON DELETE CASCADE.
// ============================================================
export async function permanentlyDeleteProduct(id: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) redirect('/products/trash?error=purge_failed')

  revalidatePath('/products')
  revalidatePath('/products/trash')
  redirect('/products/trash?purged=1')
}

// ============================================================
// PURGE EXPIRED — deletes everything past the 30-day window.
// Called from the trash page on load so it self-cleans.
// ============================================================
export async function purgeExpiredProducts(): Promise<{ purged: number }> {
  const { supabase } = await requireAdmin()

  const cutoff = new Date(Date.now() - SOFT_DELETE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('products')
    .delete()
    .lt('deleted_at', cutoff)
    .not('deleted_at', 'is', null)
    .select('id')

  if (error) return { purged: 0 }

  revalidatePath('/products/trash')
  return { purged: data?.length ?? 0 }
}

// ============================================================
// exportProductsCsv — product master as CSV (system SKU, name, group,
// prices). Used to build the Budget-vs-Actual import mapping between the
// FG- export codes and the MRP system SKUs.
// ============================================================
export async function exportProductsCsv(): Promise<{ ok: boolean; csv?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: products, error } = await supabase
    .from('products')
    .select('sku_code, name, product_type, rrp, rrp_au, is_active')
    .is('deleted_at', null)
    .order('product_type')
    .order('name') as { data: Array<{
      sku_code: string; name: string; product_type: string | null
      rrp: number | null; rrp_au: number | null; is_active: boolean
    }> | null }

  if (error) return { ok: false, error: error.message }

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['system_sku', 'name', 'group', 'rrp_nz', 'rrp_au', 'is_active']
  const lines = [header.join(',')]
  for (const p of products ?? []) {
    lines.push([p.sku_code, p.name, p.product_type ?? '', p.rrp ?? '', p.rrp_au ?? '', p.is_active].map(esc).join(','))
  }
  return { ok: true, csv: lines.join('\n') }
}
