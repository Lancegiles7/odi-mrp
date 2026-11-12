/**
 * Stock Movements ledger — a running finished-goods stocktake per product.
 *
 * For each month, in order:
 *   EOM = opening + inbound − outbound − write-off ± transfer   (actual months)
 *   EOM = opening + produced − demand ± transfer                (forecast months)
 * where opening is the previous month's EOM. March (launch) starts at 0.
 *
 * Pure function: the page assembles the per-product/per-month maps from the
 * DB (receipts, BvA actuals, write-offs, production plan, demand forecast)
 * and this rolls them into the ledger. Transfers are NZ ↔ AU transfer
 * orders moving stock between the NZ and AUS rows (see lib/transfer-stock.ts).
 */
import type { TransferDetail } from '@/lib/transfer-stock'
export type { TransferDetail }

/** One finished-goods receipt behind a month's inbound total. */
export interface ReceiptDetail {
  date: string | null   // ISO received_date
  units: number
  po: string | null     // PO number, when the receipt came from a PO receipt
  source: string        // 'po_receipt' | 'inwards_upload' | 'manual'
  batch: string | null
  ordered?: number | null  // PO line qty ordered (po_receipt only) — for the shortfall hover
  shortClosed?: boolean    // true when the shortfall was written off ("nothing more to come")
}

/** An open (not-fully-received) finished-goods PO line, placed on its expected month. */
export interface OpenPoDetail {
  po: string            // PO number
  supplier: string | null
  remaining: number     // ordered − received
  expected: string | null   // ISO expected delivery date
  partial: boolean      // some of the line has already been received
}

/** A PO that was received short and then closed off (shortfall written off) —
 *  no open chip exists for it, so this carries the "partially fulfilled · closed"
 *  note onto the forecast month that holds the receipt. */
export interface PoFulfilment {
  po: string
  received: number
  ordered: number
}

export interface ActualCell {
  inbound: number
  outbound: number     // sold + samples (BvA actuals)
  writeoff: number
  eom: number          // predicted closing stock — mirrors Production (open POs flagged, NOT counted)
  transfer: number     // net NZ ↔ AU transfer (+ in / − out)
  transfers: TransferDetail[]
  receipts: ReceiptDetail[]     // breakdown behind `inbound` (for the hover)
  stillToReceipt: OpenPoDetail[] // fully-open POs (nothing received) — flagged only, NOT counted
  partialReceipt: OpenPoDetail[] // part-received PO lines — flagged only, not counted
}

export interface ForecastCell {
  produced: number     // production plan (or receipts, where logged)
  supply: number       // counted supply = received stock + still-to-come (see builder)
  received: number     // real receipts booked this (open) month — always counts
  demand: number       // demand forecast
  eom: number
  transfer: number     // net NZ ↔ AU transfer (+ in / − out)
  transfers: TransferDetail[]
  shortfall: boolean   // eom < 0
  receipts: ReceiptDetail[]      // breakdown behind `received` (for the hover)
  stillToReceipt: OpenPoDetail[] // fully-open POs still to receive — counted into supply
  partialReceipt: OpenPoDetail[] // part-received PO lines — flagged only
  noPo: boolean             // planned production this month with no PO behind it at all
  fulfilments: PoFulfilment[] // short-closed PO receipts landing this month (chip)
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
  planned?: PM    // production plan only (produced = plan OR receipts); drives "no PO"
  demand: PM
  opening?: Map<string, number>
  inboundReceipts?: Map<string, Map<string, ReceiptDetail[]>>
  openPo?: Map<string, Map<string, OpenPoDetail[]>>
  transfers?: Map<string, Map<string, TransferDetail[]>>
}

/**
 * Supply scenario for forecast months:
 *   'ontime'     — still-to-receive POs (and planned production) are assumed to
 *                  arrive on their expected month. This is the default view.
 *   'nodelivery' — assume nothing still outstanding turns up: supply counts ONLY
 *                  stock already physically received. Lets you see the floor EOM
 *                  if open POs are late / don't land. Chips still show what's
 *                  assumed missing; it's just not added to the balance.
 */
export type SupplyScenario = 'ontime' | 'nodelivery'

function buildRow(
  p: { id: string; sku_code: string; name: string; product_type: string | null },
  market: 'NZ' | 'AU',
  maps: MarketMaps,
  actualMonths: string[],
  forecastMonths: string[],
  startMonth: string | null,
  scenario: SupplyScenario,
): StockRow {
  const openByMonth = maps.openPo?.get(p.id)
  const trByMonth = maps.transfers?.get(p.id)
  const baseOpening = maps.opening?.get(p.id) ?? 0
  let eom = baseOpening
  let carriedOpening = baseOpening   // balance carried into the first visible month
  let activity = baseOpening !== 0
  const visible = (m: string) => !startMonth || m >= startMonth

  const actual: Record<string, ActualCell> = {}
  for (const m of actualMonths) {
    const inbound  = at(maps.inbound, p.id, m)
    const outbound = at(maps.outbound, p.id, m)
    const writeoff = at(maps.writeoff, p.id, m)
    const open = openByMonth?.get(m) ?? []
    const stillToReceipt = open.filter((o) => !o.partial)
    const partialReceipt = open.filter((o) => o.partial)
    const transfers = trByMonth?.get(m) ?? []
    const transfer = transfers.reduce((s, t) => s + t.units, 0)
    // Mirror the Production page: balance = received stock + planned production
    // − out. Open POs are shown as "still to receipt" chips only (not counted) —
    // the production plan is what represents expected supply.
    eom = eom + inbound - outbound - writeoff + transfer
    if (inbound || outbound || writeoff || open.length || transfers.length) activity = true
    // Months before an AU row's start are rolled into its opening (stock built
    // ahead of launch), not shown as their own cells.
    if (!visible(m)) { carriedOpening = eom; continue }
    const receipts = maps.inboundReceipts?.get(p.id)?.get(m) ?? []
    actual[m] = { inbound, outbound, writeoff, eom, transfer, transfers, receipts, stillToReceipt, partialReceipt }
  }

  const forecast: Record<string, ForecastCell> = {}
  for (const m of forecastMonths) {
    const produced = at(maps.produced, p.id, m)
    const received = at(maps.inbound, p.id, m)   // real receipts logged on this open month
    const demand   = at(maps.demand, p.id, m)
    const open = openByMonth?.get(m) ?? []
    const stillToReceipt = open.filter((o) => !o.partial)
    const partialReceipt = open.filter((o) => o.partial)
    const expected = stillToReceipt.reduce((s, o) => s + o.remaining, 0)
    const transfers = trByMonth?.get(m) ?? []
    const transfer = transfers.reduce((s, t) => s + t.units, 0)
    // Supply = stock already RECEIVED this month (always counts — it's real) PLUS
    // the still-to-come. The still-to-come is the larger of the plan not-yet-received
    // or the open-PO remaining — max() (not sum) so a production plan and the PO that
    // backs it aren't double-counted (e.g. plan 2,500 + its PO 2,500 = 2,500, not
    // 5,000). Previously supply was max(produced, expected), which hid received stock
    // whenever a separate open PO for the same month was larger. Overdue POs are
    // rolled into the current month upstream.
    const plannedUnits = maps.planned ? at(maps.planned, p.id, m) : 0
    const stillToCome = Math.max(0, plannedUnits - received, expected)
    // 'nodelivery' scenario: count only stock already physically received —
    // drop everything still outstanding (open POs + any planned-but-not-made).
    // The still-to-come is a single quantity whether it's framed as the plan or
    // the PO that backs it (they're the same stock), so the only honest "didn't
    // arrive" floor is the received figure.
    const supply = scenario === 'nodelivery' ? received : received + stillToCome
    // An incoming transfer is a delivery too, so 'nodelivery' treats the whole
    // uncertain (forecast-month) transfer like a still-to-receive PO: leave it
    // out of the balance. A transfer whose despatch already happened lives in an
    // actual month and still counts there — only the forecast legs (the part not
    // yet moved) drop out, so origin keeps un-shipped stock and the destination
    // doesn't receive it. Chips still show what's being held back.
    const transferBal = scenario === 'nodelivery' ? 0 : transfer
    eom = eom + supply - demand + transferBal
    // A short-closed PO is excluded from the open-PO chips (nothing more to come),
    // so a month holding only its receipt would otherwise read "no PO". Pull those
    // receipts off the month's receipt list and show them as "partially fulfilled ·
    // closed" instead, and suppress "no PO" whenever a PO receipt sits on the month.
    const monthReceipts = maps.inboundReceipts?.get(p.id)?.get(m) ?? []
    const poReceipts = monthReceipts.filter((rc) => rc.po)
    const fulMap = new Map<string, PoFulfilment>()
    for (const rc of poReceipts) {
      if (!rc.shortClosed) continue
      const f = fulMap.get(rc.po!) ?? { po: rc.po!, received: 0, ordered: rc.ordered ?? 0 }
      f.received += rc.units
      fulMap.set(rc.po!, f)
    }
    const fulfilments = Array.from(fulMap.values()).filter((f) => f.ordered > 0 && f.received < f.ordered)
    // "No PO" = we're planning production this month with nothing — no open PO and
    // no PO receipt — to back it. A plan met by a (short-closed) PO is not "no PO".
    const planned = maps.planned ? at(maps.planned, p.id, m) : produced
    const noPo = planned > 0 && open.length === 0 && poReceipts.length === 0
    if (produced || demand || open.length || transfers.length) activity = true
    if (!visible(m)) { carriedOpening = eom; continue }   // pre-launch build → opening
    forecast[m] = { produced, supply, received, demand, eom, transfer, transfers, shortfall: eom < 0, receipts: monthReceipts, stillToReceipt, partialReceipt, noPo, fulfilments }
  }

  return {
    product_id: p.id, sku: p.sku_code, name: p.name, group: p.product_type ?? null,
    market, startMonth,
    opening: startMonth ? carriedOpening : baseOpening,
    actual, forecast, hasActivity: activity,
  }
}

/** First month a product has any AU activity (production, demand, receipt, etc.). */
function firstActivityMonth(pid: string, maps: MarketMaps, months: string[]): string | null {
  for (const m of months) {
    if (
      at(maps.inbound, pid, m) || at(maps.outbound, pid, m) || at(maps.writeoff, pid, m) ||
      at(maps.produced, pid, m) || at(maps.demand, pid, m) ||
      (maps.openPo?.get(pid)?.get(m)?.length ?? 0) > 0 ||
      (maps.transfers?.get(pid)?.get(m)?.length ?? 0) > 0
    ) return m
  }
  return null
}

/**
 * Two stacked rows per product — NZ then AUS. A product's pair is included when
 * EITHER market has activity. The AUS row starts at its first real AU activity
 * (e.g. an August pre-launch build shows; earlier months roll into opening),
 * falling back to auStartMonth when there's none.
 */
export function buildStockLedger(input: {
  products: Array<{ id: string; sku_code: string; name: string; product_type: string | null }>
  actualMonths: string[]
  forecastMonths: string[]
  nz: MarketMaps
  au: MarketMaps
  auStartMonth: string
  /** Forecast supply assumption (default 'ontime'). */
  scenario?: SupplyScenario
}): StockRow[] {
  const scenario = input.scenario ?? 'ontime'
  const allMonths = [...input.actualMonths, ...input.forecastMonths]
  const out: StockRow[] = []
  for (const p of input.products) {
    const nz = buildRow(p, 'NZ', input.nz, input.actualMonths, input.forecastMonths, null, scenario)
    const auStart = firstActivityMonth(p.id, input.au, allMonths) ?? input.auStartMonth
    const au = buildRow(p, 'AU', input.au, input.actualMonths, input.forecastMonths, auStart, scenario)
    if (nz.hasActivity || au.hasActivity) { out.push(nz); out.push(au) }
  }
  return out
}
