/**
 * Inwards Finished Goods parser.
 *
 * Reads the "Inwards FG" sheet (one row per receipt) into monthly receipts.
 * Columns used: SKU (FG- code), Received date (D.M.YY), Retail Units Received,
 * Supplier Batch ID. "Retail Units Received" is the individual-unit count
 * (e.g. pouches, not cases), which is what the stock ledger tracks.
 */

export interface InwardsReceipt {
  fg: string
  receivedDate: string | null   // ISO yyyy-mm-dd
  receivedMonth: string         // yyyy-mm-01
  units: number
  batchRef: string | null
}

const s = (v: unknown) => (v == null ? '' : String(v).trim())

/** Parse a "D.M.YY" (or D.M.YYYY) date into {y,m,d}, or null. */
function parseDMY(raw: string): { y: number; m: number; d: number } | null {
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  const d = Number(m[1]), mon = Number(m[2])
  const y = m[3].length <= 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (mon < 1 || mon > 12 || d < 1 || d > 31) return null
  return { y, m: mon, d }
}

export function parseInwardsReceipts(rows: Record<string, unknown>[]): InwardsReceipt[] {
  const out: InwardsReceipt[] = []
  for (const r of rows) {
    const fg = s(r['SKU'])
    if (!fg.toUpperCase().startsWith('FG-')) continue
    const dt = parseDMY(s(r['Received date']))
    if (!dt) continue
    const units = Number(s(r['Retail Units Received']).replace(/[, ]/g, ''))
    if (!Number.isFinite(units) || units <= 0) continue
    const mm = String(dt.m).padStart(2, '0')
    out.push({
      fg,
      receivedDate:  `${dt.y}-${mm}-${String(dt.d).padStart(2, '0')}`,
      receivedMonth: `${dt.y}-${mm}-01`,
      units,
      batchRef: s(r['Supplier Batch ID']) || null,
    })
  }
  return out
}
