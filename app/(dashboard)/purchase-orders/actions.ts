'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { convertGramsToIngredientUom } from '@/lib/ingredient-demand'

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
  external_notes: string | null
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
      external_notes:         input.external_notes,
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
  external_notes: string | null
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
      external_notes:         input.external_notes,
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
  received_date?: string           // fallback ISO yyyy-mm-dd if a line omits its own
  receipts: Array<{
    line_id: string
    received: number               // the TOTAL received for this line (edit-in-place, not a delta)
    received_date?: string         // ISO yyyy-mm-dd the stock physically arrived (per line)
    invoice_unit_cost: number | null
    note: string | null
    lot_number?: string | null
    expiry_date?: string | null      // ISO yyyy-mm-dd
    coa_file_path?: string | null
    coa_file_name?: string | null
  }>
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

  // Which market/build this PO replenishes → decides whether receipts lift the
  // NZ or the AU opening-stock figure on the demand view.
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('po_number, market')
    .eq('id', input.po_id)
    .maybeSingle() as { data: { po_number: string; market: string | null } | null }
  const poMarket: 'NZ' | 'AU' = po?.market === 'AU' ? 'AU' : 'NZ'
  const openCol = poMarket === 'AU' ? 'opening_stock_override_au' : 'opening_stock_override'

  // The date stock physically arrived — drives the Stock Movements month.
  // Per line (split deliveries differ); fall back to the PO-level date, else today.
  const todayIso = new Date().toISOString().slice(0, 10)
  const isoDate = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? (v as string) : null)
  const poReceiptIso = isoDate(input.received_date) ?? todayIso

  // Current opening figures + display UoM for the ingredients/packaging on this
  // PO, so we can convert the received qty into the demand view's unit and add it.
  const ingIds = Array.from(new Set(lines.filter((l) => l.ingredient_id).map((l) => l.ingredient_id as string)))
  const pakIds = Array.from(new Set(lines.filter((l) => l.packaging_id).map((l) => l.packaging_id as string)))

  const { data: ingInfo } = ingIds.length
    ? await supabase.from('ingredients')
        .select('id, unit_of_measure, opening_stock_override, opening_stock_override_au')
        .in('id', ingIds) as { data: Array<{ id: string; unit_of_measure: string | null; opening_stock_override: number | null; opening_stock_override_au: number | null }> | null }
    : { data: [] as Array<{ id: string; unit_of_measure: string | null; opening_stock_override: number | null; opening_stock_override_au: number | null }> }
  const { data: pakInfo } = pakIds.length
    ? await supabase.from('packaging')
        .select('id, unit_of_measure, opening_stock_override, opening_stock_override_au')
        .in('id', pakIds) as { data: Array<{ id: string; unit_of_measure: string | null; opening_stock_override: number | null; opening_stock_override_au: number | null }> | null }
    : { data: [] as Array<{ id: string; unit_of_measure: string | null; opening_stock_override: number | null; opening_stock_override_au: number | null }> }

  const ingById = new Map((ingInfo ?? []).map((i) => [i.id, i]))
  const pakById = new Map((pakInfo ?? []).map((p) => [p.id, p]))

  // Accumulate received qty (in each item's own display UoM) so multiple lines
  // for the same item roll up into a single opening-stock bump.
  const ingBump = new Map<string, number>()
  const pakBump = new Map<string, number>()

  for (const r of input.receipts) {
    const line = lines.find((l) => l.id === r.line_id)
    if (!line) continue

    // Edit-in-place: `received` is the TOTAL now on the line, not a delta.
    // delta drives inventory movements (may be negative when correcting down).
    // Over-delivery is allowed — no cap at the ordered quantity.
    const received = Math.max(0, Number(r.received) || 0)
    const delta = received - Number(line.quantity_received)
    if (delta === 0) continue

    const receiptIso = isoDate(r.received_date) ?? poReceiptIso

    // Update the PO line total (+ optional note). unit_cost stays the agreed price.
    const updates: Record<string, unknown> = { quantity_received: received }
    if (r.note?.trim()) updates.notes = r.note.trim()
    const { error: lineErr } = await supabase
      .from('purchase_order_lines').update(updates).eq('id', r.line_id)
    if (lineErr) return { ok: false, error: lineErr.message }

    // Stock movement — ingredient / packaging lines only (products don't touch
    // ingredient inventory). Positive delta = received; negative = correction down.
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
          movement_type:          delta > 0 ? 'purchase_received' : 'correction',
          quantity:               delta,
          unit_of_measure:        line.unit_of_measure,
          reference_type:         'purchase_order',
          purchase_order_line_id: line.id,
          unit_cost:              invoiceCost,
          notes:                  r.note?.trim() ?? '',
          lot_number:             delta > 0 ? (r.lot_number?.trim() || null) : null,
          expiry_date:            delta > 0 ? (r.expiry_date?.trim() || null) : null,
          coa_file_path:          delta > 0 ? (r.coa_file_path?.trim() || null) : null,
          coa_file_name:          delta > 0 ? (r.coa_file_name?.trim() || null) : null,
          created_by:             profile?.id ?? null,
        } as never)
      if (mvErr) return { ok: false, error: `Stock movement failed: ${mvErr.message}` }

      // Adjust the demand view's opening-stock figure by the delta (signed).
      const lineUom = (line.unit_of_measure ?? '').trim().toLowerCase()
      if (line.ingredient_id) {
        const itemUom = ingById.get(line.ingredient_id)?.unit_of_measure ?? null
        const qty = lineUom === 'g' ? convertGramsToIngredientUom(delta, itemUom) : delta
        ingBump.set(line.ingredient_id, (ingBump.get(line.ingredient_id) ?? 0) + qty)
      } else if (line.packaging_id) {
        const itemUom = pakById.get(line.packaging_id)?.unit_of_measure ?? null
        const qty = lineUom === 'g' ? convertGramsToIngredientUom(delta, itemUom) : delta
        pakBump.set(line.packaging_id, (pakBump.get(line.packaging_id) ?? 0) + qty)
      }
    }

    // Finished-goods product line — reconcile its Stock Movements receipt to the
    // new total (one po_receipt row per line, dated the line's received date), so
    // editing the amount never double- or under-counts. NON-FATAL: never block
    // the receipt if this logging fails.
    if (line.product_id) {
      await supabase.from('finished_goods_receipts')
        .delete().eq('purchase_order_line_id', line.id).eq('source', 'po_receipt')
      if (received > 0) {
        const { error: fgErr } = await supabase.from('finished_goods_receipts').insert({
          product_id:             line.product_id,
          received_month:         `${receiptIso.slice(0, 7)}-01`,
          received_date:          receiptIso,
          units:                  received,
          source:                 'po_receipt',
          po_number:              po?.po_number ?? null,
          purchase_order_line_id: line.id,
          market:                 poMarket,
          created_by:             profile?.id ?? null,
        } as never)
        if (fgErr) console.error(`[receivePoLines] Stock-Movements receipt log failed for line ${line.id}: ${fgErr.message}`)
      }
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

  // Apply the opening-stock bumps for everything received in this call, and
  // append an audit row per item (mirrors the manual opening-stock edit path).
  const receiptNote = `Received on ${po?.po_number ?? 'PO'}`
  for (const [ingredientId, qty] of Array.from(ingBump.entries())) {
    if (qty <= 0) continue
    const prev = (poMarket === 'AU' ? ingById.get(ingredientId)?.opening_stock_override_au : ingById.get(ingredientId)?.opening_stock_override) ?? null
    const newVal = (prev ?? 0) + qty
    const { error: upErr } = await supabase.from('ingredients').update({ [openCol]: newVal }).eq('id', ingredientId)
    if (upErr) return { ok: false, error: `Opening stock update failed: ${upErr.message}` }
    await supabase.from('ingredient_opening_stock_history').insert({
      ingredient_id: ingredientId, previous_value: prev, new_value: newVal,
      note: receiptNote, market: poMarket, changed_by: profile?.id ?? null,
    } as never)
  }
  for (const [packagingId, qty] of Array.from(pakBump.entries())) {
    if (qty <= 0) continue
    const prev = (poMarket === 'AU' ? pakById.get(packagingId)?.opening_stock_override_au : pakById.get(packagingId)?.opening_stock_override) ?? null
    const newVal = (prev ?? 0) + qty
    const { error: upErr } = await supabase.from('packaging').update({ [openCol]: newVal }).eq('id', packagingId)
    if (upErr) return { ok: false, error: `Opening stock update failed: ${upErr.message}` }
    await supabase.from('packaging_opening_stock_history').insert({
      packaging_id: packagingId, previous_value: prev, new_value: newVal,
      note: receiptNote, market: poMarket, changed_by: profile?.id ?? null,
    } as never)
  }

  revalidatePath('/packaging/demand')
  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${input.po_id}`)
  revalidatePath(`/purchase-orders/${input.po_id}/receive`)
  revalidatePath('/ingredients/demand')
  revalidatePath('/stock-movements')
  return { ok: true }
}

// ============================================================
// Correct received quantities — fix a mis-keyed receipt in-app,
// without a manual DB reset. Product / 'other' lines can be set to any
// value 0..ordered (they don't move inventory). Ingredient / packaging
// lines that already created a stock movement are LOCKED here — those
// have adjusted on-hand stock, so they're left untouched and reported
// back (reverse via a stock adjustment instead). Recomputes PO status
// so the Receive screen reopens if anything drops below ordered.
// ============================================================
export async function correctReceivedQuantities(input: {
  po_id: string
  corrections: Array<{ line_id: string; quantity_received: number }>
}): Promise<{ ok: boolean; error?: string; skipped?: string[] }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('id, ingredient_id, packaging_id, product_id, description, quantity_ordered')
    .eq('purchase_order_id', input.po_id) as { data: Array<{
      id: string; ingredient_id: string | null; packaging_id: string | null; product_id: string | null;
      description: string | null; quantity_ordered: number
    }> | null }
  if (!lines) return { ok: false, error: 'PO lines not found' }

  // PO + user for re-logging finished-goods receipts (product lines) below.
  const { data: po } = await supabase
    .from('purchase_orders').select('po_number, market').eq('id', input.po_id).maybeSingle() as
    { data: { po_number: string; market: string | null } | null }
  const poMarket: 'NZ' | 'AU' = po?.market === 'AU' ? 'AU' : 'NZ'
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Lines that already moved inventory can't be corrected from here.
  const lineIds = lines.map((l) => l.id)
  const { data: movements } = await supabase
    .from('stock_movements')
    .select('purchase_order_line_id')
    .in('purchase_order_line_id', lineIds.length ? lineIds : ['00000000-0000-0000-0000-000000000000']) as
    { data: Array<{ purchase_order_line_id: string | null }> | null }
  const moved = new Set((movements ?? []).map((m) => m.purchase_order_line_id))

  const skipped: string[] = []
  for (const c of input.corrections) {
    const line = lines.find((l) => l.id === c.line_id)
    if (!line) continue
    if (moved.has(line.id)) { skipped.push(line.description ?? line.id); continue }
    // Over-delivery allowed — no cap at ordered (matches the receive flow).
    const qty = Math.max(0, Math.round(Number(c.quantity_received) || 0))
    const { error } = await supabase
      .from('purchase_order_lines').update({ quantity_received: qty }).eq('id', line.id)
    if (error) return { ok: false, error: error.message }

    // Keep the finished-goods ledger in step for product lines: drop this line's
    // PO-sourced receipts and re-log the corrected total (if any), so Stock
    // Movements never double- or under-counts after a correction.
    if (line.product_id) {
      await supabase.from('finished_goods_receipts')
        .delete().eq('purchase_order_line_id', line.id).eq('source', 'po_receipt')
      if (qty > 0) {
        const iso = new Date().toISOString().slice(0, 10)
        await supabase.from('finished_goods_receipts').insert({
          product_id:             line.product_id,
          received_month:         `${iso.slice(0, 7)}-01`,
          received_date:          iso,
          units:                  qty,
          source:                 'po_receipt',
          po_number:              po?.po_number ?? null,
          purchase_order_line_id: line.id,
          market:                 poMarket,
          created_by:             profile?.id ?? null,
        } as never)
      }
    }
  }

  // Recompute status from the corrected quantities.
  const { data: refreshed } = await supabase
    .from('purchase_order_lines')
    .select('quantity_ordered, quantity_received')
    .eq('purchase_order_id', input.po_id) as { data: Array<{ quantity_ordered: number; quantity_received: number }> | null }
  if (refreshed && refreshed.length) {
    const allFull    = refreshed.every((l) => Number(l.quantity_received) >= Number(l.quantity_ordered))
    const anyPartial = refreshed.some((l) => Number(l.quantity_received) > 0)
    const nextStatus: POStatus = allFull ? 'received' : anyPartial ? 'partially_received' : 'submitted'
    await supabase.from('purchase_orders').update({ status: nextStatus }).eq('id', input.po_id)
  }

  revalidatePath(`/purchase-orders/${input.po_id}`)
  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${input.po_id}/receive`)
  revalidatePath('/stock-movements')
  return { ok: true, skipped: skipped.length ? skipped : undefined }
}

// ============================================================
// Receipt COA (Certificate of Analysis) attachments
// Files live in the private `receipt-docs` Storage bucket; the path +
// filename are recorded on the stock_movements row at receipt time.
//
// Upload happens as soon as the user picks a file (so the receive form
// can show the chip immediately). If they then remove it before
// confirming, removeReceiptCoa() deletes the orphaned object.
// ============================================================
const RECEIPT_COA_BUCKET = 'receipt-docs'
const RECEIPT_COA_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function uploadReceiptCoa(
  formData: FormData,
): Promise<{ ok: boolean; file_path?: string; file_name?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const lineId = ((formData.get('line_id') as string | null) ?? '').trim()
  const file   = formData.get('file') as File | null

  if (!lineId)                       return { ok: false, error: 'Missing line id' }
  if (!file || file.size === 0)      return { ok: false, error: 'No file selected' }
  if (file.size > RECEIPT_COA_MAX_BYTES) return { ok: false, error: 'File too large (10 MB max)' }

  // Object path: <line_id>/<timestamp>-<filename>. Timestamp avoids clobbering
  // when the same filename is re-uploaded.
  const safeName   = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  const ts         = String(new Date().getTime())
  const objectPath = `${lineId}/${ts}-${safeName}`

  const { error: uploadErr } = await supabase.storage
    .from(RECEIPT_COA_BUCKET)
    .upload(objectPath, file, { contentType: file.type, upsert: false })
  if (uploadErr) return { ok: false, error: `Upload failed: ${uploadErr.message}` }

  return { ok: true, file_path: objectPath, file_name: file.name }
}

export async function removeReceiptCoa(filePath: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (!filePath) return { ok: false, error: 'Missing file path' }

  const { error } = await supabase.storage.from(RECEIPT_COA_BUCKET).remove([filePath])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getReceiptCoaUrl(
  filePath: string,
  fileName: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (!filePath) return { ok: false, error: 'Missing file path' }

  const { data: signed, error } = await supabase.storage
    .from(RECEIPT_COA_BUCKET)
    .createSignedUrl(filePath, 60, { download: fileName || true })

  if (error || !signed) return { ok: false, error: error?.message ?? 'Sign failed' }
  return { ok: true, url: signed.signedUrl }
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
