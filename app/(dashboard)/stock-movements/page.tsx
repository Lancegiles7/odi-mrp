import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { buildStockLedger, type ReceiptDetail } from '@/lib/stock-movements'
import { StockMovementsTable } from '@/components/stock-movements/stock-movements-table'
import { InwardsUpload } from '@/components/stock-movements/inwards-upload'

export const metadata: Metadata = { title: 'Stock Movements' }

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

  const [
    { data: products }, { data: receipts }, { data: actuals },
    { data: writeoffs }, { data: production }, demand,
  ] = await Promise.all([
    supabase.from('products')
      .select('id, sku_code, name, product_type')
      .is('deleted_at', null).eq('is_active', true).order('sku_code') as { data: Array<{ id: string; sku_code: string; name: string; product_type: string | null }> | null },
    supabase.from('finished_goods_receipts')
      .select('product_id, received_month, received_date, units, po_number, source, batch_ref') as { data: Array<{ product_id: string; received_month: string; received_date: string | null; units: number; po_number: string | null; source: string; batch_ref: string | null }> | null },
    supabase.from('product_actuals')
      .select('product_id, year_month, units') as { data: Array<{ product_id: string; year_month: string; units: number }> | null },
    supabase.from('product_writeoffs')
      .select('product_id, year_month, units') as { data: Array<{ product_id: string; year_month: string; units: number }> | null },
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned, market') as { data: Array<{ product_id: string; year_month: string; units_planned: number; market: string | null }> | null },
    fetchAllRows<{ product_id: string; year_month: string; units: number }>((from, to) =>
      supabase.from('demand_forecasts')
        .select('product_id, year_month, units')
        .order('product_id').order('year_month')
        .range(from, to) as unknown as PromiseLike<{ data: Array<{ product_id: string; year_month: string; units: number }> | null; error: { message: string } | null }>),
  ])

  // ── Per-product/per-month maps ──────────────────────────────
  const inbound: PM  = new Map()   // finished-goods receipts
  const outbound: PM = new Map()   // BvA actuals (all channels = sold + samples)
  const writeoff: PM = new Map()
  const planned: PM  = new Map()   // NZ production plan
  const demandM: PM  = new Map()   // demand forecast (total)

  // Per-product/per-month receipt breakdown (for the Inbound hover tooltip).
  const inboundReceipts = new Map<string, Map<string, ReceiptDetail[]>>()
  for (const r of receipts ?? []) {
    const month = norm(r.received_month)
    addTo(inbound, r.product_id, month, Number(r.units))
    if (!inboundReceipts.has(r.product_id)) inboundReceipts.set(r.product_id, new Map())
    const byMonth = inboundReceipts.get(r.product_id)!
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push({
      date: r.received_date ?? null, units: Number(r.units),
      po: r.po_number ?? null, source: r.source, batch: r.batch_ref ?? null,
    })
  }
  // Newest receipts first within each cell.
  for (const byMonth of Array.from(inboundReceipts.values()))
    for (const list of Array.from(byMonth.values()))
      list.sort((a: ReceiptDetail, b: ReceiptDetail) => (b.date ?? '').localeCompare(a.date ?? ''))
  for (const a of actuals ?? [])   addTo(outbound, a.product_id, norm(a.year_month),     Number(a.units))
  for (const w of writeoffs ?? []) addTo(writeoff, w.product_id, norm(w.year_month),     Number(w.units))
  for (const p of production ?? []) if ((p.market ?? 'NZ') !== 'AU') addTo(planned, p.product_id, norm(p.year_month), Number(p.units_planned))
  for (const d of demand ?? [])    addTo(demandM,  d.product_id, norm(d.year_month),     Number(d.units))

  // Forecast inbound = production plan, but real receipts already logged for a
  // month take precedence (so logged arrivals aren't lost before that month's
  // sales actuals are uploaded).
  const produced: PM = new Map()
  for (const [pid, mm] of Array.from(planned.entries())) { produced.set(pid, new Map(mm)) }
  for (const [pid, mm] of Array.from(inbound.entries())) {
    if (!produced.has(pid)) produced.set(pid, new Map())
    for (const [m, u] of Array.from(mm.entries())) produced.get(pid)!.set(m, u)
  }

  // ── Month range + actual/forecast split ─────────────────────
  const monthSet = new Set<string>()
  for (const map of [inbound, outbound, writeoff, planned, demandM]) {
    for (const [, mm] of Array.from(map.entries())) for (const k of Array.from(mm.keys())) monthSet.add(k)
  }
  const sorted = Array.from(monthSet).sort()
  const months: string[] = []
  if (sorted.length) {
    let cur = sorted[0]
    const end = sorted[sorted.length - 1]
    while (cur <= end) { months.push(cur); cur = nextMonth(cur) }
  }

  // Latest month that has uploaded sales actuals → boundary. Fall back to the
  // latest receipt month if no actuals yet.
  const maxOf = (map: PM): string | null => {
    let mx: string | null = null
    for (const [, mm] of Array.from(map.entries())) for (const k of Array.from(mm.keys())) if (!mx || k > mx) mx = k
    return mx
  }
  const actualThrough = maxOf(outbound) ?? maxOf(inbound)
  const actualMonths   = months.filter((m) => actualThrough != null && m <= actualThrough)
  const forecastMonths = months.filter((m) => actualThrough == null || m > actualThrough)

  const allRows = buildStockLedger({
    products: products ?? [], actualMonths, forecastMonths,
    inbound, outbound, writeoff, produced, demand: demandM, inboundReceipts,
  })
  const rows = allRows.filter((r) => r.hasActivity)

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
