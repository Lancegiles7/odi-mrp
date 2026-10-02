'use server'

import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseInwardsReceipts, type InwardsReceipt } from '@/lib/inwards-import'
import { candidateSkus, resolveProductSku } from '@/lib/bva-import'

// ============================================================
// importInwardsReceipts — parse the Inwards Finished Goods sheet and
// replace the file-sourced receipts (a clean mirror of the sheet).
// PO/manual receipts are left untouched.
// ============================================================
export async function importInwardsReceipts(formData: FormData): Promise<{
  ok: boolean; error?: string; imported?: number; skippedPo?: number; unmatched?: string[]
  nzImported?: number; auImported?: number; nzUnits?: number; auUnits?: number
  suspectDates?: string[]
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const file = formData.get('inwards') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Attach the Inwards Finished Goods file' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true })

    // The master splits inwards into two country tabs. Read each by name and
    // tag its receipts NZ / AU. Older single-tab files (no named tabs) fall
    // back to the first sheet, treated as NZ — matching the previous behaviour.
    const findSheet = (want: string) =>
      wb.SheetNames.find((n) => n.trim().toLowerCase() === want.toLowerCase())
    const nzName = findSheet('Inwards NZ FG Odi Organic')
    const auName = findSheet('Inwards AUST FG Odi Organic')
    const sheetsToRead: Array<{ name: string; market: 'NZ' | 'AU' }> = []
    if (nzName) sheetsToRead.push({ name: nzName, market: 'NZ' })
    if (auName) sheetsToRead.push({ name: auName, market: 'AU' })
    if (sheetsToRead.length === 0) sheetsToRead.push({ name: wb.SheetNames[0], market: 'NZ' })

    const parsed: InwardsReceipt[] = []
    const suspect: string[] = []
    for (const sh of sheetsToRead) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh.name], { raw: true, defval: '' }) as Record<string, unknown>[]
      const res = parseInwardsReceipts(rows, sh.market)
      parsed.push(...res.receipts)
      for (const d of res.suspectDates) suspect.push(`${d.market} · ${d.fg} (${d.raw})`)
    }
    if (parsed.length === 0 && suspect.length === 0) {
      return { ok: false, error: 'No receipts found — the sheet needs SKU, Received date and Retail Units Received columns.' }
    }

    // Both naming schemes — the master mostly uses FG- codes, a few legacy ones remain.
    const sysSkus = Array.from(new Set(parsed.flatMap((p) => candidateSkus(p.fg))))
    const { data: prods } = await supabase.from('products')
      .select('id, sku_code').in('sku_code', sysSkus) as { data: Array<{ id: string; sku_code: string }> | null }
    const idBySku = new Map((prods ?? []).map((p) => [p.sku_code, p.id]))

    const unmatched = new Set<string>()
    const inserts = parsed
      .map((p) => {
        const sku = resolveProductSku(p.fg, idBySku)
        const id = sku ? idBySku.get(sku) : undefined
        if (!id) { unmatched.add(p.fg); return null }
        return {
          product_id: id, received_month: p.receivedMonth, received_date: p.receivedDate,
          units: p.units, source: 'inwards_upload', batch_ref: p.batchRef,
          market: p.market, created_by: profile?.id ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    // A delivery receipted against a PO in the MRP is usually still listed in
    // the Inwards Master too, and both write a receipt row — which is how July
    // came to count every tub and sachet twice. Drop the sheet row when a PO
    // receipt already covers the same product, month, quantity AND market;
    // anything the POs don't cover (transfers, older stock) still comes through.
    const { data: poRows } = await supabase.from('finished_goods_receipts')
      .select('product_id, received_month, units, market')
      .eq('source', 'po_receipt') as { data: Array<{ product_id: string; received_month: string; units: number; market: string | null }> | null }
    const key = (productId: string, month: string, units: number, market: string) =>
      `${productId}|${String(month).slice(0, 7)}|${Number(units).toFixed(3)}|${(market || 'NZ').toUpperCase()}`
    // Counted, not just flagged: two identical PO receipts should mask two
    // identical sheet rows, and no more.
    const poLeft = new Map<string, number>()
    for (const r of poRows ?? []) {
      const k = key(r.product_id, r.received_month, r.units, r.market ?? 'NZ')
      poLeft.set(k, (poLeft.get(k) ?? 0) + 1)
    }
    const kept: typeof inserts = []
    let skippedPo = 0
    for (const row of inserts) {
      const k = key(row.product_id, row.received_month, row.units, row.market)
      const left = poLeft.get(k) ?? 0
      if (left > 0) { poLeft.set(k, left - 1); skippedPo++; continue }
      kept.push(row)
    }

    // Replace the file-sourced rows (the sheet is the source of truth for what
    // it covers); leave PO/manual receipts alone. The sheet carries both
    // countries now, so this clears every inwards_upload row regardless of market.
    const { error: delErr } = await supabase.from('finished_goods_receipts').delete().eq('source', 'inwards_upload')
    if (delErr) return { ok: false, error: `Couldn't clear previous inwards rows: ${delErr.message}` }
    if (kept.length > 0) {
      const { error: insErr } = await supabase.from('finished_goods_receipts').insert(kept as never)
      if (insErr) return { ok: false, error: `Save failed: ${insErr.message}` }
    }

    const nz = kept.filter((r) => r.market === 'NZ')
    const au = kept.filter((r) => r.market === 'AU')
    const sum = (rows: typeof kept) => rows.reduce((s, r) => s + Number(r.units), 0)

    revalidatePath('/stock-movements')
    return {
      ok: true, imported: kept.length, skippedPo, unmatched: Array.from(unmatched),
      nzImported: nz.length, auImported: au.length, nzUnits: sum(nz), auUnits: sum(au),
      suspectDates: suspect,
    }
  } catch (e) {
    return { ok: false, error: `Could not read the file: ${(e as Error).message}` }
  }
}

// ============================================================
// setStockAdjustment — manual month-end entry (wastage OR actual count, with a
// comment) on the ingredient/packaging Stock Movements ledger. One row per
// item / month / country; sending both sub-fields keeps them in step.
// ============================================================
export async function setStockAdjustment(input: {
  entity_type: 'ingredient' | 'packaging'
  entity_id: string
  year_month: string
  market: 'NZ' | 'AU'
  field: 'wastage' | 'count' | 'inbound'
  units: number | null
  comment: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const month = input.year_month.slice(0, 7) + '-01'
  const comment = input.comment?.trim() || null

  const { data: existing } = await supabase.from('stock_period_adjustments')
    .select('id, wastage_units, wastage_comment, counted_units, count_comment, inbound_units, inbound_comment')
    .eq('entity_type', input.entity_type).eq('entity_id', input.entity_id)
    .eq('year_month', month).eq('market', input.market)
    .maybeSingle() as { data: { id: string; wastage_units: number; wastage_comment: string | null; counted_units: number | null; count_comment: string | null; inbound_units: number; inbound_comment: string | null } | null }

  const row = {
    entity_type: input.entity_type,
    entity_id:   input.entity_id,
    year_month:  month,
    market:      input.market,
    wastage_units:   existing?.wastage_units ?? 0,
    wastage_comment: existing?.wastage_comment ?? null,
    counted_units:   existing?.counted_units ?? null,
    count_comment:   existing?.count_comment ?? null,
    inbound_units:   existing?.inbound_units ?? 0,
    inbound_comment: existing?.inbound_comment ?? null,
    created_by:  profile?.id ?? null,
  }
  const units = input.units != null && Number.isFinite(input.units) ? input.units : null
  if (input.field === 'wastage') {
    row.wastage_units = units ?? 0
    row.wastage_comment = comment
  } else if (input.field === 'inbound') {
    row.inbound_units = units ?? 0
    row.inbound_comment = comment
  } else {
    row.counted_units = units
    row.count_comment = comment
  }

  const empty = (!row.wastage_units) && !row.wastage_comment && row.counted_units == null && !row.count_comment && (!row.inbound_units) && !row.inbound_comment
  if (empty) {
    if (existing) {
      const { error } = await supabase.from('stock_period_adjustments').delete().eq('id', existing.id)
      if (error) return { ok: false, error: error.message }
    }
  } else {
    const { error } = await supabase.from('stock_period_adjustments')
      .upsert(row as never, { onConflict: 'entity_type,entity_id,year_month,market' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/stock-movements')
  return { ok: true }
}

// ============================================================
// setProductWriteoff — manual finished-goods write-off for a product/month/
// country. Feeds the Finished goods Stock Movements "write-offs" column (and
// the EOM). Zero/blank clears it. One row per product × month × market.
// ============================================================
export async function setProductWriteoff(input: {
  product_id: string
  year_month: string
  market: 'NZ' | 'AU'
  units: number | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const month = input.year_month.slice(0, 7) + '-01'
  const units = input.units != null && Number.isFinite(input.units) ? input.units : null

  if (units == null || units === 0) {
    const { error } = await supabase.from('product_writeoffs')
      .delete().eq('product_id', input.product_id).eq('year_month', month).eq('market', input.market)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('product_writeoffs')
      .upsert({ product_id: input.product_id, year_month: month, market: input.market, units } as never,
        { onConflict: 'product_id,year_month,market' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/stock-movements')
  return { ok: true }
}

// ============================================================
// setStockMovementNote — free-text monthly note for a Stock Movements tab.
// One row per scope (products|ingredients|packaging) × month. Blank clears it.
// ============================================================
export async function setStockMovementNote(input: {
  scope: 'products' | 'ingredients' | 'packaging'
  year_month: string
  note: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const month = input.year_month.slice(0, 7) + '-01'
  const note = input.note?.trim() || null

  if (!note) {
    const { error } = await supabase.from('stock_movement_notes')
      .delete().eq('scope', input.scope).eq('year_month', month)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('stock_movement_notes')
      .upsert({ scope: input.scope, year_month: month, note, created_by: profile?.id ?? null } as never,
        { onConflict: 'scope,year_month' })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/stock-movements')
  return { ok: true }
}

// Load the saved monthly notes for a Stock Movements tab, keyed by 'YYYY-MM-01'.
export async function loadStockMovementNotes(
  scope: 'products' | 'ingredients' | 'packaging',
): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data } = await supabase.from('stock_movement_notes')
    .select('year_month, note').eq('scope', scope) as { data: Array<{ year_month: string; note: string | null }> | null }
  const out: Record<string, string> = {}
  for (const r of data ?? []) {
    if (r.note) out[r.year_month.slice(0, 10)] = r.note
  }
  return out
}
