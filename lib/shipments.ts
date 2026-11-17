/**
 * Shipments — reads for the Shipments pages.
 *
 * A shipment is one booked freight movement (AU↔NZ). Orders — transfer orders
 * AND regular purchase orders (purchase_orders of any po_type) — are optionally
 * loaded onto it via purchase_orders.shipment_id. The shipment owns the
 * depart/arrive dates, which cascade onto whatever is loaded on it.
 */
import { createClient } from '@/lib/supabase/server'

export type ShipmentDirection = 'AU_TO_NZ' | 'NZ_TO_AU'
export type ShipmentStatus = 'planned' | 'departed' | 'arrived' | 'cancelled'
export type ContainerType = '40ft' | '20ft' | 'lcl' | 'air' | 'other'
export type CostBasis = 'quoted' | 'estimated' | 'actual'
export type FreightCurrency = 'NZD' | 'AUD'

export interface Shipment {
  id: string
  shipment_number: string
  direction: ShipmentDirection
  depart_date: string | null
  arrive_date: string | null
  status: ShipmentStatus
  notes: string | null
  container_type: ContainerType | null
  freight_cost: number | null
  freight_currency: FreightCurrency | null
  cost_basis: CostBasis | null
  carrier: string | null
  reference: string | null
  booked_date: string | null
}

const SHIPMENT_COLS = 'id, shipment_number, direction, depart_date, arrive_date, status, notes, container_type, freight_cost, freight_currency, cost_basis, carrier, reference, booked_date'

export interface ShipmentListRow extends Shipment {
  transfer_count: number
  total_units: number
}

export interface ShipmentTransfer {
  id: string
  po_number: string
  status: string
  kind: 'transfer' | 'purchase'   // transfer order vs regular purchase order
  from_site: string | null
  to_site: string | null          // transfer: destination site · purchase: null (supplier is the "from")
  contents: string
  units: number
  moves_build: boolean   // stock_move set → affects Stock Movements timing (transfers only)
}

export interface ShipmentDetail extends Shipment {
  transfers: ShipmentTransfer[]   // everything loaded on the shipment (transfers + POs)
  total_units: number
}

type POChip = {
  id: string; po_number: string; status: string; shipment_id: string | null
  po_type: string | null; market: string | null
  supplier_id: string | null; destination_supplier_id: string | null; stock_move: string | null
}

const CHIP_COLS = 'id, po_number, status, shipment_id, po_type, market, supplier_id, destination_supplier_id, stock_move'

/** Shape a PO row into a loaded-order chip (transfer or purchase). */
function toItem(p: POChip, byPo: Map<string, { contents: string; units: number }>, names: Map<string, string>): ShipmentTransfer {
  const isTransfer = p.po_type === 'transfer'
  return {
    id: p.id, po_number: p.po_number, status: p.status,
    kind: isTransfer ? 'transfer' : 'purchase',
    from_site: p.supplier_id ? names.get(p.supplier_id) ?? null : null,
    to_site: isTransfer && p.destination_supplier_id ? names.get(p.destination_supplier_id) ?? null : null,
    contents: byPo.get(p.id)?.contents ?? '—',
    units: byPo.get(p.id)?.units ?? 0,
    moves_build: p.stock_move === 'NZ_TO_AU' || p.stock_move === 'AU_TO_NZ',
  }
}

/** Build a product_id/packaging_id/description → short "contents" string per PO. */
async function contentsAndUnits(poIds: string[]): Promise<Map<string, { contents: string; units: number }>> {
  const out = new Map<string, { contents: string; units: number }>()
  if (!poIds.length) return out
  const supabase = createClient()
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('purchase_order_id, product_id, ingredient_id, packaging_id, description, quantity_ordered')
    .in('purchase_order_id', poIds) as {
      data: Array<{ purchase_order_id: string; product_id: string | null; ingredient_id: string | null; packaging_id: string | null; description: string | null; quantity_ordered: number }> | null
    }
  const rows = lines ?? []
  const nameById = new Map<string, string>()
  const collect = async (table: 'products' | 'ingredients' | 'packaging', ids: string[]) => {
    if (!ids.length) return
    const { data } = await supabase.from(table).select('id, name').in('id', ids) as { data: Array<{ id: string; name: string }> | null }
    for (const p of data ?? []) nameById.set(p.id, p.name)
  }
  await Promise.all([
    collect('products', Array.from(new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x)))),
    collect('ingredients', Array.from(new Set(rows.map((r) => r.ingredient_id).filter((x): x is string => !!x)))),
    collect('packaging', Array.from(new Set(rows.map((r) => r.packaging_id).filter((x): x is string => !!x)))),
  ])
  const acc = new Map<string, { names: Set<string>; misc: number; units: number }>()
  for (const r of rows) {
    const e = acc.get(r.purchase_order_id) ?? { names: new Set<string>(), misc: 0, units: 0 }
    e.units += Number(r.quantity_ordered) || 0
    const refId = r.product_id ?? r.ingredient_id ?? r.packaging_id
    if (refId && nameById.has(refId)) e.names.add(nameById.get(refId)!)
    else e.misc++   // free-text "other" line with no linked item
    acc.set(r.purchase_order_id, e)
  }
  for (const [poId, e] of Array.from(acc.entries())) {
    const names = Array.from(e.names)
    const shown = names.slice(0, 3).join(' · ')
    const extra = names.length > 3 ? ` +${names.length - 3} more` : ''
    const misc = e.misc > 0 ? `${names.length ? ' · ' : ''}misc ×${e.misc}` : ''
    out.set(poId, { contents: (shown + extra + misc) || '—', units: e.units })
  }
  return out
}

async function siteNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  if (!uniq.length) return out
  const supabase = createClient()
  const { data } = await supabase.from('suppliers').select('id, name').in('id', uniq) as { data: Array<{ id: string; name: string }> | null }
  for (const s of data ?? []) out.set(s.id, s.name)
  return out
}

/** All shipments, newest first, with transfer count + total units. */
export async function listShipments(): Promise<ShipmentListRow[]> {
  const supabase = createClient()
  const { data: ships } = await supabase
    .from('shipments')
    .select(SHIPMENT_COLS)
    .order('depart_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false }) as { data: Shipment[] | null }
  const list = ships ?? []
  if (!list.length) return []

  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, shipment_id')
    .not('shipment_id', 'is', null) as { data: Array<{ id: string; shipment_id: string }> | null }
  const poRows = pos ?? []
  const unitsByPo = await contentsAndUnits(poRows.map((p) => p.id))

  const byShip = new Map<string, { count: number; units: number }>()
  for (const p of poRows) {
    const e = byShip.get(p.shipment_id) ?? { count: 0, units: 0 }
    e.count++
    e.units += unitsByPo.get(p.id)?.units ?? 0
    byShip.set(p.shipment_id, e)
  }
  return list.map((s) => ({ ...s, transfer_count: byShip.get(s.id)?.count ?? 0, total_units: byShip.get(s.id)?.units ?? 0 }))
}

/** One shipment with every order (transfer + PO) loaded on it. */
export async function getShipment(id: string): Promise<ShipmentDetail | null> {
  const supabase = createClient()
  const { data: ship } = await supabase
    .from('shipments')
    .select(SHIPMENT_COLS)
    .eq('id', id).maybeSingle() as { data: Shipment | null }
  if (!ship) return null

  const { data: pos } = await supabase
    .from('purchase_orders')
    .select(CHIP_COLS)
    .eq('shipment_id', id)
    .order('po_number') as { data: POChip[] | null }
  const poRows = pos ?? []
  const byPo = await contentsAndUnits(poRows.map((p) => p.id))
  const names = await siteNames(poRows.flatMap((p) => [p.supplier_id ?? '', p.destination_supplier_id ?? '']))

  const transfers = poRows.map((p) => toItem(p, byPo, names))
  return { ...ship, transfers, total_units: transfers.reduce((s, t) => s + t.units, 0) }
}

/** Unassigned orders — transfers AND purchase orders not on a shipment and not
 *  cancelled / already fully received — for the shipment "add" picker. */
export async function listAssignableOrders(): Promise<ShipmentTransfer[]> {
  const supabase = createClient()
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select(CHIP_COLS)
    .is('shipment_id', null)
    .in('status', ['draft', 'submitted', 'partially_received'])
    .order('po_number', { ascending: false }) as { data: POChip[] | null }
  const poRows = pos ?? []
  const byPo = await contentsAndUnits(poRows.map((p) => p.id))
  const names = await siteNames(poRows.flatMap((p) => [p.supplier_id ?? '', p.destination_supplier_id ?? '']))
  return poRows.map((p) => toItem(p, byPo, names))
}

/** Open shipments (planned/departed), for the "goes on shipment" picker. */
export async function listOpenShipments(): Promise<Shipment[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_COLS)
    .in('status', ['planned', 'departed'])
    .order('depart_date', { ascending: true, nullsFirst: false }) as { data: Shipment[] | null }
  return data ?? []
}

