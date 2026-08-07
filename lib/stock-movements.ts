/**
 * Stock Movements ledger — a running finished-goods stocktake per product.
 *
 * For each month, in order:
 *   EOM = opening + inbound − outbound − write-off        (actual months)
 *   EOM = opening + produced − demand                     (forecast months)
 * where opening is the previous month's EOM. March (launch) starts at 0.
 *
 * Pure function: the page assembles the per-product/per-month maps from the
 * DB (receipts, BvA actuals, write-offs, production plan, demand forecast)
 * and this rolls them into the ledger.
 */

/** One finished-goods receipt behind a month's inbound total. */
export interface ReceiptDetail {
  date: string | null   // ISO received_date
  units: number
  po: string | null     // PO number, when the receipt came from a PO receipt
  source: string        // 'po_receipt' | 'inwards_upload' | 'manual'
  batch: string | null
}

/** An open (not-fully-received) finished-goods PO line, placed on its expected month. */
export interface OpenPoDetail {
  po: string            // PO number
  supplier: string | null
  remaining: number     // ordered − received
  expected: string | null   // ISO expected delivery date
  partial: boolean      // some of the line has already been received
}

export interface ActualCell {
  inbound: number
  outbound: number     // sold + samples (BvA actuals)
  writeoff: number
  eom: number          // predicted closing stock — INCLUDES fully-open POs (stillToReceipt)
  receipts: ReceiptDetail[]     // breakdown behind `inbound` (for the hover)
  stillToReceipt: OpenPoDetail[] // fully-open POs (nothing received) — counted in eom
  partialReceipt: OpenPoDetail[] // part-received PO lines — flagged only, not counted
}

export interface ForecastCell {
  produced: number     // production plan
  demand: number       // demand forecast
  eom: number          // INCLUDES fully-open POs (stillToReceipt)
  shortfall: boolean   // eom < 0
  stillToReceipt: OpenPoDetail[] // fully-open POs — counted in eom
  partialReceipt: OpenPoDetail[] // part-received PO lines — flagged only
  noPo: boolean             // planned production this month with no covering open PO
}

export interface StockRow {
  product_id: string
  sku: string
  name: string
  group: string | null
  market: 'NZ' | 'AU'
  /** AU rows only start here (e.g. '2026-09-01'); cells before it render blank. */
  startMonth: string | null
  opening: number
  actual: Record<string, ActualCell>
  forecast: Record<string, ForecastCell>
  /** True if the product has any movement at all (used to hide empty rows). */
  hasActivity: boolean
}

type PM = Map<string, Map<string, number>>   // product_id -> month -> units
const at = (m: PM, pid: string, month: string) => m.get(pid)?.get(month) ?? 0

/** Per-country data maps feeding one market's row. */
export interface MarketMaps {
  inbound: PM
  outbound: PM
  writeoff: PM
  produced: PM
  demand: PM
  opening?: Map<string, number>
  inboundReceipts?: Map<string, Map<string, ReceiptDetail[]>>
  openPo?: Map<string, Map<string, OpenPoDetail[]>>
}

function buildRow(
  p: { id: string; sku_code: string; name: string; product_type: string | null },
  market: 'NZ' | 'AU',
  maps: MarketMaps,
  actualMonths: string[],
  forecastMonths: string[],
  startMonth: string | null,
): StockRow {
  const openByMonth = maps.openPo?.get(p.id)
  const openingVal = maps.opening?.get(p.id) ?? 0
  let eom = openingVal
  let activity = openingVal !== 0

  const actual: Record<string, ActualCell> = {}
  for (const m of actualMonths) {
    if (startMonth && m < startMonth) continue   // AU: blank before it starts
    const inbound  = at(maps.inbound, p.id, m)
    const outbound = at(maps.outbound, p.id, m)
    const writeoff = at(maps.writeoff, p.id, m)
    const open = openByMonth?.get(m) ?? []
    const stillToReceipt = open.filter((o) => !o.partial)
    const partialReceipt = open.filter((o) => o.partial)
    const expected = stillToReceipt.reduce((s, o) => s + o.remaining, 0)
    eom = eom + inbound + expected - outbound - writeoff
    if (inbound || outbound || writeoff || open.length) activity = true
    const receipts = maps.inboundReceipts?.get(p.id)?.get(m) ?? []
    actual[m] = { inbound, outbound, writeoff, eom, receipts, stillToReceipt, partialReceipt }
  }

  const forecast: Record<string, ForecastCell> = {}
  for (const m of forecastMonths) {
    if (startMonth && m < startMonth) continue
    const produced = at(maps.produced, p.id, m)
    const demand   = at(maps.demand, p.id, m)
    const open = openByMonth?.get(m) ?? []
    const stillToReceipt = open.filter((o) => !o.partial)
    const partialReceipt = open.filter((o) => o.partial)
    const expected = stillToReceipt.reduce((s, o) => s + o.remaining, 0)
    eom = eom + produced + expected - demand
    const noPo = produced > 0 && open.length === 0
    if (produced || demand || open.length) activity = true
    forecast[m] = { produced, demand, eom, shortfall: eom < 0, stillToReceipt, partialReceipt, noPo }
  }

  return {
    product_id: p.id, sku: p.sku_code, name: p.name, group: p.product_type ?? null,
    market, startMonth, opening: openingVal, actual, forecast, hasActivity: activity,
  }
}

/**
 * Two stacked rows per product — NZ then AUS. A product's pair is included when
 * EITHER market has activity; the AUS row spans the grid but is blank before
 * auStartMonth (AU demand begins then).
 */
export function buildStockLedger(input: {
  products: Array<{ id: string; sku_code: string; name: string; product_type: string | null }>
  actualMonths: string[]
  forecastMonths: string[]
  nz: MarketMaps
  au: MarketMaps
  auStartMonth: string
}): StockRow[] {
  const out: StockRow[] = []
  for (const p of input.products) {
    const nz = buildRow(p, 'NZ', input.nz, input.actualMonths, input.forecastMonths, null)
    const au = buildRow(p, 'AU', input.au, input.actualMonths, input.forecastMonths, input.auStartMonth)
    if (nz.hasActivity || au.hasActivity) { out.push(nz); out.push(au) }
  }
  return out
}
