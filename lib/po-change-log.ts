/**
 * PO / transfer change log — captures who amended a purchase order or transfer,
 * when, and the old → new value of each changed field. Written from the
 * purchase-order server actions (create / amend / status / delete) and read
 * back as a "Change history" timeline on the PO detail page.
 *
 * Logging is best-effort: every writer is wrapped so a logging failure (e.g. the
 * table not yet migrated) never blocks the underlying edit.
 */
import type { createClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createClient>

export interface PoLogEntry {
  id: string
  action: 'created' | 'amended' | 'status' | 'deleted'
  field: string | null
  old_value: string | null
  new_value: string | null
  changed_by_name: string | null
  changed_at: string
}

/** A line as held on the PO (before) or supplied in an edit (after). */
interface LineLike {
  id?: string | null
  product_id?: string | null
  ingredient_id?: string | null
  packaging_id?: string | null
  description?: string | null
  quantity_ordered: number
  unit_cost?: number | null
}

/** A header as held on the PO (before) or supplied in an edit (after). */
interface HeaderLike {
  po_type?: string | null
  po_number?: string | null
  supplier_id?: string | null
  destination_supplier_id?: string | null
  order_date?: string | null
  expected_delivery_date?: string | null
  pickup_date?: string | null
  stock_move?: string | null
  transport_provider?: string | null
  currency?: string | null
  market?: string | null
  delivery_notes?: string | null
  notes?: string | null
  external_notes?: string | null
}

export interface PoSnapshot {
  header: Record<string, string | null>
  lines: Map<string, { label: string; qty: number; price: number | null }>
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 10) return iso ? String(iso) : null
  const d = Number(iso.slice(8, 10)), m = Number(iso.slice(5, 7)), y = iso.slice(0, 4)
  return `${d} ${MON[m - 1] ?? ''} ${y}`
}
const txt = (v: string | null | undefined) => (v == null || v === '' ? null : String(v))
const money = (n: number | null | undefined) =>
  n == null ? null : Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyStr = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-NZ')

async function siteNames(supabase: SB, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
  const out = new Map<string, string>()
  if (!uniq.length) return out
  const { data } = await supabase.from('suppliers').select('id, name').in('id', uniq) as { data: Array<{ id: string; name: string }> | null }
  for (const s of data ?? []) out.set(s.id, s.name)
  return out
}

async function itemNames(supabase: SB, lines: LineLike[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const pull = async (table: 'products' | 'ingredients' | 'packaging', ids: Array<string | null | undefined>) => {
    const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
    if (!uniq.length) return
    const { data } = await supabase.from(table).select('id, name').in('id', uniq) as { data: Array<{ id: string; name: string }> | null }
    for (const p of data ?? []) out.set(p.id, p.name)
  }
  await Promise.all([
    pull('products', lines.map((l) => l.product_id)),
    pull('ingredients', lines.map((l) => l.ingredient_id)),
    pull('packaging', lines.map((l) => l.packaging_id)),
  ])
  return out
}
function lineLabel(l: LineLike, names: Map<string, string>): string {
  const id = l.product_id ?? l.ingredient_id ?? l.packaging_id
  return (id && names.get(id)) || txt(l.description) || 'line'
}

/** Build the display-string header map that two snapshots are diffed on. */
async function headerDisplay(supabase: SB, h: HeaderLike): Promise<Record<string, string | null>> {
  const isTransfer = h.po_type === 'transfer'
  const names = await siteNames(supabase, [h.supplier_id, h.destination_supplier_id])
  const d: Record<string, string | null> = {
    'PO number': txt(h.po_number),
    [isTransfer ? 'From site' : 'Supplier']: h.supplier_id ? names.get(h.supplier_id) ?? null : null,
    'Order date': fmtDate(h.order_date),
    'Expected delivery': fmtDate(h.expected_delivery_date),
    'Transport': txt(h.transport_provider),
    'Currency': txt(h.currency),
    'Market': txt(h.market),
    'Delivery notes': txt(h.delivery_notes),
    'Notes': txt(h.notes),
    'External notes': txt(h.external_notes),
  }
  if (isTransfer) {
    d['To site'] = h.destination_supplier_id ? names.get(h.destination_supplier_id) ?? null : null
    d['Pickup date'] = fmtDate(h.pickup_date)
    d['Moves build'] = h.stock_move === 'NZ_TO_AU' ? 'NZ → AU' : h.stock_move === 'AU_TO_NZ' ? 'AU → NZ' : null
  }
  return d
}

/** Snapshot a PO (header + lines) BEFORE an edit, for diffing afterwards. */
export async function snapshotPoForLog(supabase: SB, id: string): Promise<PoSnapshot | null> {
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('po_type, po_number, supplier_id, destination_supplier_id, order_date, expected_delivery_date, pickup_date, stock_move, transport_provider, currency, market, delivery_notes, notes, external_notes')
    .eq('id', id).maybeSingle() as { data: HeaderLike | null }
  if (!po) return null
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('id, product_id, ingredient_id, packaging_id, description, quantity_ordered, unit_cost')
    .eq('purchase_order_id', id) as { data: LineLike[] | null }
  const rows = lines ?? []
  const names = await itemNames(supabase, rows)
  const header = await headerDisplay(supabase, po)
  const map = new Map<string, { label: string; qty: number; price: number | null }>()
  for (const l of rows) {
    if (!l.id) continue
    map.set(l.id, { label: lineLabel(l, names), qty: Number(l.quantity_ordered) || 0, price: l.unit_cost != null ? Number(l.unit_cost) : null })
  }
  return { header, lines: map }
}

type LogRow = { field: string | null; old_value: string | null; new_value: string | null }

/** Diff a before-snapshot against the submitted edit and write one log row per change. */
export async function logPoAmendment(
  supabase: SB,
  opts: { poId: string; poNumber: string; changedBy: string | null; before: PoSnapshot; afterHeader: HeaderLike; afterLines: LineLike[] },
): Promise<void> {
  try {
    const rows: LogRow[] = []

    // Header: compare the two display maps key by key.
    const after = await headerDisplay(supabase, opts.afterHeader)
    for (const key of Object.keys({ ...opts.before.header, ...after })) {
      const o = opts.before.header[key] ?? null
      const n = after[key] ?? null
      if (o !== n) rows.push({ field: key, old_value: o, new_value: n })
    }

    // Lines: match by id — removed / added / qty / price.
    const names = await itemNames(supabase, opts.afterLines)
    const afterById = new Map<string, LineLike>()
    for (const l of opts.afterLines) {
      if (l.id && opts.before.lines.has(l.id)) {
        afterById.set(l.id, l)
        const b = opts.before.lines.get(l.id)!
        const nq = Number(l.quantity_ordered) || 0
        if (b.qty !== nq) rows.push({ field: `Quantity · ${b.label}`, old_value: qtyStr(b.qty), new_value: qtyStr(nq) })
        const np = l.unit_cost != null ? Number(l.unit_cost) : null
        if ((b.price ?? null) !== (np ?? null)) rows.push({ field: `Unit cost · ${b.label}`, old_value: money(b.price), new_value: money(np) })
      } else {
        rows.push({ field: `Added line · ${lineLabel(l, names)}`, old_value: null, new_value: `qty ${qtyStr(Number(l.quantity_ordered) || 0)}` })
      }
    }
    for (const [id, b] of Array.from(opts.before.lines.entries())) {
      if (!afterById.has(id)) rows.push({ field: `Removed line · ${b.label}`, old_value: `qty ${qtyStr(b.qty)}`, new_value: null })
    }

    if (!rows.length) return
    await supabase.from('po_change_log').insert(
      rows.map((r) => ({
        purchase_order_id: opts.poId, po_number: opts.poNumber, action: 'amended',
        field: r.field, old_value: r.old_value, new_value: r.new_value, changed_by: opts.changedBy,
      })) as never,
    )
  } catch { /* logging is best-effort — never block the edit */ }
}

/** Log a single event (created / status change / deleted). */
export async function logPoEvent(
  supabase: SB,
  opts: { poId: string | null; poNumber: string; changedBy: string | null; action: 'created' | 'status' | 'deleted'; field?: string | null; oldValue?: string | null; newValue?: string | null },
): Promise<void> {
  try {
    await supabase.from('po_change_log').insert({
      purchase_order_id: opts.poId, po_number: opts.poNumber, action: opts.action,
      field: opts.field ?? null, old_value: opts.oldValue ?? null, new_value: opts.newValue ?? null, changed_by: opts.changedBy,
    } as never)
  } catch { /* best-effort */ }
}

/** Read the change history for a PO, newest first, with the editor's name. */
export async function loadPoChangeLog(supabase: SB, poId: string): Promise<PoLogEntry[]> {
  try {
    const { data } = await supabase
      .from('po_change_log')
      .select('id, action, field, old_value, new_value, changed_at, changed_by')
      .eq('purchase_order_id', poId)
      .order('changed_at', { ascending: false }) as {
        data: Array<{ id: string; action: PoLogEntry['action']; field: string | null; old_value: string | null; new_value: string | null; changed_at: string; changed_by: string | null }> | null }
    const rows = data ?? []
    const ids = Array.from(new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x)))
    const nameById = new Map<string, string>()
    if (ids.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id, full_name').in('id', ids) as { data: Array<{ id: string; full_name: string | null }> | null }
      for (const p of profs ?? []) nameById.set(p.id, p.full_name ?? '')
    }
    return rows.map((r) => ({
      id: r.id, action: r.action, field: r.field, old_value: r.old_value, new_value: r.new_value,
      changed_by_name: r.changed_by ? (nameById.get(r.changed_by) || null) : null, changed_at: r.changed_at,
    }))
  } catch { return [] }
}
