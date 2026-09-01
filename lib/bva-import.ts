/**
 * Budget vs Actual — actuals import parsing.
 *
 * Pure functions that turn the three monthly exports into bva_figures
 * "actual" lines for a target month. Validated against the real files:
 *   - Shopify orders export  → D2C revenue, D2C orders, units by group
 *   - Upstock orders export  → Retail revenue (wholesale), retail orders
 *                              (Woolworths vs rest), units by group (pouches ×6)
 *   - Sample tracker (.xlsx) → indicative sample units by group (MONTHLY TOTAL
 *                              row, which already excludes the "already in
 *                              Shopify" rows below the divider)
 *
 * SheetJS parsing (reading the File buffers) happens in the server action;
 * these functions take already-parsed rows so they stay testable.
 */

export type GroupKey = 'sachets' | 'tubs' | 'snacks' | 'pouches' | 'puffs_melts' | 'noodles' | 'other'

/** Product group from any of the SKU schemes (FG-/SRC-/SHIP-…). */
export function bvaGroup(sku: string | null | undefined): GroupKey {
  const s = (sku ?? '').toUpperCase()
  if (s.includes('SAC')) return 'sachets'
  if (s.includes('TUB')) return 'tubs'
  if (s.includes('PCH')) return 'pouches'
  if (s.includes('NDL') || s.includes('NOODLE')) return 'noodles'
  // Quinoa puffs (PUF) and yoghurt drops / melts (DRP, MLT) share one group.
  if (s.includes('PUF') || s.includes('DRP') || s.includes('MLT')) return 'puffs_melts'
  if (s.includes('BITE') || s.includes('-BAR') || s.includes('BAL') || s.includes('CCO') || s.includes('COOK')) return 'snacks'
  return 'other'
}

/** "2026-06-26 13:16:20 +1200" / "2026-05-01 08:56" → "2026-06". */
export function monthOf(s: unknown): string {
  return String(s ?? '').trim().slice(0, 7)
}

type Row = Record<string, unknown>
const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string => String(v ?? '').trim()

export interface D2cActuals { revenue: number; orders: number; units: Record<GroupKey, number> }
export interface RetailActuals { revenue: number; ordersWw: number; ordersOther: number; units: Record<GroupKey, number> }

function zeroUnits(): Record<GroupKey, number> {
  return { sachets: 0, tubs: 0, snacks: 0, pouches: 0, puffs_melts: 0, noodles: 0, other: 0 }
}

/** Shopify export → D2C actuals for `ym` (YYYY-MM).
 *  Orders span multiple rows: the first row of an order carries Created at +
 *  Subtotal; line rows carry only Lineitem fields. We carry the month down. */
export function d2cFromShopify(rows: Row[], ym: string): D2cActuals {
  const units = zeroUnits()
  let revenue = 0
  const orders = new Set<string>()
  let curMonth: string | null = null
  for (const r of rows) {
    const created = str(r['Created at'])
    if (created) curMonth = monthOf(created)
    if (str(r['Cancelled at'])) continue
    if (curMonth !== ym) continue
    const name = str(r['Name'])
    if (name && created) orders.add(name)
    // Subtotal sits on the order's first row only (net of discount, ex ship/tax)
    if (str(r['Subtotal'])) revenue += num(r['Subtotal'])
    const sku = str(r['Lineitem sku'])
    const qty = r['Lineitem quantity']
    if (sku && str(qty)) units[bvaGroup(sku)] += num(qty)
  }
  return { revenue, orders: orders.size, units }
}

/** Upstock export → Retail actuals for `ym`. Wholesale revenue (Line Amount);
 *  retail pouches counted as single units (×6); Woolworths split off by
 *  customer name. */
export function retailFromUpstock(rows: Row[], ym: string): RetailActuals {
  const units = zeroUnits()
  let revenue = 0
  const ww = new Set<string>()
  const other = new Set<string>()
  for (const r of rows) {
    if (monthOf(r['Created Date']) !== ym) continue
    revenue += num(r['Line Amount'])
    const code = str(r['Product Code'])
    if (code) {
      const match = resolveRetail(code, str(r['Product Name']))
      const sku = match?.sku ?? code
      const pack = match?.pack ?? 1
      units[bvaGroup(sku)] += num(r['Quantity']) * pack
    }
    const ordNo = str(r['Order Number'])
    if (ordNo) {
      if (str(r['Customer']).toLowerCase().startsWith('woolworths')) ww.add(ordNo)
      else other.add(ordNo)
    }
  }
  return { revenue, ordersWw: ww.size, ordersOther: other.size, units }
}

/** Sample tracker month sheet (array-of-arrays) → indicative sample units by
 *  group. Reads the MONTHLY TOTAL row across the SKU columns (row that lists
 *  the FG- SKUs). The MONTHLY TOTAL already excludes the rows below the
 *  "SHOPIFY ORDERS ALREADY REFLECTED" divider, so no double counting. */
export function samplesFromSheet(aoa: unknown[][]): Record<GroupKey, number> {
  const units = zeroUnits()
  // Find the SKU header row (the one with FG- codes) and the MONTHLY TOTAL row.
  let skuRow: unknown[] | null = null
  let totalRow: unknown[] | null = null
  for (const row of aoa) {
    if (!skuRow && row.some((c) => str(c).startsWith('FG-ODI'))) skuRow = row
    if (!totalRow && str(row[0]).toUpperCase().startsWith('MONTHLY TOTAL')) totalRow = row
  }
  if (!skuRow || !totalRow) return units
  for (let c = 0; c < skuRow.length; c++) {
    const sku = str(skuRow[c])
    if (sku.startsWith('FG-ODI')) units[bvaGroup(sku)] += num(totalRow[c])
  }
  return units
}

/** Which of the three exports were actually attached to this import. */
export interface ActualSources { d2c: boolean; retail: boolean; samples: boolean }

/** Map the computed actuals into bva_figures line_key → value.
 *  Only lines the attached files can actually speak for are returned — a line
 *  left out keeps whatever is already saved for the month, rather than being
 *  overwritten with a zero by an import that never saw its source file. */
export function actualsToFigureLines(
  d2c: D2cActuals,
  retail: RetailActuals,
  samples: Record<GroupKey, number>,
  sources: ActualSources = { d2c: true, retail: true, samples: true },
): Record<string, number> {
  const groups: GroupKey[] = ['sachets', 'tubs', 'snacks', 'pouches', 'puffs_melts', 'noodles']
  const out: Record<string, number> = {}
  if (sources.d2c) {
    out.rev_d2c = d2c.revenue
    out.ord_d2c = d2c.orders
  }
  if (sources.retail) {
    out.rev_retail       = retail.revenue
    out.ord_retail       = retail.ordersWw + retail.ordersOther
    out.ord_retail_ww    = retail.ordersWw
    out.ord_retail_other = retail.ordersOther
  }
  for (const g of groups) {
    // Sales units = D2C + Retail, so both files must be present — otherwise a
    // retail-only (or D2C-only) import would halve the month's units.
    if (sources.d2c && sources.retail) out[`units_${g}`] = d2c.units[g] + retail.units[g]
    // Samples are tracked separately (indicative).
    if (sources.samples) out[`smpl_${g}`] = samples[g]
  }
  return out
}

/** The YYYY-MM months a parsed export actually covers, for error messages. */
export function monthsCovered(rows: Array<Record<string, unknown>>, dateField: string): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    const m = monthOf(r[dateField])
    if (/^\d{4}-\d{2}$/.test(m)) seen.add(m)
  }
  return Array.from(seen).sort()
}

// ============================================================
// Retail (Upstock) → canonical product mapping
// Confirmed with Lance. Each Upstock product maps to an FG- product and a
// pack size (units per Upstock line) so retail counts in single units, like
// D2C. SRC-/SHIP- codes also resolve by suffix as a fallback for new flavours;
// the barcode "FS … Shipper" display units must be listed explicitly.
// ============================================================
export interface RetailMatch { sku: string; pack: number }

export const RETAIL_MAP: Record<string, RetailMatch> = {
  'SRC-ODI-PCH-BRY':  { sku: 'FG-ODI-PCH-BRY',  pack: 6 },
  'SRC-ODI-PCH-CKN':  { sku: 'FG-ODI-PCH-CKN',  pack: 6 },
  'SRC-ODI-PCH-VAN':  { sku: 'FG-ODI-PCH-VAN',  pack: 6 },
  'SRC-ODI-PCH-VEG':  { sku: 'FG-ODI-PCH-VEG',  pack: 6 },
  'SRC-ODI-SAC-BRO':  { sku: 'FG-ODI-SAC-BRO',  pack: 15 },
  'SRC-ODI-SAC-CAR':  { sku: 'FG-ODI-SAC-CAR',  pack: 15 },
  'SRC-ODI-SAC-BET':  { sku: 'FG-ODI-SAC-BET',  pack: 15 },
  'SRC-ODI-SAC-BLU':  { sku: 'FG-ODI-SAC-BLU',  pack: 15 },
  'SRC-ODI-SAC-BCR':  { sku: 'FG-ODI-SAC-BCR',  pack: 15 },
  'SRC-ODI-BITE-BAN': { sku: 'FG-ODI-BITE-BAN', pack: 5 },
  'SRC-ODI-BITE-BRN': { sku: 'FG-ODI-BITE-BRN', pack: 5 },
  'SRC-ODI-BAL-COA':  { sku: 'FG-ODI-BAL-COA',  pack: 6 },
  'SRC-ODI-CCO-VAN':  { sku: 'FG-ODI-CCO-VAN',  pack: 6 },
  'SHIP-ODI-TUB-BC':  { sku: 'FG-ODI-TUB-BC',   pack: 4 },
  'SHIP-ODI-TUB-SB':  { sku: 'FG-ODI-TUB-SB',   pack: 4 },
  'SHIP-ODI-TUB-BBB': { sku: 'FG-ODI-TUB-BBB',  pack: 4 },
  'SHIP-ODI-TUB-MB':  { sku: 'FG-ODI-TUB-MB',   pack: 4 },
  // "FS … Shipper" display units (barcode SKUs) — marketing names, confirmed by Lance
  '9421907651408':    { sku: 'FG-ODI-SAC-BRO',  pack: 25 }, // Growing Greens → Broccoli
  '9421907651385':    { sku: 'FG-ODI-SAC-BLU',  pack: 25 }, // Blooming Blueberry → Blueberry
  '9421907651392':    { sku: 'FG-ODI-SAC-CAR',  pack: 25 }, // Pumpkin & Carrot → Carrot
  '9421907651378':    { sku: 'FG-ODI-SAC-BET',  pack: 25 }, // Flourishing Cauli → Beetroot
  '9421907651354':    { sku: 'FG-ODI-TUB-BC',   pack: 4 },  // Baby Cereal Tub Shipper
  '9421907651330':    { sku: 'FG-ODI-TUB-BBB',  pack: 4 },  // Bone Broth Tub Shipper
}

/**
 * LEGACY fallback: export `FG-` codes → the long `ODI-…` codes the product
 * master used before it was renamed to FG- codes.
 *
 * The master now stores FG- codes directly, so the FG code itself is always
 * tried FIRST (see `resolveProductSku`) and this table is only consulted for
 * products that still carry an old code (currently the Carrot and Baby Cereal
 * sachets). Do NOT translate blind — every entry here whose target no longer
 * exists would silently drop that product's sales.
 */
export const FG_TO_SYSTEM: Record<string, string> = {
  'FG-ODI-PCH-BRY':  'ODI-BABY-PURE-BERR-POUCH-120G',
  'FG-ODI-PCH-CKN':  'ODI-BABY-PURE-CHIC-POUCH-120G',
  'FG-ODI-PCH-VAN':  'ODI-BABY-PURE-VANI-POUCH-120G',
  'FG-ODI-PCH-VEG':  'ODI-BABY-PURE-VEGG-POUCH-120G',
  'FG-ODI-SAC-BCR':  'ODI-ODI-BABY-PURE-SACHET-20G',
  'FG-ODI-SAC-BET':  'ODI-BABY-PURE-BEET-SACHET-20G',
  'FG-ODI-SAC-BLU':  'ODI-BABY-PURE-BLUE-SACHET-20G',
  'FG-ODI-SAC-BRO':  'ODI-BABY-PURE-BROC-SACHET-20G',
  'FG-ODI-SAC-CAR':  'ODI-BABY-PURE-CARR-SACHET-20G',
  'FG-ODI-BITE-BAN': 'ODI-ODI-ORGA-BANA-SNACK4-30G',
  'FG-ODI-BITE-BRN': 'ODI-ODI-ORGA-BROW-SNACK4-30G',
  'FG-ODI-BITE-CHC': 'ODI-ODI-ORGA-CHER-SNACK4-30G',
  'FG-ODI-BAL-CAS':  'ODI-ODI-ORGA-CASH-SNACK4-20G',
  'FG-ODI-BAL-COA':  'ODI-ODI-ORGA-COCO-SNACK4-20G',
  'FG-ODI-CCO-SUN':  'ODI-ODI-ORGA-SUNF-SNACK4-20G',
  'FG-ODI-CCO-VAN':  'ODI-ODI-ORGA-VANI-SNACK4-20G',
  'FG-ODI-TUB-BC':   'ODI-ODI-ORGA-BABY-TUB-150G',
  'FG-ODI-TUB-BBB':  'ODI-ODI-ORGA-BEEF-TUB-125G',
  'FG-ODI-TUB-MB':   'ODI-ODI-ORGA-MEAL-TUB-125G',
  'FG-ODI-TUB-SB':   'ODI-ODI-ORGA-SMOO-TUB-125G',
  // Legacy / pre-rebrand SKUs
  'ODIMEAL':         'ODI-ODI-ORGA-MEAL-TUB-125G', // "NutriDense Meal Booster" → Meal Booster
}

/** Every sku_code an export FG- code could be stored under, best first:
 *  the FG code itself, then its legacy long code. Used to build the lookup
 *  query so both naming schemes can coexist in the product master. */
export function candidateSkus(fgSku: string): string[] {
  const legacy = FG_TO_SYSTEM[fgSku]
  return legacy && legacy !== fgSku ? [fgSku, legacy] : [fgSku]
}

/** Pick the sku_code this FG- code actually exists under in the product
 *  master, or null when the product isn't there at all. */
export function resolveProductSku(fgSku: string, known: ReadonlyMap<string, unknown> | ReadonlySet<string>): string | null {
  const has = (k: string) => (known instanceof Map ? known.has(k) : (known as ReadonlySet<string>).has(k))
  return candidateSkus(fgSku).find(has) ?? null
}

/** Translate an export FG- code to its legacy system SKU (identity if unmapped).
 *  @deprecated Prefer `resolveProductSku` — blind translation drops any product
 *  whose master code has since been renamed to the FG- scheme. */
export function toSystemSku(fgSku: string): string {
  return FG_TO_SYSTEM[fgSku] ?? fgSku
}

/** Pack size embedded in an Upstock product name ("x 6 Pack", "20g x 15", "25 x 20g"). */
export function parsePack(name: string): number {
  const n = name.toLowerCase()
  let m = n.match(/x\s*(\d+)\s*pack/) || n.match(/(\d+)\s*pack/)
  if (m) return Number(m[1])
  m = n.match(/(\d+)\s*x\s*\d+\s*g/)        // "25 x 20g" shipper
  if (m) return Number(m[1])
  m = n.match(/\d+\s*g\s*x\s*(\d+)/)         // "20g x 15"
  if (m) return Number(m[1])
  m = n.match(/x\s*(\d+)/)
  if (m) return Number(m[1])
  return 1
}

/** Resolve an Upstock line to a canonical FG sku + pack size, or null. */
export function resolveRetail(code: string, name: string): RetailMatch | null {
  if (RETAIL_MAP[code]) return RETAIL_MAP[code]
  // Fallback for new SRC-/SHIP- flavours: suffix → FG- sku, pack from name.
  if (/^(SRC|SHIP)-ODI-/i.test(code)) {
    return { sku: 'FG-' + code.slice(code.indexOf('-') + 1), pack: parsePack(name) }
  }
  return null
}

/** Australia went live on 29 Aug 2026 — the first day of the Sydney expo, when
 *  AU stock started being sold from. From that day D2C orders shipping to AU
 *  are fulfilled from Australian stock and belong to the AU channel. Earlier AU
 *  orders went out on NZ stock, so they stay against NZ. */
export const AU_FULFILMENT_FROM = '2026-08-29'

/** "2026-08-31 23:54:55 +1200" → "2026-08-31". */
export function dayOf(s: unknown): string {
  return String(s ?? '').trim().slice(0, 10)
}

export interface PerProduct {
  d2c: Record<string, number>      // sku → single units (NZ-fulfilled)
  d2cAu: Record<string, number>    // AU-fulfilled, from AU_FULFILMENT_FROM
  retail: Record<string, number>
  samples: Record<string, number>
  unmatchedRetail: string[]        // Upstock codes we couldn't resolve
}

/** Per-product single-unit totals by channel for `ym`, keyed by FG sku. */
export function perProductUnits(shopify: Row[], upstock: Row[], samplesAoa: unknown[][], ym: string): PerProduct {
  const d2c: Record<string, number> = {}
  const d2cAu: Record<string, number> = {}
  const retail: Record<string, number> = {}
  const samples: Record<string, number> = {}
  const unmatched = new Set<string>()

  // D2C — Shopify line items (singles). An order spans several rows and only
  // its first row carries the shipping address, so the destination is carried
  // down the rest of the order (keyed on Name — "Created at" repeats on every
  // row, so it can't mark where an order starts).
  let cur: string | null = null
  let curName = ''
  let curDay = ''
  let curAu = false
  for (const r of shopify) {
    const created = str(r['Created at'])
    if (created) { cur = monthOf(created); curDay = dayOf(created) }
    const name = str(r['Name'])
    if (name && name !== curName) { curName = name; curAu = false }
    const country = (str(r['Shipping Country']) || str(r['Billing Country'])).toUpperCase()
    if (country) curAu = country === 'AU' && curDay >= AU_FULFILMENT_FROM
    if (str(r['Cancelled at'])) continue
    if (cur !== ym) continue
    const sku = str(r['Lineitem sku'])
    const qty = num(r['Lineitem quantity'])
    if (!sku || !qty) continue
    const bucket = curAu ? d2cAu : d2c
    bucket[sku] = (bucket[sku] ?? 0) + qty
  }

  // Retail — Upstock, mapped to FG sku × pack size.
  for (const r of upstock) {
    if (monthOf(r['Created Date']) !== ym) continue
    const code = str(r['Product Code'])
    if (!code) continue
    const match = resolveRetail(code, str(r['Product Name']))
    if (!match) { unmatched.add(code); continue }
    retail[match.sku] = (retail[match.sku] ?? 0) + num(r['Quantity']) * match.pack
  }

  // Samples — MONTHLY TOTAL row across FG sku columns.
  let skuRow: unknown[] | null = null
  let totalRow: unknown[] | null = null
  for (const row of samplesAoa) {
    if (!skuRow && row.some((c) => str(c).startsWith('FG-ODI'))) skuRow = row
    if (!totalRow && str(row[0]).toUpperCase().startsWith('MONTHLY TOTAL')) totalRow = row
  }
  if (skuRow && totalRow) {
    for (let c = 0; c < skuRow.length; c++) {
      const sku = str(skuRow[c])
      if (sku.startsWith('FG-ODI')) samples[sku] = (samples[sku] ?? 0) + num(totalRow[c])
    }
  }

  return { d2c, d2cAu, retail, samples, unmatchedRetail: Array.from(unmatched) }
}

const MONTH_NUM: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
}

/**
 * Parse the wide "Stock Write off Tracker" sheet into per-row write-offs.
 * Layout: [Date(month name), SKU, Category, Notes, …one column per product].
 * The quantity sits in the product's own column, so units = sum of the numeric
 * quantity columns (cols 4+) for that row. Each row's month is mapped to a FY
 * month key via `monthByNum` (month number → 'YYYY-MM-01'), so one upload can
 * cover several months. Non-data rows (title, headers, unit-cost) are skipped.
 */
export function writeoffsFromTracker(
  aoa: unknown[][],
  monthByNum: Map<number, string>,
): Array<{ year_month: string; fg: string; units: number; reason: string }> {
  const out: Array<{ year_month: string; fg: string; units: number; reason: string }> = []
  for (const row of aoa) {
    if (!row || row.length < 5) continue
    const mNum = MONTH_NUM[str(row[0]).toLowerCase()]
    if (!mNum) continue                                   // not a data row
    const ym = monthByNum.get(mNum)
    if (!ym) continue                                     // month outside this FY
    const fg = str(row[1])
    if (!fg.toUpperCase().startsWith('FG-')) continue     // needs a real SKU
    let units = 0
    for (let c = 4; c < row.length; c++) {
      const v = Number(str(row[c]).replace(/[, ]/g, ''))
      if (Number.isFinite(v)) units += v
    }
    if (units <= 0) continue
    const reason = [str(row[2]), str(row[3])].filter(Boolean).join(' — ')  // Category — Notes
    out.push({ year_month: ym, fg, units, reason })
  }
  return out
}

/** "2026-07-01" → "July 2026" (canonical sample tracker sheet name). */
export function sampleSheetName(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[m - 1]} ${y}`
}

/** The sample tracker's sheet for `yearMonth`, or null.
 *  Tabs are named by hand and mix full and shortened months ("July 2026" but
 *  "Aug 2026", "Sept 2026"), so match on the first three letters plus the year
 *  — in 2- or 4-digit form — rather than requiring one exact spelling. */
export function findSampleSheet(sheetNames: string[], yearMonth: string): string | null {
  const [y, m] = yearMonth.split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const abbr = names[m - 1].slice(0, 3).toLowerCase()
  const re = new RegExp(`^${abbr}[a-z]*\\.?\\s*'?(${y}|${String(y).slice(2)})$`, 'i')
  return sheetNames.find((n) => re.test(n.trim())) ?? null
}
