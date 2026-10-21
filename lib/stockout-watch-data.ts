/**
 * Stockout Watch — month-to-date sellout risk per finished-goods SKU, per market.
 *
 * On-hand is built ON TOP of the stock ledger so it ties to the Stock Movements
 * Summary: baseline = the ledger's end-of-last-closed-month stock (per market),
 * then add this month's receipts to date and subtract month-to-date sales
 * (interim_sales) + current-month expo. Run-rate = MTD sales ÷ days elapsed.
 * Incoming = open (non-closed) PO lines whose market = that destination.
 *
 * Both NZ and AU: NZ stock vs NZ demand, AU stock vs AU demand (stock is held
 * per market, so sellout is per market — a product can be short in one and fine
 * in the other).
 */
import { createClient } from '@/lib/supabase/server'
import { loadStockLedger } from '@/lib/stock-movements-data'

export type Market = 'NZ' | 'AU'
export interface StockoutIncoming { units: number; date: string | null; po: string }
export interface StockoutRow {
  product_id: string
  sku: string
  name: string
  group: string | null
  market: Market
  onHand: number
  soldMtd: number
  daysElapsed: number
  incoming: StockoutIncoming[]
}
export interface StockoutData {
  rows: StockoutRow[]
  periodStart: string | null
  asOf: string | null
  hasInterim: boolean
}

const CHANNELS: Record<Market, Set<string>> = {
  NZ: new Set(['nz_d2c', 'nz_retail', 'nz_samples']),
  AU: new Set(['au_d2c', 'au_retail', 'au_samples']),
}
const norm = (d: string) => d.slice(0, 7) + '-01'
const mkt = (m: string | null): Market => ((m ?? 'NZ').toUpperCase() === 'AU' ? 'AU' : 'NZ')

export async function loadStockoutWatch(): Promise<StockoutData> {
  const supabase = createClient()

  // Latest interim-sales snapshot (the MTD figures to run-rate).
  const { data: interimAll } = await supabase
    .from('interim_sales')
    .select('product_id, channel, units, period_start, as_of_date')
    .order('as_of_date', { ascending: false }) as {
      data: Array<{ product_id: string; channel: string; units: number; period_start: string; as_of_date: string }> | null }
  const periodStart = interimAll?.[0]?.period_start ?? null
  const asOf = interimAll?.[0]?.as_of_date ?? null
  if (!periodStart || !asOf) return { rows: [], periodStart: null, asOf: null, hasInterim: false }
  const interim = (interimAll ?? []).filter((r) => r.period_start === periodStart && r.as_of_date === asOf)

  const start = new Date(periodStart + 'T00:00:00')
  const asOfD = new Date(asOf + 'T00:00:00')
  const daysElapsed = Math.max(1, Math.round((asOfD.getTime() - start.getTime()) / 86_400_000) + 1)

  // Ledger — authoritative end-of-last-closed-month stock per SKU per market.
  const ledger = await loadStockLedger()
  const closed = ledger.actualThrough
  const eom: Record<Market, Map<string, number>> = { NZ: new Map(), AU: new Map() }
  const meta: Record<Market, Map<string, { sku: string; name: string; group: string | null }>> = { NZ: new Map(), AU: new Map() }
  for (const r of ledger.rows) {
    const m = r.market as Market
    eom[m].set(r.product_id, closed ? (r.actual[closed]?.eom ?? r.opening) : r.opening)
    meta[m].set(r.product_id, { sku: r.sku, name: r.name, group: r.group })
  }

  const productIds = Array.from(new Set(
    (interim.map((r) => r.product_id)).concat(ledger.rows.map((r) => r.product_id)),
  ))

  // This month's receipts to date (not yet in the closed-month EOM).
  const { data: receipts } = await supabase
    .from('finished_goods_receipts')
    .select('product_id, received_month, received_date, units, market')
    .in('product_id', productIds) as {
      data: Array<{ product_id: string; received_month: string; received_date: string | null; units: number; market: string | null }> | null }

  // Current-month expo (POS-event) sales — deplete on-hand, kept out of run-rate.
  const { data: expoRows } = await supabase
    .from('expo_sales')
    .select('product_id, units, market, year_month')
    .eq('year_month', periodStart) as { data: Array<{ product_id: string; units: number; market: string; year_month: string }> | null }

  // Open PO lines — incoming per destination market.
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

  const rows: StockoutRow[] = []
  for (const market of ['NZ', 'AU'] as Market[]) {
    // MTD sales for this market.
    const sold = new Map<string, number>()
    for (const r of interim) {
      if (!CHANNELS[market].has(r.channel)) continue
      sold.set(r.product_id, (sold.get(r.product_id) ?? 0) + Number(r.units))
    }
    // Receipts this month, this market.
    const recv = new Map<string, number>()
    for (const r of receipts ?? []) {
      if (mkt(r.market) !== market) continue
      if (norm(r.received_month) < periodStart) continue
      if (r.received_date && r.received_date > asOf) continue
      recv.set(r.product_id, (recv.get(r.product_id) ?? 0) + Number(r.units))
    }
    // Expo this month, this market.
    const expo = new Map<string, number>()
    for (const e of expoRows ?? []) {
      if (mkt(e.market) !== market) continue
      expo.set(e.product_id, (expo.get(e.product_id) ?? 0) + Number(e.units))
    }
    // Incoming open PO lines whose destination market = this market.
    const incoming = new Map<string, StockoutIncoming[]>()
    for (const l of poLines ?? []) {
      const po = poById.get(l.purchase_order_id)
      if (!po || mkt(po.market) !== market) continue
      if (!['submitted', 'partially_received'].includes(po.status)) continue
      if (l.short_closed) continue
      const remaining = Number(l.quantity_ordered) - Number(l.quantity_received)
      if (remaining <= 0) continue
      if (!incoming.has(l.product_id)) incoming.set(l.product_id, [])
      incoming.get(l.product_id)!.push({ units: remaining, date: po.expected_delivery_date, po: po.po_number })
    }

    for (const pid of Array.from(sold.keys())) {
      const m = meta[market].get(pid)
      if (!m) continue
      const onHand = (eom[market].get(pid) ?? 0) + (recv.get(pid) ?? 0) - (sold.get(pid) ?? 0) - (expo.get(pid) ?? 0)
      const inc = (incoming.get(pid) ?? []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      rows.push({
        product_id: pid, sku: m.sku, name: m.name, group: m.group, market,
        onHand: Math.round(onHand), soldMtd: Math.round(sold.get(pid) ?? 0), daysElapsed, incoming: inc,
      })
    }
  }

  // Soonest sellout first (across both markets).
  rows.sort((a, b) => {
    const ca = a.soldMtd > 0 ? a.onHand / (a.soldMtd / a.daysElapsed) : 9e9
    const cb = b.soldMtd > 0 ? b.onHand / (b.soldMtd / b.daysElapsed) : 9e9
    return ca - cb
  })

  return { rows, periodStart, asOf, hasInterim: true }
}
