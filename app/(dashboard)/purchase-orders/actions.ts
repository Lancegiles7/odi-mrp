'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type POStatus = 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'

export interface POLineInput {
  id?: string                    // existing line id (when editing)
  line_type: 'ingredient' | 'product' | 'packaging' | 'other'
  ingredient_id: string | null
  product_id: string | null
  packaging_id: string | null
  description: string | null
  quantity_ordered: number
  unit_cost: number | null
  unit_of_measure: string
  notes: string | null
  // Line-level supplier code + pack size. Used by product / "other" lines that
  // have no item master to save back to. Persisted on the PO line itself.
  supplier_code?: string | null
  supplier_pack_size?: number | null
  // Supplier reference data — only sent when the user has clicked
  // "save updated value to ingredient" on the line. When non-null, the
  // PO save also writes these back to the ingredient row.
  save_back_supplier_data?: {
    supplier_sku_code:  string | null
    supplier_pack_size: number | null
    supplier_pack_unit: string | null
    price:              number | null
  }
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
  currency?: string
  market?: string
  issuer_id?: string | null
  company_id?: string | null
  order_date: string
  expected_delivery_date: string | null
  delivery_address_id: string | null
  delivery_notes: string | null
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
      currency:               (input.currency ?? 'NZD').toUpperCase(),
      market:                 input.market === 'AU' ? 'AU' : 'NZ',
      issuer_id:              input.issuer_id ?? null,
      company_id:             input.company_id ?? null,
      status:                 'draft',
      order_date:             input.order_date,
      expected_delivery_date: input.expected_delivery_date,
      delivery_address_id:    input.delivery_address_id,
      delivery_notes:         input.delivery_notes,
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

  await applySaveBackToIngredients(supabase, input.lines)

  revalidatePath('/purchase-orders')
  revalidatePath('/ingredients')
  return { ok: true, id: poHeader.id }
}

// ============================================================
// Update PO header + replace lines (only allowed while draft)
// ============================================================
export async function updatePurchaseOrder(input: {
  id: string
  po_number: string
  supplier_id: string
  currency?: string
  market?: string
  issuer_id?: string | null
  company_id?: string | null
  order_date: string
  expected_delivery_date: string | null
  delivery_address_id: string | null
  delivery_notes: string | null
  notes: string | null
  lines: POLineInput[]
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // Allow edits in draft or submitted state. Once any receipt has been
  // recorded (partially_received) we lock the form to protect receipt history.
  const { data: existing } = await supabase
    .from('purchase_orders').select('status').eq('id', input.id).maybeSingle() as { data: { status: POStatus } | null }
  if (!existing) return { ok: false, error: 'PO not found' }
  if (existing.status !== 'draft' && existing.status !== 'submitted') {
    return { ok: false, error: `PO is ${existing.status} and can no longer be edited via this form.` }
  }

  const { error: hErr } = await supabase
    .from('purchase_orders')
    .update({
      po_number:              input.po_number.trim(),
      supplier_id:            input.supplier_id,
      currency:               (input.currency ?? 'NZD').toUpperCase(),
      market:                 input.market === 'AU' ? 'AU' : 'NZ',
      issuer_id:              input.issuer_id ?? null,
      company_id:             input.company_id ?? null,
      order_date:             input.order_date,
      expected_delivery_date: input.expected_delivery_date,
      delivery_address_id:    input.delivery_address_id,
      delivery_notes:         input.delivery_notes,
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

  await applySaveBackToIngredients(supabase, input.lines)

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${input.id}`)
  revalidatePath('/ingredients')
  return { ok: true }
}

// ============================================================
// Helper: write supplier ref-data back to ingredient when the user
// has clicked "save updated value to ingredient" on a line.
// ============================================================
async function applySaveBackToIngredients(
  supabase: ReturnType<typeof createClient>,
  lines: POLineInput[],
): Promise<void> {
  for (const l of lines) {
    if (!l.save_back_supplier_data) continue
    const sb = l.save_back_supplier_data

    // Supplier reference fields apply to both ingredients and packaging.
    const ref: Record<string, unknown> = {}
    if (sb.supplier_sku_code !== undefined)  ref.supplier_sku_code  = sb.supplier_sku_code
    if (sb.supplier_pack_size !== undefined) ref.supplier_pack_size = sb.supplier_pack_size
    if (sb.supplier_pack_unit !== undefined) ref.supplier_pack_unit = sb.supplier_pack_unit

    if (l.ingredient_id) {
      const patch = { ...ref }
      // Price save-back is ingredient-only (matches the form).
      if (sb.price !== undefined) patch.price = sb.price
      if (Object.keys(patch).length > 0) await supabase.from('ingredients').update(patch).eq('id', l.ingredient_id)
    } else if (l.packaging_id) {
      // Reference data only — packaging price/loaded cost is owned by the
      // packaging page so a PO edit can't leave the loaded cost stale.
      if (Object.keys(ref).length > 0) await supabase.from('packaging').update(ref).eq('id', l.packaging_id)
    }
  }
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
  // Retained as a thin alias for backwards compatibility with old call sites.
  return deletePurchaseOrder(id)
}

/**
 * Delete a PO at any status, as long as no stock movements reference its lines.
 * - draft / submitted / cancelled → deletable (lines cascade-delete by FK)
 * - partially_received / received → blocked, since stock_movements have already
 *   adjusted inventory. User must reverse the stock adjustment first.
 */
export async function deletePurchaseOrder(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: existing } = await supabase
    .from('purchase_orders').select('po_number, status').eq('id', id).maybeSingle() as { data: { po_number: string; status: POStatus } | null }
  if (!existing) return { ok: false, error: 'PO not found' }

  // Find line IDs first so we can check for stock movement references
  const { data: lines } = await supabase
    .from('purchase_order_lines').select('id').eq('purchase_order_id', id) as { data: Array<{ id: string }> | null }
  const lineIds = (lines ?? []).map((l) => l.id)

  if (lineIds.length > 0) {
    const { count } = await supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .in('purchase_order_line_id', lineIds)
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `Cannot delete: ${count} stock movement${count === 1 ? '' : 's'} reference${count === 1 ? 's' : ''} this PO's lines (inventory has already been adjusted). Reverse the receipts first, or cancel the PO and leave it in place for audit history.`,
      }
    }
  }

  // Lines cascade-delete via FK ON DELETE CASCADE (migration 001).
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/purchase-orders')
  redirect('/purchase-orders')
}

// ============================================================
// Receive lines — records the receipt as a stock movement (which
// increments inventory_balances at Main Warehouse via DB trigger),
// updates quantity_received on each PO line, and records the
// invoice unit price separately from the agreed PO price.
//
// PO line.unit_cost is left unchanged (= the agreed PO price). The
// invoice price arrives on stock_movements.unit_cost.
// ============================================================
export async function receivePoLines(input: {
  po_id: string
  receipts: Array<{ line_id: string; receiving_now: number; invoice_unit_cost: number | null; note: string | null }>
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Resolve Main Warehouse location
  const { data: mainLoc } = await supabase
    .from('locations')
    .select('id')
    .eq('code', 'MAIN')
    .maybeSingle() as { data: { id: string } | null }
  if (!mainLoc) return { ok: false, error: 'Main Warehouse location is missing — please contact admin' }

  // Pull current lines (we need ingredient_id, packaging_id, qty info, agreed price, uom)
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('id, ingredient_id, product_id, packaging_id, quantity_ordered, quantity_received, unit_cost, unit_of_measure')
    .eq('purchase_order_id', input.po_id) as { data: Array<{
      id: string; ingredient_id: string | null; product_id: string | null; packaging_id: string | null;
      quantity_ordered: number; quantity_received: number; unit_cost: number | null;
      unit_of_measure: string;
    }> | null }

  if (!lines) return { ok: false, error: 'PO lines not found' }

  for (const r of input.receipts) {
    if (r.receiving_now <= 0) continue
    const line = lines.find((l) => l.id === r.line_id)
    if (!line) continue

    const newReceived = Math.min(
      Number(line.quantity_ordered),
      Number(line.quantity_received) + Number(r.receiving_now),
    )
    const actualReceiving = newReceived - Number(line.quantity_received)
    if (actualReceiving <= 0) continue

    // Update PO line — qty + optional note. Do NOT overwrite unit_cost
    // (keep it as the agreed PO price for receipt comparisons).
    const updates: Record<string, unknown> = { quantity_received: newReceived }
    if (r.note?.trim()) updates.notes = r.note.trim()
    const { error: lineErr } = await supabase
      .from('purchase_order_lines').update(updates).eq('id', r.line_id)
    if (lineErr) return { ok: false, error: lineErr.message }

    // Stock movement — for ingredient OR packaging lines. Product / 'other'
    // lines don't increment inventory.
    if (line.ingredient_id || line.packaging_id) {
      const invoiceCost = (r.invoice_unit_cost != null && Number.isFinite(r.invoice_unit_cost) && r.invoice_unit_cost >= 0)
        ? r.invoice_unit_cost
        : line.unit_cost
      const { error: mvErr } = await supabase
        .from('stock_movements')
        .insert({
          ingredient_id:          line.ingredient_id,
          packaging_id:           line.packaging_id,
          location_id:            mainLoc.id,
          movement_type:          'purchase_received',
          quantity:               actualReceiving,
          unit_of_measure:        line.unit_of_measure,
          reference_type:         'purchase_order',
          purchase_order_line_id: line.id,
          unit_cost:              invoiceCost,
          notes:                  r.note?.trim() ?? '',
          created_by:             profile?.id ?? null,
        })
      if (mvErr) return { ok: false, error: `Stock movement failed: ${mvErr.message}` }
    }
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
    packaging_id:      t === 'packaging'  ? l.packaging_id  : null,
    description:       t === 'other'      ? (l.description?.trim() || null) : null,
    quantity_ordered:  Number(l.quantity_ordered) || 0,
    quantity_received: 0,
    unit_cost:         l.unit_cost != null && Number.isFinite(Number(l.unit_cost)) ? Number(l.unit_cost) : null,
    unit_of_measure:   l.unit_of_measure?.trim() || 'each',
    notes:             l.notes?.trim() || null,
    // Line-level supplier code/pack size — carried by product & "other" lines
    // (ingredient/packaging use their master, leaving these null).
    supplier_code:      (t === 'product' || t === 'other') ? (l.supplier_code?.trim() || null) : null,
    supplier_pack_size: (t === 'product' || t === 'other') && l.supplier_pack_size != null && Number.isFinite(Number(l.supplier_pack_size)) ? Number(l.supplier_pack_size) : null,
  }
}

function validateLines(rows: ReturnType<typeof sanitiseLine>[]): string | null {
  if (rows.length === 0) return 'Add at least one line.'
  for (const r of rows) {
    const targets = [r.ingredient_id, r.product_id, r.packaging_id, r.description].filter(Boolean).length
    if (targets !== 1) return 'Each line must have exactly one of: ingredient, product, packaging, or description.'
    if (!Number.isFinite(r.quantity_ordered) || r.quantity_ordered <= 0) return 'Each line needs a positive quantity.'
  }
  return null
}
