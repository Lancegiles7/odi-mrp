'use server'

import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseInwardsReceipts } from '@/lib/inwards-import'
import { candidateSkus, resolveProductSku } from '@/lib/bva-import'

// ============================================================
// importInwardsReceipts — parse the Inwards Finished Goods sheet and
// replace the file-sourced receipts (a clean mirror of the sheet).
// PO/manual receipts are left untouched.
// ============================================================
export async function importInwardsReceipts(formData: FormData): Promise<{
  ok: boolean; error?: string; imported?: number; skippedPo?: number; unmatched?: string[]
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
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: '' }) as Record<string, unknown>[]
    const parsed = parseInwardsReceipts(rows)
    if (parsed.length === 0) {
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
          units: p.units, source: 'inwards_upload', batch_ref: p.batchRef, created_by: profile?.id ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    // A delivery receipted against a PO in the MRP is usually still listed in
    // the Inwards Master too, and both write a receipt row — which is how July
    // came to count every tub and sachet twice. Drop the sheet row when a PO
    // receipt already covers the same product, month and quantity; anything the
    // POs don't cover (transfers, older stock) still comes through the sheet.
    const { data: poRows } = await supabase.from('finished_goods_receipts')
      .select('product_id, received_month, units')
      .eq('source', 'po_receipt') as { data: Array<{ product_id: string; received_month: string; units: number }> | null }
    const key = (productId: string, month: string, units: number) =>
      `${productId}|${String(month).slice(0, 7)}|${Number(units).toFixed(3)}`
    // Counted, not just flagged: two identical PO receipts should mask two
    // identical sheet rows, and no more.
    const poLeft = new Map<string, number>()
    for (const r of poRows ?? []) {
      const k = key(r.product_id, r.received_month, r.units)
      poLeft.set(k, (poLeft.get(k) ?? 0) + 1)
    }
    const kept: typeof inserts = []
    let skippedPo = 0
    for (const row of inserts) {
      const k = key(row.product_id, row.received_month, row.units)
      const left = poLeft.get(k) ?? 0
      if (left > 0) { poLeft.set(k, left - 1); skippedPo++; continue }
      kept.push(row)
    }

    // Replace the file-sourced rows (the sheet is the source of truth for what
    // it covers); leave PO/manual receipts alone.
    const { error: delErr } = await supabase.from('finished_goods_receipts').delete().eq('source', 'inwards_upload')
    if (delErr) return { ok: false, error: `Couldn't clear previous inwards rows: ${delErr.message}` }
    if (kept.length > 0) {
      const { error: insErr } = await supabase.from('finished_goods_receipts').insert(kept as never)
      if (insErr) return { ok: false, error: `Save failed: ${insErr.message}` }
    }

    revalidatePath('/stock-movements')
    return { ok: true, imported: kept.length, skippedPo, unmatched: Array.from(unmatched) }
  } catch (e) {
    return { ok: false, error: `Could not read the file: ${(e as Error).message}` }
  }
}
