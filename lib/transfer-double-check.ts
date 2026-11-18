/**
 * Double-count guard for stock-moving transfers.
 *
 * A transfer flagged "add to the destination build" (stock_move set) books the
 * units onto the destination market. If that same product ALSO has its own
 * purchase order on the destination market for the same month, the stock is
 * counted twice (once by the PO, once by the transfer) — the I Eat Fresh case,
 * where AU-made snacks have a separate NZ PO and shouldn't also be stock-moved.
 *
 * This finds those clashes so the transfer screen can warn before it slips through.
 */
import { createClient } from '@/lib/supabase/server'

export interface DoubleCountConflict { product_id: string; name: string; sku: string | null; pos: string[] }

export async function checkTransferDoubleCount(input: {
  stockMove: 'NZ_TO_AU' | 'AU_TO_NZ' | null
  expectedDate: string | null
  productLines: Array<{ product_id: string; name: string; sku?: string | null }>
}): Promise<DoubleCountConflict[]> {
  if (!input.stockMove || input.productLines.length === 0) return []
  const dest = input.stockMove === 'AU_TO_NZ' ? 'NZ' : 'AU'
  const pids = Array.from(new Set(input.productLines.map((l) => l.product_id)))
  const supabase = createClient()

  const { data: lines } = await supabase
    .from('purchase_order_lines').select('product_id, purchase_order_id').in('product_id', pids) as {
      data: Array<{ product_id: string; purchase_order_id: string }> | null }
  const poIds = Array.from(new Set((lines ?? []).map((l) => l.purchase_order_id)))
  if (!poIds.length) return []

  // Open purchase POs (not transfers) on the destination market for these products.
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, expected_delivery_date')
    .in('id', poIds).neq('po_type', 'transfer').eq('market', dest)
    .in('status', ['draft', 'submitted', 'partially_received']) as {
      data: Array<{ id: string; po_number: string; expected_delivery_date: string | null }> | null }

  // Only the same delivery month counts as a clash (when the transfer has a date).
  const month = input.expectedDate ? input.expectedDate.slice(0, 7) : null
  const poNum = new Map<string, string>()
  for (const p of pos ?? []) {
    if (month && (p.expected_delivery_date ?? '').slice(0, 7) !== month) continue
    poNum.set(p.id, p.po_number)
  }
  if (!poNum.size) return []

  const byProduct = new Map<string, Set<string>>()
  for (const l of lines ?? []) {
    if (!poNum.has(l.purchase_order_id)) continue
    if (!byProduct.has(l.product_id)) byProduct.set(l.product_id, new Set())
    byProduct.get(l.product_id)!.add(poNum.get(l.purchase_order_id)!)
  }

  const meta = new Map(input.productLines.map((l) => [l.product_id, l]))
  const out: DoubleCountConflict[] = []
  for (const [pid, set] of Array.from(byProduct.entries())) {
    const m = meta.get(pid)
    out.push({ product_id: pid, name: m?.name ?? pid, sku: m?.sku ?? null, pos: Array.from(set).sort() })
  }
  return out
}
