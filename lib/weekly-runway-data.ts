/**
 * Weekly stock runway — forward projection of closing stock per week, per SKU,
 * per market, so you can see how many weeks until a product runs out.
 *
 * Built on the same baseline as Stockout Watch (ties to the Summary):
 *   opening ("on hand now") = ledger end-of-last-closed-month stock
 *       + this month's receipts to date − month-to-date sales (interim + expo)
 *
 * Then projected forward ~13 weeks:
 *   • Current month demand  = max(run-rate, forecast), spread over its days.
 *   • Future month demand   = that month's forecast, spread over its days.
 *   • Incoming stock lands on its PO's expected week; a planned build with no PO
 *     defaults to the last week of its month.
 *   • Each week: closing = opening − demand + incoming; first week ≤ 0 = runs out.
 *
 * Locked months are never shown — the grid always expands from the current month.
 */
import { createClient } from '@/lib/supabase/server'
import { loadStockLedger } from '@/lib/stock-movements-data'

export type Market = 'NZ' | 'AU'
const HORIZON_WEEKS = 13

/** What an incoming is: a genuinely-received receipt, a no-PO production build,
 *  or an open (not-yet-received) purchase PO / transfer. The "Confirmed" view
 *  counts only receipt + planned; the "With open orders" view counts them all. */
export type IncomingSource = 'receipt' | 'planned' | 'open_po' | 'open_transfer'
export interface RunwayIncoming { units: number; po: string | null; date: string | null; source: IncomingSource }
export interface RunwayCell { demand: number; detail: RunwayIncoming[] }
export interface WeekCol { start: string; end: string; label: string; endLabel: string; month: string; monthLabel: string; current: boolean }
export interface RunwayRow {
  product_id: string
  sku: string
  name: string
  group: string | null
  market: Market
  onHand: number
  weeks: RunwayCell[]        // per-week demand + incoming detail; balances computed per view
  avgWeekly: number          // avg weekly demand over the horizon (for amber threshold)
}
export interface WeeklyRunwayData {
  weeks: WeekCol[]
  rows: RunwayRow[]
  asOf: string | null
  horizonWeeks: number
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mkt = (m: string | null): Market => ((m ?? 'NZ').toUpperCase() === 'AU' ? 'AU' : 'NZ')
const chanIsAu = (c: string | null) => { const s = (c ?? '').toLowerCase(); return s.startsWith('au_') || s.endsWith('_au') }
const CHANNELS: Record<Market, Set<string>> = {
  NZ: new Set(['nz_d2c', 'nz_retail', 'nz_samples']),
  AU: new Set(['au_d2c', 'au_retail', 'au_samples']),
}
const norm = (d: string) => d.slice(0, 7) + '-01'
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const daysInMonthOf = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }
const monthLabelOf = (ym: string) => `${MON3[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
/** Monday (UTC) of the week containing d. */
function mondayOf(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7   // 0 = Monday
  return addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), -day)
}

export async function loadWeeklyRunway(): Promise<WeeklyRunwayData> {
  const supabase = createClient()

  // ── Current open month + MTD (interim snapshot) ──
  const { data: interimAll } = await supabase
    .from('interim_sales')
    .select('product_id, channel, units, period_start, as_of_date')
    .order('as_of_date', { ascending: false }) as {
      data: Array<{ product_id: string; channel: string; units: number; period_start: string; as_of_date: string }> | null }
  const periodStart = interimAll?.[0]?.period_start ?? null
  const asOf = interimAll?.[0]?.as_of_date ?? null
  const interim = periodStart && asOf ? (interimAll ?? []).filter((r) => r.period_start === periodStart && r.as_of_date === asOf) : []

  // Reference "today" = the interim as-of date, else now. Projection starts the next day.
  const refDate = asOf ? new Date(asOf + 'T00:00:00Z') : new Date(ymd(new Date()) + 'T00:00:00Z')
  const curMonth = periodStart ? periodStart.slice(0, 7) : monthKey(refDate)
  const daysInCur = daysInMonthOf(curMonth)
  const startD = periodStart ? new Date(periodStart + 'T00:00:00Z') : new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1))
  const daysElapsed = Math.max(1, Math.round((refDate.getTime() - startD.getTime()) / 86_400_000) + 1)

  // ── Ledger baseline (end-of-last-closed-month EOM + meta) ──
  const ledger = await loadStockLedger()
  const closed = ledger.actualThrough
  const eom: Record<Market, Map<string, number>> = { NZ: new Map(), AU: new Map() }
  const meta = new Map<string, { sku: string; name: string; group: string | null }>()
  for (const r of ledger.rows) {
    const m = r.market as Market
    eom[m].set(r.product_id, closed ? (r.actual[closed]?.eom ?? r.opening) : r.opening)
    meta.set(r.product_id, { sku: r.sku, name: r.name, group: r.group })
  }
  const productIds = ledger.rows.map((r) => r.product_id)

  // ── Supporting data: receipts, expo, open POs, forecast, production ──
  const [{ data: receipts }, { data: expoRows }, { data: poLines }, { data: demand }, { data: production }] = await Promise.all([
    supabase.from('finished_goods_receipts').select('product_id, received_month, received_date, units, market').in('product_id', productIds) as unknown as
      Promise<{ data: Array<{ product_id: string; received_month: string; received_date: string | null; units: number; market: string | null }> | null }>,
    supabase.from('expo_sales').select('product_id, units, market, year_month').eq('year_month', periodStart ?? '1900-01-01') as unknown as
      Promise<{ data: Array<{ product_id: string; units: number; market: string; year_month: string }> | null }>,
    supabase.from('purchase_order_lines').select('purchase_order_id, product_id, quantity_ordered, quantity_received, short_closed').in('product_id', productIds) as unknown as
      Promise<{ data: Array<{ purchase_order_id: string; product_id: string; quantity_ordered: number; quantity_received: number; short_closed: boolean | null }> | null }>,
    supabase.from('demand_forecasts').select('product_id, year_month, units, channel').in('product_id', productIds) as unknown as
      Promise<{ data: Array<{ product_id: string; year_month: string; units: number; channel: string | null }> | null }>,
    supabase.from('production_plans').select('product_id, year_month, units_planned, market').in('product_id', productIds) as unknown as
      Promise<{ data: Array<{ product_id: string; year_month: string; units_planned: number; market: string | null }> | null }>,
  ])

  const poIds = Array.from(new Set((poLines ?? []).map((l) => l.purchase_order_id)))
  const { data: pos } = poIds.length
    ? await supabase.from('purchase_orders').select('id, po_number, status, expected_delivery_date, market, po_type').in('id', poIds) as
        { data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null; po_type: string | null }> | null }
    : { data: [] as Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null; po_type: string | null }> }
  const poById = new Map((pos ?? []).map((p) => [p.id, p]))

  // ── Week columns (Mon–Sun), starting this week, HORIZON_WEEKS forward ──
  const week0 = mondayOf(refDate)
  const weeks: WeekCol[] = []
  for (let i = 0; i < HORIZON_WEEKS; i++) {
    const s = addDays(week0, i * 7), e = addDays(s, 6)
    const m = monthKey(s)
    weeks.push({
      start: ymd(s), end: ymd(e),
      label: `${s.getUTCDate()} ${MON3[s.getUTCMonth()]}`,
      endLabel: `${e.getUTCDate()} ${MON3[e.getUTCMonth()]}`,
      month: m, monthLabel: monthLabelOf(m), current: i === 0,
    })
  }
  const horizonEnd = addDays(week0, HORIZON_WEEKS * 7 - 1)
  const weekIndexOf = (iso: string | null): number => {
    if (!iso) return -1
    const d = new Date(iso + 'T00:00:00Z')
    if (d < week0) return 0                 // overdue / already-expected → first week
    if (d > horizonEnd) return -1           // beyond horizon
    return Math.floor((d.getTime() - week0.getTime()) / (7 * 86_400_000))
  }
  // Last week index whose span contains the last day of month `ym` (clamped to horizon).
  const lastWeekOfMonth = (ym: string): number => {
    const last = ymd(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)))
    return weekIndexOf(last)
  }

  // ── Per product/market monthly forecast + planned maps ──
  type MM = Map<string, Map<string, number>>  // key `${pid}|${market}` → ym → units
  const add = (map: MM, pid: string, market: Market, ym: string, u: number) => {
    const k = `${pid}|${market}`
    if (!map.has(k)) map.set(k, new Map())
    const mm = map.get(k)!; mm.set(ym, (mm.get(ym) ?? 0) + u)
  }
  const fc: MM = new Map(), plan: MM = new Map()
  for (const d of demand ?? []) add(fc, d.product_id, chanIsAu(d.channel) ? 'AU' : 'NZ', d.year_month.slice(0, 7), Number(d.units))
  for (const p of production ?? []) add(plan, p.product_id, mkt(p.market), p.year_month.slice(0, 7), Number(p.units_planned))
  const getM = (map: MM, pid: string, market: Market, ym: string) => map.get(`${pid}|${market}`)?.get(ym) ?? 0

  const rows: RunwayRow[] = []
  for (const market of ['NZ', 'AU'] as Market[]) {
    // MTD sold (incl. expo) per product, this market.
    const sold = new Map<string, number>()
    for (const r of interim) { if (!CHANNELS[market].has(r.channel)) continue; sold.set(r.product_id, (sold.get(r.product_id) ?? 0) + Number(r.units)) }
    for (const e of expoRows ?? []) { if (mkt(e.market) !== market) continue; sold.set(e.product_id, (sold.get(e.product_id) ?? 0) + Number(e.units)) }
    // Receipts this month to date (already-received → in on-hand).
    const recvToDate = new Map<string, number>()
    const futureReceipts = new Map<string, Array<{ units: number; date: string }>>()
    for (const r of receipts ?? []) {
      if (mkt(r.market) !== market) continue
      if (r.received_date && asOf && r.received_date > asOf) {        // future-dated receipt → incoming
        if (!futureReceipts.has(r.product_id)) futureReceipts.set(r.product_id, [])
        futureReceipts.get(r.product_id)!.push({ units: Number(r.units), date: r.received_date }); continue
      }
      if (periodStart && norm(r.received_month) < periodStart) continue  // already in closed EOM
      recvToDate.set(r.product_id, (recvToDate.get(r.product_id) ?? 0) + Number(r.units))
    }
    // Open PO lines, this destination market.
    const openPos = new Map<string, Array<{ units: number; date: string | null; po: string; month: string | null; transfer: boolean }>>()
    for (const l of poLines ?? []) {
      const po = poById.get(l.purchase_order_id)
      if (!po || mkt(po.market) !== market) continue
      if (!['submitted', 'partially_received'].includes(po.status)) continue
      if (l.short_closed) continue
      const remaining = Number(l.quantity_ordered) - Number(l.quantity_received)
      if (remaining <= 0) continue
      if (!openPos.has(l.product_id)) openPos.set(l.product_id, [])
      openPos.get(l.product_id)!.push({ units: remaining, date: po.expected_delivery_date, po: po.po_number, month: po.expected_delivery_date ? po.expected_delivery_date.slice(0, 7) : null, transfer: po.po_type === 'transfer' })
    }

    for (const r of ledger.rows) {
      if (r.market !== market) continue
      const pid = r.product_id
      const m = meta.get(pid)!
      const onHand = (eom[market].get(pid) ?? 0) + (recvToDate.get(pid) ?? 0) - (sold.get(pid) ?? 0)

      // Daily demand rate by month.
      const soldMtd = sold.get(pid) ?? 0
      const runRateMonth = (soldMtd / daysElapsed) * daysInCur
      const demandBasisCur = Math.max(runRateMonth, getM(fc, pid, market, curMonth))
      const remainingCur = Math.max(0, demandBasisCur - soldMtd)
      const daysRemainingCur = Math.max(0, daysInCur - daysElapsed)
      const dailyRateCur = daysRemainingCur > 0 ? remainingCur / daysRemainingCur : 0
      const dailyRate = (d: Date): number => {
        const ym = monthKey(d)
        if (ym === curMonth) return dailyRateCur
        return getM(fc, pid, market, ym) / daysInMonthOf(ym)
      }

      // Incoming per week, tagged by source (so each view can include or exclude it).
      const inc: RunwayIncoming[][] = weeks.map(() => [])
      const monthsWithPo = new Set<string>()
      for (const p of openPos.get(pid) ?? []) {
        const wi = weekIndexOf(p.date)
        if (p.month) monthsWithPo.add(p.month)
        if (wi >= 0) inc[wi].push({ units: p.units, po: p.po, date: p.date, source: p.transfer ? 'open_transfer' : 'open_po' })
      }
      for (const fr of futureReceipts.get(pid) ?? []) {
        const wi = weekIndexOf(fr.date)
        if (wi >= 0) inc[wi].push({ units: fr.units, po: null, date: fr.date, source: 'receipt' })
      }
      // Planned build with no PO → last week of that (future) month.
      const futureMonths = Array.from(new Set(weeks.map((w) => w.month))).filter((ym) => ym > curMonth)
      for (const ym of futureMonths) {
        if (monthsWithPo.has(ym)) continue
        const planned = getM(plan, pid, market, ym)
        if (planned <= 0) continue
        const wi = lastWeekOfMonth(ym)
        if (wi >= 0) inc[wi].push({ units: planned, po: null, date: null, source: 'planned' })
      }

      // Per-week demand (balances are computed per view in the component).
      const cells: RunwayCell[] = []
      let demandSum = 0
      for (let i = 0; i < weeks.length; i++) {
        const w = weeks[i]
        let dem = 0
        for (let d = new Date(w.start + 'T00:00:00Z'); ymd(d) <= w.end; d = addDays(d, 1)) {
          if (asOf && ymd(d) <= asOf) continue           // days already elapsed (in on-hand)
          dem += dailyRate(d)
        }
        dem = Math.round(dem)
        demandSum += dem
        cells.push({ demand: dem, detail: inc[i] })
      }
      const totalIncoming = cells.reduce((s, c) => s + c.detail.reduce((t, d) => t + d.units, 0), 0)
      if (onHand === 0 && demandSum === 0 && totalIncoming === 0) continue
      rows.push({
        product_id: pid, sku: m.sku, name: m.name, group: m.group, market,
        onHand: Math.round(onHand), weeks: cells, avgWeekly: demandSum / weeks.length,
      })
    }
  }

  return { weeks, rows, asOf, horizonWeeks: HORIZON_WEEKS }
}
