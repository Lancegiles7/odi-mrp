'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type POStatus = 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'

export interface POLineInput {
  id?: string                    // existing line id (when editing)
  line_type: 'ingredient' | 'product' | 'other'
  ingredient_id: string | null
  product_id: string | null
  description: string | null
  quantity_ordered: number
  unit_cost: number | null
  unit_of_measure: string
  notes: string | null
}

// ============================================================
// PO number generator: PO-YYYY-NNN, where NNN is the next number
// in the current year. Falls back to 001 if none exist yet.
// ============================================================
export async function generatePoNumber(): Promise<string> {
  const supabase = createClient()
  const year = new Date().getFullYear()
  const prefix = `PO-${year}-`

  const { data } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .ilike('po_number', `${prefix}%`)
    .order('po_number', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { po_number: string } | null }

  let next = 1
  if (data?.po_number) {
    const match = data.po_number.match(/PO-\d{4}-(\d+)/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ============================================================
// Create draft PO with lines
// ============================================================
export async function createPurchaseOrder(input: {
  po_number: string
  supplier_id: string
  order_date: string
  expected_delivery_date: string | null
  notes: string | null
  lines: POLineInput[]
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  if (!input.po_number?.trim()) return { ok: false, error: 'PO number is required' }
  if (!input.supplier_id)       return { ok: false, error: 'Supplier is required' }
  if (input.lines.length === 0) return { ok: false, error: 'Add at least one line' }

  // Insert PO header
  const { data: poHeader, error: headerErr } = await supabase
    .from('purchase_orders')
    .insert({
      po_number:              input.po_number.trim(),
      supplier_id:            input.supplier_id,
      status:                 'draft',
      order_date:             input.order_date,
      expected_delivery_date: input.expected_delivery_date,
      notes:                  input.notes,
      created_by:             profile?.id ?? null,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (headerErr || !poHeader) return { ok: false, error: headerErr?.message ?? 'Failed to create PO' }

  // Insert lines
  const lineRows = input.lines.map((l) => sanitiseLine(l, poHeader.id))
  const lineErr = validateLines(lineRows)
  if (lineErr) {
    // Rollback header (no transaction support in supabase-js, do best effort)
    await supabase.from('purchase_orders').delete().eq('id', poHeader.id)
    return { ok: false, error: lineErr }
  }

  const { error: linesErr } = await supabase.from('purchase_order_lines').insert(lineRows)
  if (linesErr) {
    await supabase.from('purchase_orders').delete().eq('id', poHeader.id)
    return { ok: false, error: linesErr.message }
  }

  revalidatePath('/purchase-orders')
  return { ok: true, id: poHeader.id }
}

// ============================================================
// Update PO header + replace lines (only allowed while draft)
// ============================================================
export async function updatePurchaseOrder(input: {
  id: string
  po_number: string
  supplier_id: string
  order_date: string
  expected_delivery_date: string | null
  notes: string | null
  lines: POLineInput[]
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Confirm still draft (no editing once submitted)
  const { data: existing } = await supabase
    .from('purchase_orders').select('status').eq('id', input.id).maybeSingle() as { data: { status: POStatus } | null }
  if (!existing) return { ok: false, error: 'PO not found' }
  if (existing.status !== 'draft') return { ok: false, error: 'PO can only be edited while in draft.' }

  const { error: hErr } = await supabase
    .from('purchase_orders')
    .update({
      po_number:              input.po_number.trim(),
      supplier_id:            input.supplier_id,
      order_date:             input.order_date,
      expected_delivery_date: input.expected_delivery_date,
      notes:                  input.notes,
    })
    .eq('id', input.id)
  if (hErr) return { ok: false, error: hErr.message }

  // Replace lines wholesale: simplest correct approach for draft edits
  await supabase.from('purchase_order_lines').delete().eq('purchase_order_id', input.id)

  const lineRows = input.lines.map((l) => sanitiseLine(l, input.id))
  const lineErr = validateLines(lineRows)
  if (lineErr) return { ok: false, error: lineErr }

  if (lineRows.length > 0) {
    const { error: lErr } = await supabase.from('purchase_order_lines').insert(lineRows)
    if (lErr) return { ok: false, error: lErr.message }
  }

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${input.id}`)
  return { ok: true }
}

// ============================================================
// Status transitions
// ============================================================
export async function setPoStatus(id: string, status: POStatus): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { error } = await supabase
    .from('purchase_orders').update({ status }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${id}`)
  revalidatePath('/ingredients/demand')
  return { ok: true }
}

export async function deleteDraftPo(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: existing } = await supabase
    .from('purchase_orders').select('status').eq('id', id).maybeSingle() as { data: { status: POStatus } | null }
  if (existing?.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted.' }

  const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/purchase-orders')
  redirect('/purchase-orders')
}

// ============================================================
// Receive lines — accepts new received_qty and optional unit_cost amend
// ============================================================
export async function receivePoLines(input: {
  po_id: string
  receipts: Array<{ line_id: string; receiving_now: number; unit_cost: number | null; note: string | null }>
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Pull current lines to compute new quantity_received
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('id, quantity_ordered, quantity_received, unit_cost')
    .eq('purchase_order_id', input.po_id) as { data: Array<{ id: string; quantity_ordered: number; quantity_received: number; unit_cost: number | null }> | null }

  if (!lines) return { ok: false, error: 'PO lines not found' }

  for (const r of input.receipts) {
    if (r.receiving_now <= 0) continue
    const line = lines.find((l) => l.id === r.line_id)
    if (!line) continue

    const newReceived = Math.min(
      Number(line.quantity_ordered),
      Number(line.quantity_received) + Number(r.receiving_now),
    )

    const updates: Record<string, unknown> = {
      quantity_received: newReceived,
    }
    if (r.unit_cost != null && Number.isFinite(r.unit_cost) && r.unit_cost >= 0) {
      updates.unit_cost = r.unit_cost
    }
    if (r.note?.trim()) {
      updates.notes = r.note.trim()
    }

    const { error } = await supabase
      .from('purchase_order_lines').update(updates).eq('id', r.line_id)
    if (error) return { ok: false, error: error.message }
  }

  // Recompute PO status: sum of received vs ordered across all lines
  const { data: refreshed } = await supabase
    .from('purchase_order_lines')
    .select('quantity_ordered, quantity_received')
    .eq('purchase_order_id', input.po_id) as { data: Array<{ quantity_ordered: number; quantity_received: number }> | null }

  if (refreshed) {
    const allFull = refreshed.every((l) => Number(l.quantity_received) >= Number(l.quantity_ordered))
    const anyPartial = refreshed.some((l) => Number(l.quantity_received) > 0)
    const nextStatus: POStatus = allFull ? 'received' : anyPartial ? 'partially_received' : 'submitted'
    await supabase.from('purchase_orders').update({ status: nextStatus }).eq('id', input.po_id)
  }

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${input.po_id}`)
  revalidatePath('/ingredients/demand')
  return { ok: true }
}

// ============================================================
// Helpers
// ============================================================
function sanitiseLine(l: POLineInput, poId: string) {
  const t = l.line_type
  return {
    purchase_order_id: poId,
    ingredient_id:     t === 'ingredient' ? l.ingredient_id : null,
    product_id:        t === 'product'    ? l.product_id    : null,
    description:       t === 'other'      ? (l.description?.trim() || null) : null,
    quantity_ordered:  Number(l.quantity_ordered) || 0,
    quantity_received: 0,
    unit_cost:         l.unit_cost != null && Number.isFinite(Number(l.unit_cost)) ? Number(l.unit_cost) : null,
    unit_of_measure:   l.unit_of_measure?.trim() || 'each',
    notes:             l.notes?.trim() || null,
  }
}

function validateLines(rows: ReturnType<typeof sanitiseLine>[]): string | null {
  if (rows.length === 0) return 'Add at least one line.'
  for (const r of rows) {
    const targets = [r.ingredient_id, r.product_id, r.description].filter(Boolean).length
    if (targets !== 1) return 'Each line must have exactly one of: ingredient, product, or description.'
    if (!Number.isFinite(r.quantity_ordered) || r.quantity_ordered <= 0) return 'Each line needs a positive quantity.'
  }
  return null
}
