/**
 * Budget XLSX parser — reads the FY27 Budget workbook and flattens
 * the relevant tabs into key-value rows for the dashboard.
 *
 * Tabs we consume (the "Copy of" presentation tabs):
 *   - "Copy of Total Business P&L"   → P&L (consolidated)
 *   - "Copy of NZ D2C", "Copy of AUS D2C" → D2C orders
 *   - "Copy of NZ Retail", "Copy of AUS Retail" → retail active stores
 *
 * Months read: FY27 (Apr-26 → Mar-27) monthly cells, plus FY27/28/29
 * full-year totals from each tab's headline summary block.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { WorkBook, WorkSheet } from 'xlsx'

export type BudgetSection = 'pnl' | 'd2c' | 'retail'
export type BudgetRegion  = 'nz' | 'au' | 'total'

export interface BudgetLineItem {
  section:     BudgetSection
  metric:      string
  region:      BudgetRegion
  channel:     string | null      // retail only
  year_month:  string | null      // 'YYYY-MM-01'
  fiscal_year: number | null      // 27 / 28 / 29
  value:       number | null
}

export interface BudgetParseResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  items: BudgetLineItem[]
  meta: {
    fy_start_month: string         // first FY27 month, e.g. '2026-04-01'
    months_fy27: string[]          // 12 month keys
  }
}

// ============================================================
// Cell helpers
// ============================================================
function colLetter(idx0: number): string {
  // 0 → A, 1 → B, …
  let n = idx0 + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

function readCell(ws: WorkSheet, row1: number, col0: number): unknown {
  const ref = colLetter(col0) + row1
  return ws[ref]?.v
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

function lower(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/** Normalise a label for matching: lowercase, trim, em/en dashes → hyphen, collapse whitespace. */
function norm(v: unknown): string {
  return lower(v).replace(/[–—]/g, '-').replace(/\s+/g, ' ')
}

/** Resolve a date cell to a 'YYYY-MM-01' key (using LOCAL time, matching how SheetJS creates dates). */
function monthKeyFromCell(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  }
  if (typeof v === 'string' && /^[A-Za-z]{3}-\d{2}$/.test(v.trim())) {
    // 'Apr-26' → 2026-04-01
    const [mon, yy] = v.trim().split('-')
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 } as Record<string, number>
    const m = months[mon.toLowerCase()]
    if (!m) return null
    const y = 2000 + Number(yy)
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (typeof v === 'number') {
    // Excel serial — anchor in local time
    const d = new Date(1899, 11, 30 + v)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  }
  return null
}

/** Find the row (1-indexed) where column A begins with `needle` (case-insensitive contains). Optionally start scanning from `fromRow`. */
function findRowByLabel(ws: WorkSheet, needle: string, fromRow = 1, toRow = 200): number | null {
  const want = needle.trim().toLowerCase()
  for (let r = fromRow; r <= toRow; r++) {
    const v = readCell(ws, r, 0)
    if (typeof v === 'string' && v.trim().toLowerCase().includes(want)) return r
  }
  return null
}

/** Get the column index (0-based) for the first month cell on the month-header row. */
function findMonthHeaderColumns(ws: WorkSheet, headerRow1: number, expect = 12): number[] {
  const out: number[] = []
  for (let c = 1; c < 50; c++) {
    const v = readCell(ws, headerRow1, c)
    const k = monthKeyFromCell(v)
    if (k) out.push(c)
    if (out.length >= expect) break
  }
  return out
}

// ============================================================
// P&L parser — "Copy of Total Business P&L"
// ============================================================
// Monthly P&L row labels — exact match (after norm). Em-dashes already normalised to '-'.
const PNL_MONTHLY_LINES: Array<{ label: string; metric: string }> = [
  { label: 'gross rev - d2c',         metric: 'gross_revenue_d2c' },
  { label: 'gross rev - b2b',         metric: 'gross_revenue_b2b' },
  { label: 'total gross rev',         metric: 'gross_revenue_total' },
  { label: 'net rev - d2c',           metric: 'net_revenue_d2c' },
  { label: 'net rev - b2b',           metric: 'net_revenue_b2b' },
  { label: 'total net rev',           metric: 'net_revenue_total' },
  { label: 'cos',                     metric: 'cos' },
  { label: 'logistics',               metric: 'logistics' },
  { label: "total cog's",             metric: 'total_cogs' },
  { label: 'gross profit',            metric: 'gross_profit' },
  { label: 'gp %',                    metric: 'gp_pct' },
  { label: 'marketing',               metric: 'marketing' },
  { label: 'opex',                    metric: 'opex' },
  { label: 'ebitda',                  metric: 'ebitda' },
  { label: 'ebitda margin',           metric: 'ebitda_margin' },
]

// FY summary uses slightly different labels (full words instead of abbreviations).
const PNL_FY_LINES: Array<{ label: string; metric: string }> = [
  { label: 'gross revenue - d2c',         metric: 'gross_revenue_d2c' },
  { label: 'gross revenue - b2b/retail',  metric: 'gross_revenue_b2b' },
  { label: 'total gross revenue',         metric: 'gross_revenue_total' },
  { label: 'net revenue - d2c',           metric: 'net_revenue_d2c' },
  { label: 'net revenue - b2b',           metric: 'net_revenue_b2b' },
  { label: 'total net revenue',           metric: 'net_revenue_total' },
  { label: 'cost of sales (cos)',         metric: 'cos' },
  { label: 'logistics / freight',         metric: 'logistics' },
  { label: "total cog's",                 metric: 'total_cogs' },
  { label: 'gross profit',                metric: 'gross_profit' },
  { label: 'gp %',                        metric: 'gp_pct' },
  { label: 'marketing',                   metric: 'marketing' },
  { label: 'opex',                        metric: 'opex' },
  { label: 'ebitda',                      metric: 'ebitda' },
  { label: 'ebitda margin',               metric: 'ebitda_margin' },
]

function parsePnL(ws: WorkSheet | undefined, items: BudgetLineItem[], errors: string[]) {
  if (!ws) { errors.push('Tab "Copy of Total Business P&L" not found'); return }

  // ── FY summary block: header is somewhere in rows 1..15
  // The header row has "Line Item" in col A and FY27/FY28/FY29 in cols C/D/E.
  let fyHeaderRow: number | null = null
  for (let r = 1; r <= 15; r++) {
    if (lower(readCell(ws, r, 0)).startsWith('line item')) {
      const c2 = lower(readCell(ws, r, 2))
      if (c2.includes('fy27') || c2.includes('27')) { fyHeaderRow = r; break }
    }
  }

  // Bound the FY summary loop above the monthly P&L detail block — same defence
  // as on D2C / retail tabs, even though P&L's two sections use different labels.
  const monthlyMarkerPnL = findRowByLabel(ws, 'monthly p&l detail') ?? findRowByLabel(ws, 'monthly')

  if (fyHeaderRow) {
    const fySummaryEnd = monthlyMarkerPnL ?? (fyHeaderRow + 30)
    for (let r = fyHeaderRow + 1; r < fySummaryEnd; r++) {
      const lbl = norm(readCell(ws, r, 0))
      if (!lbl) continue
      const matched = PNL_FY_LINES.find((p) => lbl === p.label)
      if (!matched) continue
      ;[27, 28, 29].forEach((fy, i) => {
        const v = num(readCell(ws, r, 2 + i))
        if (v != null) items.push({
          section: 'pnl', metric: matched.metric, region: 'total', channel: null,
          year_month: null, fiscal_year: fy, value: v,
        })
      })
    }
  } else {
    errors.push('P&L: could not find FY summary header row')
  }

  // ── Monthly detail block (reuse marker found above for the FY-loop bound)
  const monthHeaderRow = monthlyMarkerPnL ? findRowByLabel(ws, 'line item', monthlyMarkerPnL + 1, monthlyMarkerPnL + 8) : null
  if (monthHeaderRow) {
    const monthCols = findMonthHeaderColumns(ws, monthHeaderRow, 36)
    if (monthCols.length < 12) errors.push(`P&L: only ${monthCols.length} month columns found (expected at least 12)`)
    const monthKeys = monthCols.map((c) => monthKeyFromCell(readCell(ws, monthHeaderRow, c))!).filter(Boolean)

    for (let r = monthHeaderRow + 1; r < monthHeaderRow + 30; r++) {
      const lbl = norm(readCell(ws, r, 0))
      if (!lbl) continue
      const matched = PNL_MONTHLY_LINES.find((p) => lbl === p.label)
      if (!matched) continue
      monthCols.forEach((c, i) => {
        const v = num(readCell(ws, r, c))
        const mk = monthKeys[i]
        if (v != null && mk) items.push({
          section: 'pnl', metric: matched.metric, region: 'total', channel: null,
          year_month: mk, fiscal_year: null, value: v,
        })
      })
    }
  } else {
    errors.push('P&L: could not find monthly detail block')
  }
}

// ============================================================
// D2C parser — "Copy of NZ D2C" / "Copy of AUS D2C"
// ============================================================
function parseD2C(ws: WorkSheet | undefined, region: BudgetRegion, items: BudgetLineItem[], errors: string[]) {
  if (!ws) { errors.push(`D2C: ${region.toUpperCase()} tab missing`); return }

  // FY summary: row with "Metric" in col A and FY27 in col C
  let fyHeaderRow: number | null = null
  for (let r = 1; r <= 15; r++) {
    if (lower(readCell(ws, r, 0)).startsWith('metric') && lower(readCell(ws, r, 2)).includes('fy27')) {
      fyHeaderRow = r; break
    }
  }
  // CRITICAL: bound the FY summary loop above the monthly section, otherwise
  // the monthly section's "Total Orders" / "Net Revenue" rows (with their
  // Apr/May/Jun values in cols C/D/E) will overwrite the FY27/28/29 totals.
  const monthlyMarker = findRowByLabel(ws, 'monthly breakdown of headline')
  if (fyHeaderRow) {
    const fySummaryEnd = monthlyMarker ?? (fyHeaderRow + 30)
    for (let r = fyHeaderRow + 1; r < fySummaryEnd; r++) {
      const lbl = lower(readCell(ws, r, 0))
      if (!lbl) continue
      if (lbl.startsWith('total orders')) {
        ;[27, 28, 29].forEach((fy, i) => {
          const v = num(readCell(ws, r, 2 + i))
          if (v != null) items.push({
            section: 'd2c', metric: 'orders', region, channel: null,
            year_month: null, fiscal_year: fy, value: Math.round(v),
          })
        })
      }
      if (lbl.startsWith('net revenue')) {
        ;[27, 28, 29].forEach((fy, i) => {
          const v = num(readCell(ws, r, 2 + i))
          if (v != null) items.push({
            section: 'd2c', metric: 'net_revenue', region, channel: null,
            year_month: null, fiscal_year: fy, value: v,
          })
        })
      }
    }
  }

  // Monthly: "0b. MONTHLY BREAKDOWN OF HEADLINE METRICS" → next "Metric" header
  const marker = monthlyMarker
  const monthHeaderRow = marker ? findRowByLabel(ws, 'metric', marker + 1, marker + 8) : null
  if (!monthHeaderRow) { errors.push(`D2C ${region}: monthly section not found`); return }

  const monthCols = findMonthHeaderColumns(ws, monthHeaderRow, 36)
  const monthKeys = monthCols.map((c) => monthKeyFromCell(readCell(ws, monthHeaderRow, c))!).filter(Boolean)

  for (let r = monthHeaderRow + 1; r < monthHeaderRow + 30; r++) {
    const lbl = lower(readCell(ws, r, 0))
    if (!lbl) continue
    if (lbl.startsWith('total orders')) {
      monthCols.forEach((c, i) => {
        const v = num(readCell(ws, r, c))
        const mk = monthKeys[i]
        if (v != null && mk) items.push({
          section: 'd2c', metric: 'orders', region, channel: null,
          year_month: mk, fiscal_year: null, value: Math.round(v),
        })
      })
    }
    if (lbl.startsWith('net revenue')) {
      monthCols.forEach((c, i) => {
        const v = num(readCell(ws, r, c))
        const mk = monthKeys[i]
        if (v != null && mk) items.push({
          section: 'd2c', metric: 'net_revenue', region, channel: null,
          year_month: mk, fiscal_year: null, value: v,
        })
      })
    }
  }
}

// ============================================================
// Retail parser — "Copy of NZ Retail" / "Copy of AUS Retail"
//
// Active stores per retailer type derived from the monthly new-stores
// rows. Baseline (any active stores at Apr-26 not from new-stores) is
// allocated to "grocery" by default — adjust later if the spreadsheet
// adds explicit per-type baselines.
// ============================================================
const RETAIL_TYPES = [
  { label: 'new stores — woolworths',  channel: 'woolworths' },
  { label: 'new stores — grocery',     channel: 'grocery'    },
  { label: 'new stores — pharmacy',    channel: 'pharmacy'   },
  { label: 'new stores — other',       channel: 'other'      },
] as const

function parseRetail(ws: WorkSheet | undefined, region: BudgetRegion, items: BudgetLineItem[], errors: string[], warnings: string[]) {
  if (!ws) { errors.push(`Retail: ${region.toUpperCase()} tab missing`); return }

  // ── FY summary (bound above the monthly section so labels in monthly
  //     breakdown don't overwrite the FY27/28/29 totals)
  let fyHeaderRow: number | null = null
  for (let r = 1; r <= 15; r++) {
    if (lower(readCell(ws, r, 0)).startsWith('metric') && lower(readCell(ws, r, 2)).includes('fy27')) {
      fyHeaderRow = r; break
    }
  }
  const monthlyMarkerRetail = findRowByLabel(ws, 'monthly breakdown of headline')
  if (fyHeaderRow) {
    const fySummaryEnd = monthlyMarkerRetail ?? (fyHeaderRow + 20)
    for (let r = fyHeaderRow + 1; r < fySummaryEnd; r++) {
      const lbl = lower(readCell(ws, r, 0))
      if (!lbl) continue
      if (lbl.startsWith('active stores end of fy (exc ww)')) {
        ;[27, 28, 29].forEach((fy, i) => {
          const v = num(readCell(ws, r, 2 + i))
          if (v != null) items.push({ section: 'retail', metric: 'active_stores_end', region, channel: 'other_total', year_month: null, fiscal_year: fy, value: Math.round(v) })
        })
      }
      if (lbl.startsWith('active ww stores end of fy')) {
        ;[27, 28, 29].forEach((fy, i) => {
          const v = num(readCell(ws, r, 2 + i))
          if (v != null) items.push({ section: 'retail', metric: 'active_stores_end', region, channel: 'woolworths', year_month: null, fiscal_year: fy, value: Math.round(v) })
        })
      }
      if (lbl.startsWith('grand total active stores')) {
        ;[27, 28, 29].forEach((fy, i) => {
          const v = num(readCell(ws, r, 2 + i))
          if (v != null) items.push({ section: 'retail', metric: 'active_stores_end', region, channel: 'all', year_month: null, fiscal_year: fy, value: Math.round(v) })
        })
      }
      if (lbl.startsWith('gross revenue')) {
        ;[27, 28, 29].forEach((fy, i) => {
          const v = num(readCell(ws, r, 2 + i))
          if (v != null) items.push({ section: 'retail', metric: 'gross_revenue', region, channel: 'all', year_month: null, fiscal_year: fy, value: v })
        })
      }
    }
  }

  // ── Store acquisition breakdown (monthly, by retailer type)
  // Plus we read "Active WW Stores" and "Active Stores (Exc WW)" rows for actuals.
  const storeAcqMarker = findRowByLabel(ws, 'store acquisition')
  const monthHeaderRow = storeAcqMarker ? findRowByLabel(ws, 'metric', storeAcqMarker + 1, storeAcqMarker + 8) : null
  if (!monthHeaderRow) { warnings.push(`Retail ${region}: store acquisition section not found — channel split unavailable`); }

  // The "Monthly breakdown of headline metrics" section also has the active stores rows
  const headlineMonthly = findRowByLabel(ws, 'monthly breakdown of headline')
  const headlineMonthHeader = headlineMonthly ? findRowByLabel(ws, 'metric', headlineMonthly + 1, headlineMonthly + 8) : null
  let totalActiveByMonth: Map<string, number> = new Map()
  let wwActiveByMonth: Map<string, number> = new Map()
  let monthKeys: string[] = []

  if (headlineMonthHeader) {
    const monthCols = findMonthHeaderColumns(ws, headlineMonthHeader, 36)
    monthKeys = monthCols.map((c) => monthKeyFromCell(readCell(ws, headlineMonthHeader, c))!).filter(Boolean)

    for (let r = headlineMonthHeader + 1; r < headlineMonthHeader + 20; r++) {
      const lbl = lower(readCell(ws, r, 0))
      if (!lbl) continue
      if (lbl === 'active stores (exc ww)' || lbl.startsWith('active stores (exc ww)')) {
        monthCols.forEach((c, i) => {
          const v = num(readCell(ws, r, c)); const mk = monthKeys[i]
          if (v != null && mk) totalActiveByMonth.set(mk, Math.round(v))
        })
      } else if (lbl === 'active ww stores' || lbl.startsWith('active ww stores')) {
        monthCols.forEach((c, i) => {
          const v = num(readCell(ws, r, c)); const mk = monthKeys[i]
          if (v != null && mk) {
            wwActiveByMonth.set(mk, Math.round(v))
          }
        })
      } else if (lbl.startsWith('gross revenue (rrp)')) {
        monthCols.forEach((c, i) => {
          const v = num(readCell(ws, r, c)); const mk = monthKeys[i]
          if (v != null && mk) items.push({ section: 'retail', metric: 'gross_revenue', region, channel: 'all', year_month: mk, fiscal_year: null, value: v })
        })
      }
    }
  }

  // ── Now derive per-retailer-type monthly active stores from new-stores rows
  if (monthHeaderRow) {
    const monthCols = findMonthHeaderColumns(ws, monthHeaderRow, 36)
    if (monthCols.length >= 12) {
      const newKeys = monthCols.map((c) => monthKeyFromCell(readCell(ws, monthHeaderRow, c))!).filter(Boolean)

      // Find each new-stores-by-type row
      const newByType = new Map<string, number[]>()
      for (let r = monthHeaderRow + 1; r < monthHeaderRow + 20; r++) {
        const lbl = lower(readCell(ws, r, 0))
        if (!lbl) continue
        const t = RETAIL_TYPES.find((rt) => lbl.startsWith(rt.label))
        if (!t) continue
        const arr = monthCols.map((c) => num(readCell(ws, r, c)) ?? 0)
        newByType.set(t.channel, arr)
      }

      // Per-month allocation:
      //   Use the spreadsheet's actual "Active Stores (Exc WW)" total each
      //   month as the source of truth. Cumulative new by type accounts
      //   for everything we know explicitly. Any remainder (a baseline
      //   that pre-dates FY27 plus the spreadsheet's churn quirks) is
      //   allocated to the default bucket — grocery — so the row totals
      //   reconcile with the spreadsheet exactly.
      const cumByType: Record<string, number> = { woolworths: 0, grocery: 0, pharmacy: 0, other: 0 }
      for (let i = 0; i < newKeys.length; i++) {
        const mk = newKeys[i]

        // Cumulative new for each non-WW type (grocery / pharmacy / other)
        for (const t of RETAIL_TYPES) {
          if (t.channel === 'woolworths') continue
          cumByType[t.channel] += newByType.get(t.channel)?.[i] ?? 0
        }

        // Baseline share for this month = monthly total Active Exc WW − cumulative new (excl WW)
        const totalExcWW   = totalActiveByMonth.get(mk) ?? 0
        const cumExcWW     = cumByType.grocery + cumByType.pharmacy + cumByType.other
        const baselineShare = Math.max(0, totalExcWW - cumExcWW)

        // Woolworths uses the explicit Active WW series
        const wwActive = wwActiveByMonth.get(mk) ?? 0

        items.push({ section: 'retail', metric: 'active_stores', region, channel: 'woolworths', year_month: mk, fiscal_year: null, value: wwActive })
        items.push({ section: 'retail', metric: 'active_stores', region, channel: 'grocery',    year_month: mk, fiscal_year: null, value: cumByType.grocery + baselineShare })
        items.push({ section: 'retail', metric: 'active_stores', region, channel: 'pharmacy',   year_month: mk, fiscal_year: null, value: cumByType.pharmacy })
        items.push({ section: 'retail', metric: 'active_stores', region, channel: 'other',      year_month: mk, fiscal_year: null, value: cumByType.other })
      }
    }
  }
}

// ============================================================
// Top-level entry
// ============================================================
export async function parseBudgetXlsx(buf: ArrayBuffer): Promise<BudgetParseResult> {
  const XLSX = await import('xlsx')
  const wb: WorkBook = XLSX.read(buf, { type: 'array', cellDates: true })

  const items: BudgetLineItem[] = []
  const errors: string[] = []
  const warnings: string[] = []

  const find = (name: string) => wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase())
  const pnlTab    = find('Copy of Total Business P&L')
  const nzD2cTab  = find('Copy of NZ D2C')
  const auD2cTab  = find('Copy of AUS D2C')
  const nzRetTab  = find('Copy of NZ Retail')
  const auRetTab  = find('Copy of AUS Retail')

  if (pnlTab)   parsePnL(wb.Sheets[pnlTab], items, errors)
  else          errors.push('Tab "Copy of Total Business P&L" not found')

  if (nzD2cTab) parseD2C(wb.Sheets[nzD2cTab], 'nz', items, errors)
  else          errors.push('Tab "Copy of NZ D2C" not found')
  if (auD2cTab) parseD2C(wb.Sheets[auD2cTab], 'au', items, errors)
  else          errors.push('Tab "Copy of AUS D2C" not found')

  if (nzRetTab) parseRetail(wb.Sheets[nzRetTab], 'nz', items, errors, warnings)
  else          errors.push('Tab "Copy of NZ Retail" not found')
  if (auRetTab) parseRetail(wb.Sheets[auRetTab], 'au', items, errors, warnings)
  else          errors.push('Tab "Copy of AUS Retail" not found')

  // Derive FY27 month list from the P&L month keys (most reliable)
  const fy27Months = Array.from(new Set(
    items.filter((i) => i.section === 'pnl' && i.year_month).map((i) => i.year_month!),
  )).sort().slice(0, 12)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    items,
    meta: {
      fy_start_month: fy27Months[0] ?? '2026-04-01',
      months_fy27: fy27Months,
    },
  }
}
