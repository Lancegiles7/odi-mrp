'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Channel, EntityType } from '@/lib/budget-vs-actual'
import { fyMonths, fyStartFor } from '@/lib/budget-vs-actual'

const REVAL = '/reporting/budget-vs-actual'

// ============================================================
// uploadProductActuals
// One row per SKU. Channels: nz_retail / nz_d2c / nz_samples (+au* later).
// year_month must be YYYY-MM-01.
// If FY-start month, also writes opening_soh into monthly_stock_counts.
// ============================================================

export interface UploadRow {
  sku: string
  opening?: number | null
  nz_retail?: number | null
  nz_d2c?: number | null
  nz_samples?: number | null
}

export interface UploadResult {
  ok: boolean
  error?: string
  matched?: number
  unmatched_skus?: string[]
}

export async function uploadProductActuals(input: {
  year_month: string
  rows: UploadRow[]
}): Promise<UploadResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profile?.id ?? null

  // Block if month is locked (unless we add admin override later)
  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', input.year_month).maybeSingle()
  if (lock) return { ok: false, error: 'Month is locked. Admin must unlock to make changes.' }

  // Resolve SKUs → product ids
  const skus = input.rows.map((r) => r.sku.trim()).filter(Boolean)
  const { data: products, error: prodErr } = await supabase
    .from('products').select('id, sku_code').in('sku_code', skus) as
    { data: Array<{ id: string; sku_code: string }> | null; error: { message: string } | null }
  if (prodErr) return { ok: false, error: prodErr.message }
  const idBySku = new Map((products ?? []).map((p) => [p.sku_code, p.id]))
  const unmatched_skus = skus.filter((s) => !idBySku.has(s))

  // Upsert channel actuals (one row per channel per product)
  const matchedRows = input.rows.filter((r) => idBySku.has(r.sku.trim()))

  const channelInserts: Array<{
    product_id: string; year_month: string; channel: Channel; units: number; created_by: string | null
  }> = []
  for (const row of matchedRows) {
    const pid = idBySku.get(row.sku.trim())!
    const map: Array<[Channel, number | null | undefined]> = [
      ['nz_retail',  row.nz_retail],
      ['nz_d2c',     row.nz_d2c],
      ['nz_samples', row.nz_samples],
    ]
    for (const [channel, units] of map) {
      if (units == null) continue   // blank = not entered yet, skip
      channelInserts.push({ product_id: pid, year_month: input.year_month, channel, units: Number(units) || 0, created_by: createdBy })
    }
  }

  if (channelInserts.length > 0) {
    const { error: actErr } = await supabase
      .from('product_actuals')
      .upsert(channelInserts, { onConflict: 'product_id,year_month,channel' })
    if (actErr) return { ok: false, error: actErr.message }
  }

  // FY-start month? Write opening_soh into monthly_stock_counts
  const fyStart = fyStartFor(new Date(input.year_month + 'T00:00:00Z'))
  const isFyStart = input.year_month === fyStart

  if (isFyStart) {
    const stockCountUpserts = matchedRows
      .filter((r) => r.opening != null)
      .map((r) => ({
        entity_type: 'product' as EntityType,
        entity_id:   idBySku.get(r.sku.trim())!,
        year_month:  input.year_month,
        opening_soh: Number(r.opening) || 0,
        created_by:  createdBy,
      }))
    if (stockCountUpserts.length > 0) {
      const { error: scErr } = await supabase
        .from('monthly_stock_counts')
        .upsert(stockCountUpserts, { onConflict: 'entity_type,entity_id,year_month' })
      if (scErr) return { ok: false, error: scErr.message }
    }
  }

  revalidatePath(REVAL)
  return { ok: true, matched: matchedRows.length, unmatched_skus }
}

// ============================================================
// setOpeningSoh — only touches opening_soh, leaves counted_eom alone
// ============================================================
export async function setOpeningSoh(input: {
  entity_type: EntityType
  entity_id:   string
  year_month:  string
  opening_soh: number | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profile?.id ?? null

  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', input.year_month).maybeSingle()
  if (lock) return { ok: false, error: 'Month is locked.' }

  // Read existing row so we preserve counted_eom + comment when patching opening_soh
  const { data: existing } = await supabase.from('monthly_stock_counts')
    .select('counted_eom, comment')
    .eq('entity_type', input.entity_type)
    .eq('entity_id', input.entity_id)
    .eq('year_month', input.year_month)
    .maybeSingle() as { data: { counted_eom: number | null; comment: string | null } | null }

  // If everything would be null after this update, just delete
  if (input.opening_soh == null && existing?.counted_eom == null && !existing?.comment) {
    const { error } = await supabase.from('monthly_stock_counts').delete()
      .eq('entity_type', input.entity_type)
      .eq('entity_id', input.entity_id)
      .eq('year_month', input.year_month)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('monthly_stock_counts').upsert({
      entity_type: input.entity_type,
      entity_id:   input.entity_id,
      year_month:  input.year_month,
      opening_soh: input.opening_soh,
      counted_eom: existing?.counted_eom ?? null,
      comment:     existing?.comment ?? null,
      created_by:  createdBy,
    }, { onConflict: 'entity_type,entity_id,year_month' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(REVAL)
  return { ok: true }
}

// ============================================================
// setProductActual — single-cell upsert for inline editing
// ============================================================
export async function setProductActual(input: {
  product_id: string
  year_month: string
  channel:    Channel
  units:      number | null    // null deletes the row
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profile?.id ?? null

  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', input.year_month).maybeSingle()
  if (lock) return { ok: false, error: 'Month is locked.' }

  if (input.units == null) {
    const { error } = await supabase.from('product_actuals').delete()
      .eq('product_id', input.product_id)
      .eq('year_month', input.year_month)
      .eq('channel', input.channel)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('product_actuals').upsert({
      product_id: input.product_id,
      year_month: input.year_month,
      channel:    input.channel,
      units:      input.units,
      created_by: createdBy,
    }, { onConflict: 'product_id,year_month,channel' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(REVAL)
  return { ok: true }
}

// ============================================================
// setMonthlyStockCount — counted EOM (and optionally opening_soh)
// ============================================================
export async function setMonthlyStockCount(input: {
  entity_type: EntityType
  entity_id:   string
  year_month:  string
  counted_eom: number | null
  opening_soh?: number | null
  comment?:    string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profile?.id ?? null

  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', input.year_month).maybeSingle()
  if (lock) return { ok: false, error: 'Month is locked.' }

  // If counted_eom is null AND opening_soh is null AND comment is null → delete the row
  if (input.counted_eom == null && input.opening_soh == null && !input.comment) {
    const { error } = await supabase.from('monthly_stock_counts')
      .delete()
      .eq('entity_type', input.entity_type)
      .eq('entity_id', input.entity_id)
      .eq('year_month', input.year_month)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('monthly_stock_counts')
      .upsert({
        entity_type: input.entity_type,
        entity_id:   input.entity_id,
        year_month:  input.year_month,
        counted_eom: input.counted_eom,
        opening_soh: input.opening_soh ?? null,
        comment:     input.comment ?? null,
        created_by:  createdBy,
      }, { onConflict: 'entity_type,entity_id,year_month' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(REVAL)
  return { ok: true }
}

// ============================================================
// setConsumptionOverride — manual override for ingredient/packaging
// ============================================================
export async function setConsumptionOverride(input: {
  entity_type: 'ingredient' | 'packaging'
  entity_id:   string
  year_month:  string
  override_units: number | null
  comment?:    string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profile?.id ?? null

  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', input.year_month).maybeSingle()
  if (lock) return { ok: false, error: 'Month is locked.' }

  if (input.override_units == null) {
    const { error } = await supabase.from('monthly_consumption_overrides')
      .delete()
      .eq('entity_type', input.entity_type)
      .eq('entity_id', input.entity_id)
      .eq('year_month', input.year_month)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('monthly_consumption_overrides')
      .upsert({
        entity_type:    input.entity_type,
        entity_id:      input.entity_id,
        year_month:     input.year_month,
        override_units: input.override_units,
        comment:        input.comment ?? null,
        created_by:     createdBy,
      }, { onConflict: 'entity_type,entity_id,year_month' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(REVAL)
  return { ok: true }
}

// ============================================================
// lockMonth / unlockMonth (admin)
// ============================================================
export async function lockMonth(year_month: string, notes?: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const { error } = await supabase.from('month_locks').upsert({
    year_month,
    locked_by: profile?.id ?? null,
    notes: notes ?? null,
  }, { onConflict: 'year_month' })
  if (error) return { ok: false, error: error.message }

  revalidatePath(REVAL)
  return { ok: true }
}

export async function unlockMonth(year_month: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Only admins can unlock
  const { data: profile } = await supabase
    .from('user_profiles').select('roles(name)').eq('id', user.id).maybeSingle() as { data: { roles: { name: string } | null } | null }
  if (profile?.roles?.name !== 'admin') return { ok: false, error: 'Only admins can unlock months.' }

  const { error } = await supabase.from('month_locks').delete().eq('year_month', year_month)
  if (error) return { ok: false, error: error.message }

  revalidatePath(REVAL)
  return { ok: true }
}

// ============================================================
// snapshotBudgetForFY — call this when FY starts. Freezes the demand
// forecast (grand total per product per month) into budget_snapshots.
// Idempotent: re-running for the same FY overwrites. Use carefully.
// ============================================================
export async function snapshotBudgetForFY(fyStart: string): Promise<{ ok: boolean; error?: string; rows?: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id, roles(name)').eq('id', user.id).maybeSingle() as { data: { id: string; roles: { name: string } | null } | null }
  if (profile?.roles?.name !== 'admin') return { ok: false, error: 'Only admins can snapshot the budget.' }

  const months = fyMonths(fyStart)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  // Pull demand forecasts (with channel) for all months in this FY
  const { data: forecasts, error: fcErr } = await supabase
    .from('demand_forecasts')
    .select('product_id, year_month, channel, units')
    .gte('year_month', firstMonth).lte('year_month', lastMonth) as
    { data: Array<{ product_id: string; year_month: string; channel: string; units: number }> | null; error: { message: string } | null }
  if (fcErr) return { ok: false, error: fcErr.message }

  // Map demand_forecasts.channel → bva_budget_snapshots.channel
  // (pipefill is region-agnostic on the demand side; for now route to NZ samples)
  function mapChannel(src: string): Channel | null {
    switch (src) {
      case 'ecomm_nz':  return 'nz_d2c'
      case 'retail_nz': return 'nz_retail'
      case 'pipefill':  return 'nz_samples'
      case 'ecomm_au':  return 'au_d2c'
      case 'retail_au': return 'au_retail'
      default:          return null
    }
  }

  const inserts = (forecasts ?? [])
    .map((f) => {
      const ch = mapChannel(f.channel)
      if (!ch) return null
      return { product_id: f.product_id, year_month: f.year_month, channel: ch, units: Number(f.units), snapshot_by: profile?.id ?? null }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (inserts.length === 0) {
    revalidatePath(REVAL)
    return { ok: true, rows: 0 }
  }

  const { error: snapErr } = await supabase
    .from('bva_budget_snapshots')
    .upsert(inserts, { onConflict: 'product_id,year_month,channel' })
  if (snapErr) return { ok: false, error: snapErr.message }

  revalidatePath(REVAL)
  return { ok: true, rows: inserts.length }
}
