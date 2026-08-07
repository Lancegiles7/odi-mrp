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

export interface ActualCell {
  inbound: number
  outbound: number     // sold + samples (BvA actuals)
  writeoff: number
  eom: number          // predicted closing stock
  receipts: ReceiptDetail[]   // breakdown behind `inbound` (for the hover)
}

export interface ForecastCell {
  produced: number     // production plan
  demand: number       // demand forecast
  eom: number
  shortfall: boolean   // eom < 0
}

export interface StockRow {
  product_id: string
  sku: string
  name: string
  group: string | null
  opening: number
  actual: Record<string, ActualCell>
  forecast: Record<string, ForecastCell>
  /** True if the product has any movement at all (used to hide empty rows). */
  hasActivity: boolean
}

type PM = Map<string, Map<string, number>>   // product_id -> month -> units
const at = (m: PM, pid: string, month: string) => m.get(pid)?.get(month) ?? 0

export function buildStockLedger(input: {
  products: Array<{ id: string; sku_code: string; name: string; product_type: string | null }>
  actualMonths: string[]
  forecastMonths: string[]
  inbound: PM
  outbound: PM
  writeoff: PM
  produced: PM
  demand: PM
  opening?: Map<string, number>
  /** product_id -> month -> the receipts that make up that month's inbound. */
  inboundReceipts?: Map<string, Map<string, ReceiptDetail[]>>
}): StockRow[] {
  return input.products.map((p) => {
    let eom = input.opening?.get(p.id) ?? 0
    let activity = eom !== 0

    const actual: Record<string, ActualCell> = {}
    for (const m of input.actualMonths) {
      const inbound  = at(input.inbound, p.id, m)
      const outbound = at(input.outbound, p.id, m)
      const writeoff = at(input.writeoff, p.id, m)
      eom = eom + inbound - outbound - writeoff
      if (inbound || outbound || writeoff) activity = true
      const receipts = input.inboundReceipts?.get(p.id)?.get(m) ?? []
      actual[m] = { inbound, outbound, writeoff, eom, receipts }
    }

    const forecast: Record<string, ForecastCell> = {}
    for (const m of input.forecastMonths) {
      const produced = at(input.produced, p.id, m)
      const demand   = at(input.demand, p.id, m)
      eom = eom + produced - demand
      if (produced || demand) activity = true
      forecast[m] = { produced, demand, eom, shortfall: eom < 0 }
    }

    return {
      product_id: p.id, sku: p.sku_code, name: p.name, group: p.product_type ?? null,
      opening: input.opening?.get(p.id) ?? 0, actual, forecast, hasActivity: activity,
    }
  })
}
