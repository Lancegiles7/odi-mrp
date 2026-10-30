/**
 * Shipments — reads for the Shipments pages.
 *
 * A shipment is one booked freight movement (AU↔NZ). Transfer orders
 * (purchase_orders, po_type='transfer') are optionally loaded onto it via
 * purchase_orders.shipment_id. The shipment owns the depart/arrive dates.
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
  from_site: string | null
  to_site: string | null
  contents: string
  units: number
  moves_build: boolean   // stock_move set → affects Stock Movements timing
}

export interface ShipmentDetail extends Shipment {
  transfers: ShipmentTransfer[]
  total_units: number
}

type POChip = {
  id: string; po_number: string; status: string; shipment_id: string | null
  supplier_id: string | null; destination_supplier_id: string | null; stock_move: string | null
}

/** Build a product_id/packaging_id/description → short "contents" string per PO. */
async function contentsAndUnits(poIds: string[]): Promise<Map<string, { contents: string; units: number }>> {
  const out = new Map<string, { contents: string; units: number }>()
  if (!poIds.length) return out
  const supabase = createClient()
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('purchase_order_id, product_id, packaging_id, description, quantity_ordered')
    .in('purchase_order_id', poIds) as {
      data: Array<{ purchase_order_id: string; product_id: string | null; packaging_id: string | null; description: string | null; quantity_ordered: number }> | null
    }
  const rows = lines ?? []
  const prodIds = Array.from(new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x)))
  const nameById = new Map<string, string>()
  if (prodIds.length) {
    const { data: prods } = await supabase.from('products').select('id, name').in('id', prodIds) as { data: Array<{ id: string; name: string }> | null }
    for (const p of prods ?? []) nameById.set(p.id, p.name)
  }
  const acc = new Map<string, { names: Set<string>; misc: number; units: number }>()
  for (const r of rows) {
    const e = acc.get(r.purchase_order_id) ?? { names: new Set<string>(), misc: 0, units: 0 }
    e.units += Number(r.quantity_ordered) || 0
    if (r.product_id && nameById.has(r.product_id)) e.names.add(nameById.get(r.product_id)!)
    else e.misc++   // packaging or free-text "other" line
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
    .eq('po_type', 'transfer')
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

/** One shipment with every transfer loaded on it. */
export async function getShipment(id: string): Promise<ShipmentDetail | null> {
  const supabase = createClient()
  const { data: ship } = await supabase
    .from('shipments')
    .select(SHIPMENT_COLS)
    .eq('id', id).maybeSingle() as { data: Shipment | null }
  if (!ship) return null

  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, shipment_id, supplier_id, destination_supplier_id, stock_move')
    .eq('po_type', 'transfer').eq('shipment_id', id)
    .order('po_number') as { data: POChip[] | null }
  const poRows = pos ?? []
  const byPo = await contentsAndUnits(poRows.map((p) => p.id))
  const names = await siteNames(poRows.flatMap((p) => [p.supplier_id ?? '', p.destination_supplier_id ?? '']))

  const transfers: ShipmentTransfer[] = poRows.map((p) => ({
    id: p.id, po_number: p.po_number, status: p.status,
    from_site: p.supplier_id ? names.get(p.supplier_id) ?? null : null,
    to_site: p.destination_supplier_id ? names.get(p.destination_supplier_id) ?? null : null,
    contents: byPo.get(p.id)?.contents ?? '—',
    units: byPo.get(p.id)?.units ?? 0,
    moves_build: p.stock_move === 'NZ_TO_AU' || p.stock_move === 'AU_TO_NZ',
  }))
  return { ...ship, transfers, total_units: transfers.reduce((s, t) => s + t.units, 0) }
}

/** Unassigned transfers (not on any shipment, not cancelled) — for the "add" picker. */
export async function listAssignableTransfers(): Promise<ShipmentTransfer[]> {
  const supabase = createClient()
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, shipment_id, supplier_id, destination_supplier_id, stock_move')
    .eq('po_type', 'transfer').is('shipment_id', null).neq('status', 'cancelled')
    .order('po_number', { ascending: false }) as { data: POChip[] | null }
  const poRows = pos ?? []
  const byPo = await contentsAndUnits(poRows.map((p) => p.id))
  const names = await siteNames(poRows.flatMap((p) => [p.supplier_id ?? '', p.destination_supplier_id ?? '']))
  return poRows.map((p) => ({
    id: p.id, po_number: p.po_number, status: p.status,
    from_site: p.supplier_id ? names.get(p.supplier_id) ?? null : null,
    to_site: p.destination_supplier_id ? names.get(p.destination_supplier_id) ?? null : null,
    contents: byPo.get(p.id)?.contents ?? '—',
    units: byPo.get(p.id)?.units ?? 0,
    moves_build: p.stock_move === 'NZ_TO_AU' || p.stock_move === 'AU_TO_NZ',
  }))
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

