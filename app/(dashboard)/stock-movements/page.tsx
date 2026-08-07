import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { buildStockLedger, type ReceiptDetail, type OpenPoDetail } from '@/lib/stock-movements'
import { StockMovementsTable } from '@/components/stock-movements/stock-movements-table'
import { InwardsUpload } from '@/components/stock-movements/inwards-upload'

export const metadata: Metadata = { title: 'Stock Movements' }
// Always render fresh — receipts / write-offs / actuals change often and a
// cached page makes saved data look like it "reverted".
export const dynamic = 'force-dynamic'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const norm = (d: unknown) => String(d).slice(0, 7) + '-01'
const monthLabel = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
function nextMonth(m: string): string {
  let y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) + 1
  if (mo > 12) { mo = 1; y++ }
  return `${y}-${String(mo).padStart(2, '0')}-01`
}

type PM = Map<string, Map<string, number>>
function addTo(map: PM, pid: string, month: string, units: number) {
  if (!Number.isFinite(units)) return
  if (!map.has(pid)) map.set(pid, new Map())
  const mm = map.get(pid)!
  mm.set(month, (mm.get(month) ?? 0) + units)
}

export default async function StockMovementsPage() {
  const supabase = createClient()

  const AU_START = '2026-09-01'   // AU demand begins Sept 2026

  const [
    { data: products }, { data: receipts }, { data: actuals },
    { data: writeoffs }, { data: production }, demand,
  ] = await Promise.all([
    supabase.from('products')
      .select('id, sku_code, name, product_type')
      .is('deleted_at', null).eq('is_active', true).order('sku_code') as { data: Array<{ id: string; sku_code: string; name: string; product_type: string | null }> | null },
    supabase.from('finished_goods_receipts')
      .select('product_id, received_month, received_date, units, po_number, source, batch_ref, market') as { data: Array<{ product_id: string; received_month: string; received_date: string | null; units: number; po_number: string | null; source: string; batch_ref: string | null; market: string | null }> | null },
    supabase.from('product_actuals')
      .select('product_id, year_month, units, channel') as { data: Array<{ product_id: string; year_month: string; units: number; channel: string | null }> | null },
    supabase.from('product_writeoffs')
      .select('product_id, year_month, units, market') as { data: Array<{ product_id: string; year_month: string; units: number; market: string | null }> | null },
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned, market') as { data: Array<{ product_id: string; year_month: string; units_planned: number; market: string | null }> | null },
    fetchAllRows<{ product_id: string; year_month: string; units: number; channel: string | null }>((from, to) =>
      supabase.from('demand_forecasts')
        .select('product_id, year_month, units, channel')
        .order('product_id').order('year_month')
        .range(from, to) as unknown as PromiseLike<{ data: Array<{ product_id: string; year_month: string; units: number; channel: string | null }> | null; error: { message: string } | null }>),
  ])

  // AU channels differ by table: product_actuals uses the `au_*` prefix
  // (au_retail, au_d2c, au_samples); demand_forecasts uses the `*_au` suffix
  // (retail_au, ecomm_au). Match either. Everything else (incl. pipefill) = NZ.
  const chanIsAu = (c: string | null) => { const s = (c ?? '').toLowerCase(); return s.startsWith('au_') || s.endsWith('_au') }
  const mktIsAu  = (m: string | null) => (m ?? 'NZ').toUpperCase() === 'AU'

  // ── Per-country / per-product / per-month maps ──────────────
  const inboundNz: PM = new Map(),  inboundAu: PM = new Map()
  const outboundNz: PM = new Map(), outboundAu: PM = new Map()
  const writeoffNz: PM = new Map(), writeoffAu: PM = new Map()
  const plannedNz: PM = new Map(),  plannedAu: PM = new Map()
  const demandNz: PM = new Map(),   demandAu: PM = new Map()
  const receiptsNz = new Map<string, Map<string, ReceiptDetail[]>>()
  const receiptsAu = new Map<string, Map<string, ReceiptDetail[]>>()

  for (const r of receipts ?? []) {
    const au = mktIsAu(r.market)
    const month = norm(r.received_month)
    addTo(au ? inboundAu : inboundNz, r.product_id, month, Number(r.units))
    const detail = au ? receiptsAu : receiptsNz
    if (!detail.has(r.product_id)) detail.set(r.product_id, new Map())
    const byMonth = detail.get(r.product_id)!
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push({ date: r.received_date ?? null, units: Number(r.units), po: r.po_number ?? null, source: r.source, batch: r.batch_ref ?? null })
  }
  for (const detail of [receiptsNz, receiptsAu])
    for (const byMonth of Array.from(detail.values()))
      for (const list of Array.from(byMonth.values()))
        list.sort((a: ReceiptDetail, b: ReceiptDetail) => (b.date ?? '').localeCompare(a.date ?? ''))

  for (const a of actuals ?? [])   addTo(chanIsAu(a.channel) ? outboundAu : outboundNz, a.product_id, norm(a.year_month), Number(a.units))
  for (const w of writeoffs ?? []) addTo(mktIsAu(w.market)   ? writeoffAu : writeoffNz, w.product_id, norm(w.year_month), Number(w.units))
  for (const p of production ?? []) addTo(mktIsAu(p.market)  ? plannedAu  : plannedNz,  p.product_id, norm(p.year_month), Number(p.units_planned))
  for (const d of demand ?? [])    addTo(chanIsAu(d.channel) ? demandAu   : demandNz,   d.product_id, norm(d.year_month), Number(d.units))

  // Forecast produced = production plan, with any real receipts logged for a
  // month taking precedence (per country).
  const mergeProduced = (planned: PM, inbound: PM): PM => {
    const out: PM = new Map()
    for (const [pid, mm] of Array.from(planned.entries())) out.set(pid, new Map(mm))
    for (const [pid, mm] of Array.from(inbound.entries())) {
      if (!out.has(pid)) out.set(pid, new Map())
      for (const [m, u] of Array.from(mm.entries())) out.get(pid)!.set(m, u)
    }
    return out
  }
  const producedNz = mergeProduced(plannedNz, inboundNz)
  // AU production is only what's actually planned/received — no make-to-demand
  // default. Unplanned months show blank production and the EOM draws down.
  const producedAu = mergeProduced(plannedAu, inboundAu)

  // ── Open POs still to receipt (chips), split NZ / AU by PO market ──
  const openPoNz = new Map<string, Map<string, OpenPoDetail[]>>()
  const openPoAu = new Map<string, Map<string, OpenPoDetail[]>>()
  const { data: openPos } = await supabase.from('purchase_orders')
    .select('id, po_number, expected_delivery_date, market, suppliers(name)')
    .in('status', ['submitted', 'partially_received']) as {
      data: Array<{ id: string; po_number: string; expected_delivery_date: string | null; market: string | null; suppliers: { name: string } | null }> | null }
  if ((openPos ?? []).length) {
    const poById = new Map((openPos ?? []).map((p) => [p.id, p]))
    const { data: openLines } = await supabase.from('purchase_order_lines')
      .select('purchase_order_id, product_id, quantity_ordered, quantity_received')
      .in('purchase_order_id', (openPos ?? []).map((p) => p.id))
      .not('product_id', 'is', null) as {
        data: Array<{ purchase_order_id: string; product_id: string; quantity_ordered: number; quantity_received: number }> | null }
    for (const l of openLines ?? []) {
      const remaining = Number(l.quantity_ordered) - Number(l.quantity_received)
      if (remaining <= 0) continue
      const po = poById.get(l.purchase_order_id)
      if (!po?.expected_delivery_date) continue
      const month = norm(po.expected_delivery_date)
      const target = mktIsAu(po.market) ? openPoAu : openPoNz
      if (!target.has(l.product_id)) target.set(l.product_id, new Map())
      const bm = target.get(l.product_id)!
      if (!bm.has(month)) bm.set(month, [])
      bm.get(month)!.push({ po: po.po_number, supplier: po.suppliers?.name ?? null, remaining, expected: po.expected_delivery_date, partial: Number(l.quantity_received) > 0 })
    }
  }

  // ── Month range + actual/forecast split ─────────────────────
  const monthSet = new Set<string>()
  for (const map of [inboundNz, inboundAu, outboundNz, outboundAu, writeoffNz, writeoffAu, plannedNz, plannedAu, demandNz, demandAu]) {
    for (const [, mm] of Array.from(map.entries())) for (const k of Array.from(mm.keys())) monthSet.add(k)
  }
  for (const src of [openPoNz, openPoAu])
    for (const bm of Array.from(src.values())) for (const k of Array.from(bm.keys())) monthSet.add(k)
  const sorted = Array.from(monthSet).sort()
  const months: string[] = []
  if (sorted.length) {
    let cur = sorted[0]
    const end = sorted[sorted.length - 1]
    while (cur <= end) { months.push(cur); cur = nextMonth(cur) }
  }

  const maxOf = (...maps: PM[]): string | null => {
    let mx: string | null = null
    for (const map of maps) for (const [, mm] of Array.from(map.entries())) for (const k of Array.from(mm.keys())) if (!mx || k > mx) mx = k
    return mx
  }
  const actualThrough = maxOf(outboundNz, outboundAu) ?? maxOf(inboundNz, inboundAu)
  const actualMonths   = months.filter((m) => actualThrough != null && m <= actualThrough)
  const forecastMonths = months.filter((m) => actualThrough == null || m > actualThrough)

  const rows = buildStockLedger({
    products: products ?? [], actualMonths, forecastMonths, auStartMonth: AU_START,
    nz: { inbound: inboundNz, outbound: outboundNz, writeoff: writeoffNz, produced: producedNz, demand: demandNz, inboundReceipts: receiptsNz, openPo: openPoNz },
    au: { inbound: inboundAu, outbound: outboundAu, writeoff: writeoffAu, produced: producedAu, demand: demandAu, inboundReceipts: receiptsAu, openPo: openPoAu },
  })

  const lastActualLabel = actualThrough ? monthLabel(actualThrough) : null

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Stock Movements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Finished-goods running stocktake · Inbound − sold/samples − write-offs = predicted EOM
            {lastActualLabel && <> · actuals through <span className="font-semibold text-gray-800">{lastActualLabel}</span>, forecast thereafter</>}
          </p>
        </div>
        <InwardsUpload />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No stock movements yet. Use <strong>Upload inwards</strong> to load the Inwards Finished Goods sheet, then arrivals,
          sales (from Budget vs Actual) and write-offs will roll into a running stocktake here.
        </div>
      ) : (
        <StockMovementsTable rows={rows} actualMonths={actualMonths} forecastMonths={forecastMonths} label={monthLabel} />
      )}
    </div>
  )
}
