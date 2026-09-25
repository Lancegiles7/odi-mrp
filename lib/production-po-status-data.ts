/** Server loader for PO cover on the Production schedule — see production-po-status.ts. */
import { createClient } from '@/lib/supabase/server'
import type { PoCover, PoCoverIndex } from '@/lib/production-po-status'

const norm = (d: string) => d.slice(0, 7) + '-01'

export async function loadPoCover(firstMonth: string, lastMonth: string): Promise<PoCoverIndex> {
  const supabase = createClient()
  const out: PoCoverIndex = { NZ: new Map(), AU: new Map() }

  // Last day of lastMonth: compare on the month-start of the following month.
  const [y, m] = lastMonth.split('-').map(Number)
  const endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data: pos } = await supabase.from('purchase_orders')
    // Named FK: transfers added a second link to suppliers (PGRST201 otherwise).
    .select('id, po_number, status, expected_delivery_date, market, suppliers!purchase_orders_supplier_id_fkey(name)')
    .in('status', ['draft', 'submitted', 'partially_received', 'received'])
    .neq('po_type', 'transfer')
    .gte('expected_delivery_date', firstMonth)
    .lt('expected_delivery_date', endExclusive) as {
      data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string; market: string | null; suppliers: { name: string } | null }> | null }
  if (!(pos ?? []).length) return out

  const poById = new Map((pos ?? []).map((p) => [p.id, p]))
  const { data: lines } = await supabase.from('purchase_order_lines')
    .select('purchase_order_id, product_id, quantity_ordered')
    .in('purchase_order_id', Array.from(poById.keys()))
    .not('product_id', 'is', null) as {
      data: Array<{ purchase_order_id: string; product_id: string; quantity_ordered: number }> | null }

  for (const l of lines ?? []) {
    const po = poById.get(l.purchase_order_id)
    const units = Number(l.quantity_ordered)
    if (!po || !(units > 0)) continue
    const target = out[(po.market ?? 'NZ').toUpperCase() === 'AU' ? 'AU' : 'NZ']
    const month = norm(po.expected_delivery_date)
    if (!target.has(l.product_id)) target.set(l.product_id, new Map())
    const bm = target.get(l.product_id)!
    const cell = bm.get(month) ?? { firm: 0, draft: 0, refs: [] }
    if (po.status === 'draft') cell.draft += units
    else cell.firm += units
    cell.refs.push({ po: po.po_number, supplier: po.suppliers?.name ?? null, status: po.status, expected: po.expected_delivery_date, units })
    bm.set(month, cell)
  }
  return out
}
