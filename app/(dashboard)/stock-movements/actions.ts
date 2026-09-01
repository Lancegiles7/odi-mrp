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
  ok: boolean; error?: string; imported?: number; unmatched?: string[]
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

    // Replace the file-sourced rows (the sheet is the source of truth); leave
    // PO/manual receipts alone.
    const { error: delErr } = await supabase.from('finished_goods_receipts').delete().eq('source', 'inwards_upload')
    if (delErr) return { ok: false, error: `Couldn't clear previous inwards rows: ${delErr.message}` }
    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from('finished_goods_receipts').insert(inserts as never)
      if (insErr) return { ok: false, error: `Save failed: ${insErr.message}` }
    }

    revalidatePath('/stock-movements')
    return { ok: true, imported: inserts.length, unmatched: Array.from(unmatched) }
  } catch (e) {
    return { ok: false, error: `Could not read the file: ${(e as Error).message}` }
  }
}
