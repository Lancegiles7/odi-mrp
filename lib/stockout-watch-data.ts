/**
 * Stockout Watch — month-to-date sellout risk per finished-goods SKU.
 *
 * On-hand is built ON TOP of the stock ledger so it ties to the Stock Movements
 * Summary: baseline = the ledger's end-of-last-closed-month stock, then add this
 * month's receipts to date and subtract month-to-date sales (interim_sales, the
 * provisional Shopify + Upstock figures). Run-rate = MTD sales ÷ days elapsed.
 * Incoming = open (non-closed) finished-goods PO lines on their expected date.
 *
 * NZ only for v1 (Shopify + Upstock feed NZ); the shape carries `market` so AU
 * can be added once AU MTD sales are wired in.
 */
import { createClient } from '@/lib/supabase/server'
import { loadStockLedger } from '@/lib/stock-movements-data'

export interface StockoutIncoming { units: number; date: string | null; po: string }
export interface StockoutRow {
  product_id: string
  sku: string
  name: string
  group: string | null
  market: 'NZ'
  onHand: number
  soldMtd: number
  daysElapsed: number
  incoming: StockoutIncoming[]
}
export interface StockoutData {
  rows: StockoutRow[]
  periodStart: string | null   // e.g. '2026-10-01'
  asOf: string | null          // e.g. '2026-10-21'
  hasInterim: boolean          // false when no MTD sales have been loaded yet
}

const NZ_CHANNELS = new Set(['nz_d2c', 'nz_retail', 'nz_samples'])
const norm = (d: string) => d.slice(0, 7) + '-01'

export async function loadStockoutWatch(): Promise<StockoutData> {
  const supabase = createClient()

  // 1. Latest interim-sales snapshot (the MTD figures to run-rate).
  const { data: interimAll } = await supabase
    .from('interim_sales')
    .select('product_id, channel, units, period_start, as_of_date')
    .order('as_of_date', { ascending: false }) as {
      data: Array<{ product_id: string; channel: string; units: number; period_start: string; as_of_date: string }> | null }

  const periodStart = interimAll?.[0]?.period_start ?? null
  const asOf = interimAll?.[0]?.as_of_date ?? null
  const interim = (interimAll ?? []).filter((r) => r.period_start === periodStart && r.as_of_date === asOf)

  // 2. Ledger — authoritative end-of-last-closed-month stock per SKU.
  const ledger = await loadStockLedger()
  const closed = ledger.actualThrough   // last month with final actuals
  const eomByProduct = new Map<string, number>()
  for (const r of ledger.rows) {
    if (r.market !== 'NZ') continue
    const eom = closed ? (r.actual[closed]?.eom ?? r.opening) : r.opening
    eomByProduct.set(r.product_id, eom)
  }
  const skuName = new Map(ledger.rows.filter((r) => r.market === 'NZ').map((r) => [r.product_id, { sku: r.sku, name: r.name, group: r.group }]))

  if (!periodStart || !asOf) {
    return { rows: [], periodStart: null, asOf: null, hasInterim: false }
  }

  // 3. MTD sales + days elapsed.
  const soldByProduct = new Map<string, number>()
  for (const r of interim) {
    if (!NZ_CHANNELS.has(r.channel)) continue
    soldByProduct.set(r.product_id, (soldByProduct.get(r.product_id) ?? 0) + Number(r.units))
  }
  const start = new Date(periodStart + 'T00:00:00')
  const asOfD = new Date(asOf + 'T00:00:00')
  const daysElapsed = Math.max(1, Math.round((asOfD.getTime() - start.getTime()) / 86_400_000) + 1)

  // 4. This month's receipts to date (not yet in the closed-month EOM).
  const productIds = Array.from(new Set(Array.from(soldByProduct.keys()).concat(Array.from(eomByProduct.keys()))))
  const { data: receipts } = await supabase
    .from('finished_goods_receipts')
    .select('product_id, received_month, received_date, units, market')
    .in('product_id', productIds) as {
      data: Array<{ product_id: string; received_month: string; received_date: string | null; units: number; market: string | null }> | null }
  const recvByProduct = new Map<string, number>()
  for (const r of receipts ?? []) {
    if ((r.market ?? 'NZ').toUpperCase() === 'AU') continue
    if (norm(r.received_month) < periodStart) continue           // already in the closed EOM
    if (r.received_date && r.received_date > asOf) continue        // future-dated — not yet in
    recvByProduct.set(r.product_id, (recvByProduct.get(r.product_id) ?? 0) + Number(r.units))
  }

  // 4b. This month's expo (POS-event) sales — also deplete on-hand. Kept out of
  // the run-rate (expo is a one-off spike, not ongoing demand). Closed-month
  // expo is already in the ledger EOM baseline; this covers the current month.
  const { data: expoRows } = await supabase
    .from('expo_sales')
    .select('product_id, units, market, year_month')
    .eq('year_month', periodStart) as { data: Array<{ product_id: string; units: number; market: string; year_month: string }> | null }
  const expoByProduct = new Map<string, number>()
  for (const e of expoRows ?? []) {
    if ((e.market ?? 'NZ').toUpperCase() === 'AU') continue
    expoByProduct.set(e.product_id, (expoByProduct.get(e.product_id) ?? 0) + Number(e.units))
  }

  // 5. Incoming open PO lines (NZ, not short-closed).
  const { data: poLines } = await supabase
    .from('purchase_order_lines')
    .select('purchase_order_id, product_id, quantity_ordered, quantity_received, short_closed')
    .in('product_id', productIds) as {
      data: Array<{ purchase_order_id: string; product_id: string; quantity_ordered: number; quantity_received: number; short_closed: boolean | null }> | null }
  const poIds = Array.from(new Set((poLines ?? []).map((l) => l.purchase_order_id)))
  const { data: pos } = poIds.length
    ? await supabase.from('purchase_orders')
        .select('id, po_number, status, expected_delivery_date, market, po_type')
        .in('id', poIds) as { data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null; po_type: string | null }> | null }
    : { data: [] as Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null; po_type: string | null }> }
  const poById = new Map((pos ?? []).map((p) => [p.id, p]))
  const incomingByProduct = new Map<string, StockoutIncoming[]>()
  for (const l of poLines ?? []) {
    const po = poById.get(l.purchase_order_id)
    if (!po) continue
    // NZ-destination only. Keep BOTH purchase POs and transfers: products made
    // offshore (e.g. noodles in AU) reach NZ via AU→NZ transfer, so an incoming
    // NZ-market transfer is real incoming NZ stock — excluding it hid it as
    // "nothing on order". The transfer's market is its destination market.
    if ((po.market ?? 'NZ').toUpperCase() === 'AU') continue
    if (!['submitted', 'partially_received'].includes(po.status)) continue
    if (l.short_closed) continue
    const remaining = Number(l.quantity_ordered) - Number(l.quantity_received)
    if (remaining <= 0) continue
    if (!incomingByProduct.has(l.product_id)) incomingByProduct.set(l.product_id, [])
    incomingByProduct.get(l.product_id)!.push({ units: remaining, date: po.expected_delivery_date, po: po.po_number })
  }

  // 6. Assemble — one row per product that sold this month.
  const rows: StockoutRow[] = []
  for (const pid of Array.from(soldByProduct.keys())) {
    const meta = skuName.get(pid)
    if (!meta) continue
    const onHand = (eomByProduct.get(pid) ?? 0) + (recvByProduct.get(pid) ?? 0) - (soldByProduct.get(pid) ?? 0) - (expoByProduct.get(pid) ?? 0)
    const incoming = (incomingByProduct.get(pid) ?? []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    rows.push({
      product_id: pid, sku: meta.sku, name: meta.name, group: meta.group, market: 'NZ',
      onHand: Math.round(onHand), soldMtd: Math.round(soldByProduct.get(pid) ?? 0), daysElapsed, incoming,
    })
  }
  // Soonest sellout first: lowest days-of-cover (onHand / daily) at the top.
  rows.sort((a, b) => {
    const ca = a.soldMtd > 0 ? a.onHand / (a.soldMtd / a.daysElapsed) : 9e9
    const cb = b.soldMtd > 0 ? b.onHand / (b.soldMtd / b.daysElapsed) : 9e9
    return ca - cb
  })

  return { rows, periodStart, asOf, hasInterim: true }
}
