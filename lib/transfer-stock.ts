/**
 * Transfer orders that move stock between the NZ and AUS builds.
 *
 * A transfer marked "Moves stock between builds" (purchase_orders.stock_move =
 * NZ_TO_AU / AU_TO_NZ) takes finished stock off one build and puts it on the other.
 *
 * RECEIVED units are booked as paired finished-goods receipts (source
 * 'transfer') by syncTransferReceipts on Receive — they show as ordinary
 * inbound, so they're NOT repeated here. This module only shows what's still
 * to come (ordered − received) on transfers that aren't closed:
 *   • OUT leg — sending build, in the pick-up month (stock leaves the site)
 *   • IN leg  — receiving build, in the expected delivery month
 * Stock on the water in between belongs to neither build. Unmarked transfers
 * (manufacturer → DC, AU-made stock shipped to NZ for the NZ build) are
 * logistics only and are ignored here.
 *
 * Total stock never changes — nothing is produced — so transfers don't drive
 * ingredient/packaging demand or manufacturer POs. Shared by Stock Movements
 * and Production so both show the same balances.
 */
import { createClient } from '@/lib/supabase/server'
import { loadSrtByProduct } from '@/lib/transfer-orders'

export interface TransferDetail {
  po: string            // TRN number
  poId: string
  from: string          // origin site name
  to: string            // destination site name
  units: number         // signed: + into this market, − out of it
  date: string | null   // ISO date of this leg
  planned: boolean      // always true here — received units are fg receipts
}

/** product_id → month (yyyy-mm-01) → transfer legs for one market. */
export type TransferMap = Map<string, Map<string, TransferDetail[]>>

export interface BuildTransfers { NZ: TransferMap; AU: TransferMap }

const norm = (d: string) => d.slice(0, 7) + '-01'

function push(map: TransferMap, pid: string, date: string, d: TransferDetail) {
  const month = norm(date)
  if (!map.has(pid)) map.set(pid, new Map())
  const bm = map.get(pid)!
  if (!bm.has(month)) bm.set(month, [])
  bm.get(month)!.push(d)
}

export async function loadBuildTransfers(): Promise<BuildTransfers> {
  const empty: BuildTransfers = { NZ: new Map(), AU: new Map() }
  const supabase = createClient()

  // stock_move arrives with migration 072 — until it's run, nothing moves.
  const { data: pos, error } = await supabase.from('purchase_orders')
    .select('id, po_number, status, stock_move, supplier_id, destination_supplier_id, order_date, pickup_date, expected_delivery_date')
    .eq('po_type', 'transfer')
    .in('stock_move', ['NZ_TO_AU', 'AU_TO_NZ'])
    .in('status', ['draft', 'submitted', 'partially_received']) as { data: Array<{
      id: string; po_number: string; status: string; stock_move: 'NZ_TO_AU' | 'AU_TO_NZ'
      supplier_id: string; destination_supplier_id: string | null
      order_date: string | null; pickup_date: string | null; expected_delivery_date: string | null
    }> | null; error: unknown }
  if (error || !pos?.length) return empty

  const siteIds = Array.from(new Set(pos.flatMap((p) => [p.supplier_id, p.destination_supplier_id]).filter((x): x is string => !!x)))
  const { data: sites } = await supabase.from('suppliers').select('id, name').in('id', siteIds) as { data: Array<{ id: string; name: string }> | null }
  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]))

  const [{ data: lines }, srt] = await Promise.all([
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, product_id, quantity_ordered, quantity_received, unit_of_measure, supplier_pack_size')
      .in('purchase_order_id', pos.map((p) => p.id))
      .not('product_id', 'is', null) as unknown as Promise<{ data: Array<{
        purchase_order_id: string; product_id: string; quantity_ordered: number; quantity_received: number
        unit_of_measure: string | null; supplier_pack_size: number | null
      }> | null }>,
    loadSrtByProduct(),
  ])

  const out: BuildTransfers = { NZ: new Map(), AU: new Map() }
  const poById = new Map(pos.map((p) => [p.id, p]))
  for (const l of lines ?? []) {
    const po = poById.get(l.purchase_order_id)
    if (!po) continue
    const [fromC, toC]: ['NZ' | 'AU', 'NZ' | 'AU'] = po.stock_move === 'NZ_TO_AU' ? ['NZ', 'AU'] : ['AU', 'NZ']
    if (po.status === 'received') continue   // closed off — all booked as receipts
    // Packs → individual units (SRT lines are counted in trays).
    const perUnit = Number(l.supplier_pack_size) > 0 ? Number(l.supplier_pack_size)
      : (l.unit_of_measure ?? '').toUpperCase() === 'SRT' ? (srt[l.product_id]?.unitsPerSrt ?? 1) : 1
    const remaining = Math.max(0, (Number(l.quantity_ordered) || 0) - (Number(l.quantity_received) || 0)) * perUnit
    if (remaining <= 0) continue
    const base = { po: po.po_number, poId: po.id, from: siteName.get(po.supplier_id) ?? '—', to: siteName.get(po.destination_supplier_id ?? '') ?? '—', planned: true }

    const outDate = po.pickup_date ?? po.expected_delivery_date ?? po.order_date
    const inDate  = po.expected_delivery_date ?? po.pickup_date ?? po.order_date
    if (outDate) push(out[fromC], l.product_id, outDate, { ...base, units: -remaining, date: outDate })
    if (inDate)  push(out[toC],   l.product_id, inDate,  { ...base, units: remaining,  date: inDate })
  }
  return out
}
