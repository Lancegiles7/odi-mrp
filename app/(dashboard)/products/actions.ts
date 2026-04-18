'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
  rrp?: string
  unit_of_measure?: string
  description?: string
  packaging?: string
  toll?: string
  margin?: string
  other?: string
  currency_exchange?: string
  freight?: string
}

export interface BomItemInput {
  ingredient_id: string
  quantity_g: number
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

function buildProductPayload(data: ProductFormData) {
  return {
    sku_code:          data.sku_code.trim().toUpperCase(),
    name:              data.name.trim(),
    product_type:      data.product_type?.trim() || null,
    size_g:            parseNum(data.size_g),
    hero_call_out:     data.hero_call_out?.trim() || null,
    back_of_pack:      data.back_of_pack?.trim() || null,
    serving_size:      parseNum(data.serving_size),
    rrp:               parseNum(data.rrp),
    unit_of_measure:   data.unit_of_measure?.trim() || 'each',
    description:       data.description?.trim() || null,
    packaging:         parseNum(data.packaging),
    toll:              parseNum(data.toll),
    margin:            parseNum(data.margin),
    other:             parseNum(data.other),
    currency_exchange: parseNum(data.currency_exchange),
    freight:           parseNum(data.freight),
    is_active:         true,
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
    rrp:               formData.get('rrp') as string,
    unit_of_measure:   formData.get('unit_of_measure') as string,
    description:       formData.get('description') as string,
    packaging:         formData.get('packaging') as string,
    toll:              formData.get('toll') as string,
    margin:            formData.get('margin') as string,
    other:             formData.get('other') as string,
    currency_exchange: formData.get('currency_exchange') as string,
    freight:           formData.get('freight') as string,
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
            packaging:         prod.packaging ?? null,
            toll:              prod.toll ?? null,
            margin:            prod.margin ?? null,
            other:             prod.other ?? null,
            currency_exchange: prod.currency_exchange ?? null,
            freight:           prod.freight ?? null,
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
            packaging:         prod.packaging ?? null,
            toll:              prod.toll ?? null,
            margin:            prod.margin ?? null,
            other:             prod.other ?? null,
            currency_exchange: prod.currency_exchange ?? null,
            freight:           prod.freight ?? null,
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
