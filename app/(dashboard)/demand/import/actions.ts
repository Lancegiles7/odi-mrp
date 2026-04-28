'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DemandChannel, ProductGroup } from '@/lib/types/database.types'

const PRODUCT_GROUP_MAP: Record<string, ProductGroup | null> = {
  sachets:       'sachets',
  tubs:          'tubs',
  snacks:        'snacks_4bs',
  pouches:       'pouches',
  'puffs & melts':'puffs_melts',
  'puffs and melts':'puffs_melts',
  'vitamin d':   'vitamin_d',
  'odi noodles': 'noodles',
  'odi protein': null,
  'odi go':      null,
  'post partum': null,
  'other':       null,
}

export interface DemandImportPayload {
  source: string                         // e.g. 'import:2026-04-24'
  rows: Array<{
    product_name: string
    sheet_group:  string                 // "Sachets", "Tubs", …
    channel:      DemandChannel
    year_month:   string                 // 'yyyy-mm-01'
    units:        number
  }>
}

export interface DemandImportResult {
  matched_products:    number
  created_placeholders: number
  cells_inserted:      number
  cells_skipped_edited: number
  errors: Array<{ product: string; error: string }>
}

/** Case-insensitive trimmed key. */
function nkey(s: string): string {
  return s.trim().toLowerCase()
}

export async function commitDemandImport(payload: DemandImportPayload): Promise<DemandImportResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const result: DemandImportResult = {
    matched_products: 0,
    created_placeholders: 0,
    cells_inserted: 0,
    cells_skipped_edited: 0,
    errors: [],
  }

  if (!user) return result

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const updatedBy = profile?.id ?? null

  // 1. Resolve distinct product names to product IDs (match or create)
  const distinctProducts = new Map<string, string>() // nkey → sheet name (first seen)
  for (const r of payload.rows) {
    const k = nkey(r.product_name)
    if (!distinctProducts.has(k)) distinctProducts.set(k, r.product_name.trim())
  }

  const { data: existing } = await supabase
    .from('products').select('id, name, is_active') as unknown as {
    data: Array<{ id: string; name: string; is_active: boolean }> | null
  }

  const existingByKey = new Map<string, { id: string; is_active: boolean }>()
  for (const p of existing ?? []) existingByKey.set(nkey(p.name), { id: p.id, is_active: p.is_active })

  const productIdByKey = new Map<string, string>()

  // Match existing + note unmatched
  const toCreate: Array<{ key: string; name: string; group: ProductGroup | null }> = []
  for (const [k, name] of distinctProducts.entries()) {
    const match = existingByKey.get(k)
    if (match) {
      productIdByKey.set(k, match.id)
      result.matched_products++
    } else {
      // Find the sheet group for this name by looking up any row
      const sheetRow = payload.rows.find((r) => nkey(r.product_name) === k)
      const group = sheetRow ? (PRODUCT_GROUP_MAP[nkey(sheetRow.sheet_group)] ?? null) : null
      toCreate.push({ key: k, name, group })
    }
  }

  // 2. Create placeholder products (is_active = false) for unmatched names
  if (toCreate.length > 0) {
    const creationRows = toCreate.map((c) => ({
      sku_code:      generateSku(c.name),
      name:          c.name,
      product_type:  c.group,
      is_active:     false,
      unit_of_measure: 'each',
      created_by:    updatedBy,
    }))
    const { data: created, error } = await supabase
      .from('products')
      .insert(creationRows)
      .select('id, name')
    if (error) {
      result.errors.push({ product: '(bulk)', error: error.message })
    } else {
      for (const c of created ?? []) {
        productIdByKey.set(nkey(c.name), c.id)
        result.created_placeholders++
      }
    }
  }

  // 3. Load existing demand rows to know which cells are "edited" (preserve them)
  const { data: existingDemand } = await supabase
    .from('demand_forecasts')
    .select('product_id, year_month, channel, is_edited') as unknown as {
      data: Array<{ product_id: string; year_month: string; channel: string; is_edited: boolean }> | null
    }
  const editedCells = new Set<string>()
  for (const d of existingDemand ?? []) {
    if (d.is_edited) {
      editedCells.add(`${d.product_id}|${d.year_month.slice(0, 10)}|${d.channel}`)
    }
  }

  // 4. Build upsert payload, skipping edited cells.
  //    Dedupe by (product_id, year_month, channel) — the last occurrence
  //    wins. Without this, two sheet rows that normalise to the same
  //    product key would create duplicate tuples in the same upsert
  //    batch, which Postgres rejects with
  //    "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const byKey = new Map<string, {
    product_id: string
    year_month: string
    channel: string
    units: number
    is_edited: boolean
    source: string
    updated_by: string | null
  }>()

  let duplicateCount = 0
  for (const r of payload.rows) {
    const pid = productIdByKey.get(nkey(r.product_name))
    if (!pid) continue
    const cellKey = `${pid}|${r.year_month}|${r.channel}`
    if (editedCells.has(cellKey)) {
      result.cells_skipped_edited++
      continue
    }
    if (byKey.has(cellKey)) duplicateCount++
    byKey.set(cellKey, {
      product_id: pid,
      year_month: r.year_month,
      channel:    r.channel,
      units:      Math.max(0, Math.round(r.units)),
      is_edited:  false,
      source:     payload.source,
      updated_by: updatedBy,
    })
  }

  const upserts = Array.from(byKey.values())

  if (duplicateCount > 0) {
    result.errors.push({
      product: '(dedupe)',
      error: `${duplicateCount} duplicate (product, month, channel) tuples collapsed to last value. Check the sheet for product names that appear twice in the same channel.`,
    })
  }

  if (upserts.length > 0) {
    // Chunk to avoid huge single inserts
    const CHUNK = 500
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const slice = upserts.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('demand_forecasts')
        .upsert(slice, { onConflict: 'product_id,year_month,channel' })
      if (error) {
        result.errors.push({ product: '(upsert chunk)', error: error.message })
      } else {
        result.cells_inserted += slice.length
      }
    }
  }

  revalidatePath('/demand')
  revalidatePath('/production')
  return result
}

function generateSku(name: string): string {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PH-${base.slice(0, 36)}-${suffix}`
}
