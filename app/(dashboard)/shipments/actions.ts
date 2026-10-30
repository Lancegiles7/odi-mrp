'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ShipmentDirection, ShipmentStatus, ContainerType, CostBasis, FreightCurrency } from '@/lib/shipments'

/** The optional booking-detail fields, shared by create + update. */
export interface ShipmentDetailsInput {
  container_type?: ContainerType | null
  freight_cost?: number | null
  freight_currency?: FreightCurrency | null
  cost_basis?: CostBasis | null
  carrier?: string | null
  reference?: string | null
  booked_date?: string | null
}

function detailsPatch(input: ShipmentDetailsInput): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  if ('container_type' in input)   p.container_type = input.container_type || null
  if ('freight_cost' in input)     p.freight_cost = (input.freight_cost === null || input.freight_cost === undefined || Number.isNaN(input.freight_cost)) ? null : Number(input.freight_cost)
  if ('freight_currency' in input) p.freight_currency = input.freight_currency || null
  if ('cost_basis' in input)       p.cost_basis = input.cost_basis || null
  if ('carrier' in input)          p.carrier = (input.carrier ?? '').trim() || null
  if ('reference' in input)        p.reference = (input.reference ?? '').trim() || null
  if ('booked_date' in input)      p.booked_date = input.booked_date || null
  return p
}

function revalidateAll() {
  revalidatePath('/shipments')
  revalidatePath('/purchase-orders')
  revalidatePath('/stock-movements')
  revalidatePath('/production')
}

/** Next SHP-### number (sequential; await before the next create). */
async function generateShipmentNumber(): Promise<string> {
  const supabase = createClient()
  const { data } = await supabase
    .from('shipments').select('shipment_number')
    .order('shipment_number', { ascending: false }).limit(1).maybeSingle() as { data: { shipment_number: string } | null }
  let next = 1
  const m = data?.shipment_number?.match(/-(\d+)$/)
  if (m) next = parseInt(m[1], 10) + 1
  return `SHP-${String(next).padStart(3, '0')}`
}

export async function createShipment(input: {
  direction: ShipmentDirection
  depart_date: string | null
  arrive_date: string | null
  notes: string | null
} & ShipmentDetailsInput): Promise<{ ok: boolean; id?: string; shipment_number?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }
  if (input.direction !== 'AU_TO_NZ' && input.direction !== 'NZ_TO_AU') return { ok: false, error: 'Pick a direction.' }
  const { data: profile } = await supabase.from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  const shipment_number = await generateShipmentNumber()
  const { data, error } = await (supabase.from('shipments') as ReturnType<typeof supabase.from>)
    .insert({
      shipment_number,
      direction: input.direction,
      depart_date: input.depart_date || null,
      arrive_date: input.arrive_date || null,
      notes: input.notes?.trim() || null,
      created_by: profile?.id ?? null,
      ...detailsPatch(input),
    })
    .select('id')
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null }
  if (error || !data) return { ok: false, error: error?.message ?? 'Failed to create shipment' }
  revalidateAll()
  return { ok: true, id: data.id, shipment_number }
}

export async function updateShipment(input: {
  id: string
  direction?: ShipmentDirection
  depart_date?: string | null
  arrive_date?: string | null
  status?: ShipmentStatus
  notes?: string | null
} & ShipmentDetailsInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const patch: Record<string, unknown> = { ...detailsPatch(input) }
  if (input.direction)       patch.direction = input.direction
  if (input.status)          patch.status = input.status
  if ('depart_date' in input) patch.depart_date = input.depart_date || null
  if ('arrive_date' in input) patch.arrive_date = input.arrive_date || null
  if ('notes' in input)      patch.notes = input.notes?.trim() || null

  const { error } = await (supabase.from('shipments') as ReturnType<typeof supabase.from>)
    .update(patch).eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  // Cascade dates onto the transfers loaded on this shipment, so changing the
  // boat's dates moves everything on it (depart → pickup, arrive → expected).
  if ('depart_date' in input || 'arrive_date' in input) {
    const datePatch: Record<string, unknown> = {}
    if ('depart_date' in input) datePatch.pickup_date = input.depart_date || null
    if ('arrive_date' in input) datePatch.expected_delivery_date = input.arrive_date || null
    await (supabase.from('purchase_orders') as ReturnType<typeof supabase.from>)
      .update(datePatch).eq('shipment_id', input.id)
  }
  revalidateAll()
  return { ok: true }
}

export async function deleteShipment(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  // FK is ON DELETE SET NULL — transfers are un-loaded, not deleted.
  const { error } = await supabase.from('shipments').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidateAll()
  return { ok: true }
}

/** Load a transfer onto a shipment (inheriting its dates) or take it off (shipmentId = null). */
export async function setTransferShipment(transferId: string, shipmentId: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const patch: Record<string, unknown> = { shipment_id: shipmentId }
  if (shipmentId) {
    const { data: ship } = await supabase
      .from('shipments').select('depart_date, arrive_date').eq('id', shipmentId).maybeSingle() as { data: { depart_date: string | null; arrive_date: string | null } | null }
    if (ship) {
      patch.pickup_date = ship.depart_date
      patch.expected_delivery_date = ship.arrive_date
    }
  }
  const { error } = await (supabase.from('purchase_orders') as ReturnType<typeof supabase.from>)
    .update(patch).eq('id', transferId).eq('po_type', 'transfer')
  if (error) return { ok: false, error: error.message }
  revalidateAll()
  return { ok: true }
}

/** Open shipments formatted for the "Goes on shipment" picker (fetched fresh when a
 *  dialog opens, so a shipment created after the page loaded still shows up). */
export async function openShipmentOptions(): Promise<Array<{ id: string; label: string }>> {
  const { listOpenShipments } = await import('@/lib/shipments')
  const ships = await listOpenShipments()
  return ships.map((s) => {
    const route = s.direction === 'AU_TO_NZ' ? 'AU→NZ' : 'NZ→AU'
    const arr = s.arrive_date ? new Date(s.arrive_date + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date'
    return { id: s.id, label: `${s.shipment_number} · ${route} · arrive ${arr}` }
  })
}
