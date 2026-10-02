/**
 * Inwards Finished Goods parser.
 *
 * Reads an "Inwards FG" sheet (one row per receipt) into monthly receipts.
 * Columns used: SKU (FG- code), Received date (D.M.YY), Retail Units Received,
 * Supplier Batch ID. "Retail Units Received" is the individual-unit count
 * (e.g. pouches, not cases), which is what the stock ledger tracks.
 *
 * The master now splits inwards into two country tabs — "Inwards NZ FG Odi
 * Organic" and "Inwards AUST FG Odi Organic". Each parse is told its market so
 * the receipt lands on the right (NZ / AUS) Stock Movements row. The Australian
 * tab denotes the AU build with a `-AU` SKU suffix; it's the same product as the
 * base code, just held in Australia, so the suffix is stripped before matching.
 */

export interface InwardsReceipt {
  fg: string                      // base SKU (any -AU suffix stripped)
  receivedDate: string | null     // ISO yyyy-mm-dd
  receivedMonth: string           // yyyy-mm-01
  units: number
  batchRef: string | null
  market: 'NZ' | 'AU'
}

/** A row whose received date parses but is in the future — almost always an
 *  Excel autofill/typo (e.g. 26.8.27 dragged down from 26.8.26). Reported, not
 *  imported, so it never lands silently under the wrong month. */
export interface SuspectDate {
  fg: string
  raw: string
  market: 'NZ' | 'AU'
}

export interface InwardsParseResult {
  receipts: InwardsReceipt[]
  suspectDates: SuspectDate[]
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

export function parseInwardsReceipts(
  rows: Record<string, unknown>[],
  market: 'NZ' | 'AU' = 'NZ',
  today: Date = new Date(),
): InwardsParseResult {
  const receipts: InwardsReceipt[] = []
  const suspectDates: SuspectDate[] = []
  const todayIso = today.toISOString().slice(0, 10)
  for (const r of rows) {
    const rawSku = s(r['SKU'])
    if (!rawSku.toUpperCase().startsWith('FG-')) continue
    // AU build is the same product as the base code — drop the -AU suffix.
    const fg = rawSku.replace(/-AU$/i, '')
    const rawDate = s(r['Received date'])
    const dt = parseDMY(rawDate)
    if (!dt) continue                 // blank / unparseable → not yet received
    const units = Number(s(r['Retail Units Received']).replace(/[, ]/g, ''))
    if (!Number.isFinite(units) || units <= 0) continue
    const mm = String(dt.m).padStart(2, '0')
    const iso = `${dt.y}-${mm}-${String(dt.d).padStart(2, '0')}`
    // A receipt can't be received in the future — report it instead of booking
    // it under 2027/28/29 and never telling anyone.
    if (iso > todayIso) { suspectDates.push({ fg, raw: rawDate, market }); continue }
    receipts.push({
      fg,
      receivedDate:  iso,
      receivedMonth: `${dt.y}-${mm}-01`,
      units,
      batchRef: s(r['Supplier Batch ID']) || null,
      market,
    })
  }
  return { receipts, suspectDates }
}
