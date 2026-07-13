'use server'

import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { Channel, EntityType } from '@/lib/budget-vs-actual'
import { fyMonths, fyStartFor } from '@/lib/budget-vs-actual'
import {
  d2cFromShopify, retailFromUpstock, samplesFromSheet,
  actualsToFigureLines, sampleSheetName, perProductUnits, toSystemSku,
  writeoffsFromTracker,
} from '@/lib/bva-import'

const REVAL = '/reporting/budget-vs-actual'

// ============================================================
// importBvaActuals — parse the three monthly exports (Shopify D2C,
// Upstock retail, sample tracker) and write the actuals for one month
// into bva_figures. Budget rows are left untouched; locked months are
// blocked. Returns the figures it wrote so the UI can preview them.
// ============================================================
export async function importBvaActuals(formData: FormData): Promise<{
  ok: boolean; error?: string; wrote?: Record<string, number>
  productsMatched?: number; unmatchedSkus?: string[]; unmatchedRetail?: string[]
  writeoffsImported?: number; writeoffUnits?: number
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const yearMonth = String(formData.get('year_month') ?? '').trim()
  if (!/^\d{4}-\d{2}-01$/.test(yearMonth)) return { ok: false, error: 'Pick a valid month' }
  const ym = yearMonth.slice(0, 7)

  // Closed months keep their actuals — don't overwrite.
  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', yearMonth).maybeSingle() as { data: { year_month: string } | null }
  if (lock) return { ok: false, error: `${ym} is closed (locked). Unlock it first to re-import.` }

  const shopify = formData.get('shopify') as File | null
  const upstock = formData.get('upstock') as File | null
  const samples = formData.get('samples') as File | null
  const writeoffs = formData.get('writeoffs') as File | null
  if (!shopify && !upstock && !samples && !writeoffs) return { ok: false, error: 'Attach at least one file' }

  // raw:true keeps CSV date/number columns as their original strings — otherwise
  // SheetJS coerces "2026-06-26 …" into an Excel serial and month matching fails.
  async function rowsOf(file: File | null): Promise<Record<string, unknown>[]> {
    if (!file || file.size === 0) return []
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: '' }) as Record<string, unknown>[]
  }

  try {
    const shopifyRows = await rowsOf(shopify)
    const upstockRows = await rowsOf(upstock)
    let samplesAoa: unknown[][] = []
    if (samples && samples.size > 0) {
      const wb = XLSX.read(await samples.arrayBuffer(), { type: 'array', raw: true })
      const sheetName = wb.SheetNames.find((n) => n === sampleSheetName(yearMonth)) ?? wb.SheetNames[wb.SheetNames.length - 1]
      samplesAoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' }) as unknown[][]
    }

    // ── Summary figures (revenue / orders / group units) → bva_figures ──
    const d2c    = d2cFromShopify(shopifyRows, ym)
    const retail = retailFromUpstock(upstockRows, ym)
    const samp   = samplesFromSheet(samplesAoa)
    const lines  = actualsToFigureLines(d2c, retail, samp)

    const { data: profile } = await supabase.from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
    const figRows = Object.entries(lines).map(([line_key, actual]) => ({
      year_month: yearMonth, line_key, actual, updated_at: new Date().toISOString(), updated_by: profile?.id ?? null,
    }))
    const { error: figErr } = await supabase.from('bva_figures').upsert(figRows as never, { onConflict: 'year_month,line_key' })
    if (figErr) return { ok: false, error: `Save failed: ${figErr.message}` }

    // ── Per-product actuals (single units by channel) → product_actuals ──
    const pp = perProductUnits(shopifyRows, upstockRows, samplesAoa, ym)
    // Export uses FG- codes; the product master uses system SKUs — translate.
    const wantedFg = Array.from(new Set(Object.keys(pp.d2c).concat(Object.keys(pp.retail), Object.keys(pp.samples))))
    const wantedSystem = Array.from(new Set(wantedFg.map(toSystemSku)))
    const { data: prods } = await supabase.from('products')
      .select('id, sku_code').in('sku_code', wantedSystem) as { data: Array<{ id: string; sku_code: string }> | null }
    const idBySku = new Map((prods ?? []).map((p) => [p.sku_code, p.id]))

    const unmatchedSkus: string[] = []
    // Accumulate by (product_id, channel): several legacy FG SKUs can map to the
    // same system product (e.g. legacy ODIMEAL → Meal Booster), so their units
    // must be SUMMED into one row. Emitting two rows with the same conflict key
    // in one upsert is what triggers Postgres's "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" error.
    const paByKey = new Map<string, { product_id: string; channel: string; units: number }>()
    const addChannel = (map: Record<string, number>, channel: string) => {
      for (const [fgSku, units] of Object.entries(map)) {
        const id = idBySku.get(toSystemSku(fgSku))
        if (!id) { unmatchedSkus.push(fgSku); continue }
        const key = `${id}|${channel}`
        const existing = paByKey.get(key)
        if (existing) existing.units += units
        else paByKey.set(key, { product_id: id, channel, units })
      }
    }
    addChannel(pp.d2c, 'nz_d2c')
    addChannel(pp.retail, 'nz_retail')
    addChannel(pp.samples, 'nz_samples')

    const paRows: Array<{ product_id: string; year_month: string; channel: string; units: number }> =
      Array.from(paByKey.values()).map((r) => ({ product_id: r.product_id, year_month: yearMonth, channel: r.channel, units: r.units }))

    let productsMatched = 0
    let writeoffsImported = 0
    let writeoffUnits = 0
    if (paRows.length > 0) {
      const { error: paErr } = await supabase.from('product_actuals')
        .upsert(paRows as never, { onConflict: 'product_id,year_month,channel' })
      if (paErr) return { ok: false, error: `Per-product save failed: ${paErr.message}` }
      productsMatched = new Set(paRows.map((r) => r.product_id)).size
    }

    // ── Write-offs — wide "Stock Write off Tracker" sheet. Multi-month: each
    // row carries its own Date (month name), so one upload fills every month in
    // the sheet. Reason = "Category — Notes". Skips locked months. ────────────
    if (writeoffs && writeoffs.size > 0) {
      const wb = XLSX.read(await writeoffs.arrayBuffer(), { type: 'array', raw: true })
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }) as unknown[][]
      const fyStartStr = fyStartFor(new Date(yearMonth + 'T00:00:00Z'))
      const fyMs = fyMonths(fyStartStr)
      const monthByNum = new Map<number, string>(fyMs.map((m) => [Number(m.slice(5, 7)), m]))
      const parsed = writeoffsFromTracker(aoa, monthByNum)

      const woSystem = Array.from(new Set(parsed.map((r) => toSystemSku(r.fg))))
      const { data: woProds } = woSystem.length
        ? await supabase.from('products').select('id, sku_code').in('sku_code', woSystem) as { data: Array<{ id: string; sku_code: string }> | null }
        : { data: [] as Array<{ id: string; sku_code: string }> }
      const woIdBySku = new Map((woProds ?? []).map((p) => [p.sku_code, p.id]))

      // Don't overwrite months that are locked.
      const { data: woLocks } = await supabase.from('month_locks').select('year_month')
        .gte('year_month', fyMs[0]).lte('year_month', fyMs[11]) as { data: Array<{ year_month: string }> | null }
      const lockedSet = new Set((woLocks ?? []).map((l) => String(l.year_month).slice(0, 10)))

      // Accumulate by (product, month): sum units, join distinct reasons.
      const woAcc = new Map<string, { product_id: string; year_month: string; units: number; reasons: string[] }>()
      for (const r of parsed) {
        const id = woIdBySku.get(toSystemSku(r.fg))
        if (!id) { unmatchedSkus.push(r.fg); continue }
        if (lockedSet.has(r.year_month)) continue
        const key = `${id}|${r.year_month}`
        const e = woAcc.get(key) ?? { product_id: id, year_month: r.year_month, units: 0, reasons: [] }
        e.units += r.units
        if (r.reason && !e.reasons.includes(r.reason)) e.reasons.push(r.reason)
        woAcc.set(key, e)
      }
      const woUpserts = Array.from(woAcc.values()).map((e) => ({
        product_id: e.product_id, year_month: e.year_month, units: e.units, comment: e.reasons.join('; ') || null,
      }))
      if (woUpserts.length > 0) {
        const { error: woErr } = await supabase.from('product_writeoffs')
          .upsert(woUpserts as never, { onConflict: 'product_id,year_month' })
        if (woErr) return { ok: false, error: `Write-off save failed: ${woErr.message}` }
        writeoffsImported = woUpserts.length
        writeoffUnits = woUpserts.reduce((s, u) => s + u.units, 0)
      }
    }

    revalidatePath(REVAL)
    return {
      ok: true,
      wrote: lines,
      productsMatched,
      unmatchedSkus: Array.from(new Set(unmatchedSkus)),
      unmatchedRetail: pp.unmatchedRetail,
      writeoffsImported,
      writeoffUnits,
    }
  } catch (e) {
    return { ok: false, error: `Could not read the files: ${(e as Error).message}` }
  }
}

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
// setProductWriteoff — units written off + reason, per product/month.
// Upserts both together so the inline cell and the reason popover never
// clobber each other (the caller sends the current value of both).
// Zero units AND no comment clears the row.
// ============================================================
export async function setProductWriteoff(input: {
  product_id: string
  year_month: string
  units:      number | null
  comment:    string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }
  const createdBy = profile?.id ?? null

  const { data: lock } = await supabase.from('month_locks').select('year_month').eq('year_month', input.year_month).maybeSingle()
  if (lock) return { ok: false, error: 'Month is locked.' }

  const units   = input.units != null && Number.isFinite(input.units) ? input.units : 0
  const comment = input.comment?.trim() || null

  if (units === 0 && !comment) {
    const { error } = await supabase.from('product_writeoffs').delete()
      .eq('product_id', input.product_id)
      .eq('year_month', input.year_month)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('product_writeoffs').upsert({
      product_id: input.product_id,
      year_month: input.year_month,
      units,
      comment,
      created_by: createdBy,
    } as never, { onConflict: 'product_id,year_month' })
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

  // Pull demand forecasts (with channel) for all months in this FY.
  // Paged so the read isn't truncated at PostgREST's per-request row cap.
  let forecasts: Array<{ product_id: string; year_month: string; channel: string; units: number }>
  try {
    forecasts = await fetchAllRows<{ product_id: string; year_month: string; channel: string; units: number }>((from, to) =>
      supabase
        .from('demand_forecasts')
        .select('product_id, year_month, channel, units')
        .gte('year_month', firstMonth).lte('year_month', lastMonth)
        .order('product_id').order('year_month').order('channel')
        .range(from, to) as unknown as PromiseLike<{ data: Array<{ product_id: string; year_month: string; channel: string; units: number }> | null; error: { message: string } | null }>)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load demand forecasts' }
  }

  // Map demand_forecasts.channel → bva_budget_snapshots.channel.
  // Post-migration 032, pipefill is split by country and routes to the
  // matching samples bucket.
  function mapChannel(src: string): Channel | null {
    switch (src) {
      case 'ecomm_nz':    return 'nz_d2c'
      case 'retail_nz':   return 'nz_retail'
      case 'pipefill_nz': return 'nz_samples'
      case 'ecomm_au':    return 'au_d2c'
      case 'retail_au':   return 'au_retail'
      case 'pipefill_au': return 'au_samples'
      default:            return null
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
