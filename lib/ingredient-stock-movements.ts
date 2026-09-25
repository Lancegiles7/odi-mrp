/**
 * Ingredient Stock Movements — a running stocktake per ingredient, per country
 * (NZ / AU) and combined, rolling forward month by month:
 *
 *   opening + received (open POs) − used (production × recipe) − wastage (manual)
 *     = system EOM,  overridden by the month-end actual count.
 *
 * The end-of-July count seeds each ledger; August onward is forecast. "Used"
 * matches the production plan (reuses aggregateIngredientDemand for the figures
 * AND the per-SKU driver breakdown). Wastage and counts come from the manual
 * stock_period_adjustments table.
 */
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { indexProduction, getProductionCell } from '@/lib/demand'
import {
  aggregateIngredientDemand, demandUnitLabel, convertGramsToIngredientUom,
} from '@/lib/ingredient-demand'
import { getAppSettings } from '@/lib/settings'

const SEED_MONTH = '2026-07-01'   // end-of-July raw count seeds the ledger
const HORIZON = 13                // months of forecast columns (Aug 2026 → …)

export type Market = 'NZ' | 'AU'

export interface IngDriver { product_id: string; sku: string; name: string; used: number }
export interface IngCell {
  inbound: number          // total in = PO arrivals + manual
  inboundPo: number        // from open POs
  inboundManual: number    // manually entered (no PO)
  inboundComment: string | null
  used: number
  wastage: number
  system: number
  counted: number | null
  eom: number
  value: number            // NZ row → NZD, AU row → AUD, Total row → NZD
  wastageComment: string | null
  countComment: string | null
  drivers: IngDriver[]
}
export interface IngMarketRow {
  market: 'NZ' | 'AU' | 'TOTAL'
  opening: number          // end-July count (seed) — also the count entry for July
  openingComment: string | null
  cells: Record<string, IngCell>
}
export interface IngStockRow {
  entity_id: string
  sku: string
  name: string
  uom: string
  supplier_id: string | null
  supplier_name: string
  nz: IngMarketRow
  au: IngMarketRow
  total: IngMarketRow
  hasActivity: boolean
}
export interface IngStockLedger {
  rows: IngStockRow[]
  months: string[]         // forecast columns, Aug 2026 onward
  seedMonth: string
  fx: number
}

function addMonth(m: string): string {
  let y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) + 1
  if (mo > 12) { mo = 1; y++ }
  return `${y}-${String(mo).padStart(2, '0')}-01`
}
const round = (n: number, dp = 2) => { const f = 10 ** dp; return Math.round(n * f) / f }

export async function loadIngredientStockLedger(): Promise<IngStockLedger> {
  const supabase = createClient()
  const settings = await getAppSettings()
  const fx = Number(settings.fx_rates?.AUD) || 1.2

  // Forecast columns: Aug 2026 → horizon. Plus the seed month for consumption.
  const months: string[] = []
  let cur = addMonth(SEED_MONTH)
  for (let i = 0; i < HORIZON; i++) { months.push(cur); cur = addMonth(cur) }
  const calcMonths = [SEED_MONTH, ...months]   // used/inbound also computed for July (unused) → keep simple

  const [
    { data: products }, { data: ingredients }, { data: suppliers },
    { data: boms }, { data: bomItems }, { data: production },
    { data: openPos }, { data: openPoLines }, { data: adjustments },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, sku_code, name, wastage_pct, manufacture_market')
      .is('deleted_at', null) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; wastage_pct: number | null; manufacture_market: string | null }> | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure, supplier_id, total_loaded_cost, total_loaded_cost_au, yield_pct')
      .eq('is_active', true)
      // Purchased ingredients only. Snack-category ingredients are supplied by
      // the snack manufacturer — Odi never holds that stock, so tracking it here
      // would show a stocktake nobody counts.
      .eq('category', 'purchased') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; unit_of_measure: string | null; supplier_id: string | null; total_loaded_cost: number | null; total_loaded_cost_au: number | null; yield_pct: number | null }> | null }>,
    supabase.from('suppliers').select('id, name') as unknown as Promise<{ data: Array<{ id: string; name: string }> | null }>,
    supabase.from('boms').select('id, product_id, is_active, market').eq('is_active', true) as unknown as Promise<{ data: Array<{ id: string; product_id: string; is_active: boolean; market: string | null }> | null }>,
    supabase.from('bom_items').select('bom_id, ingredient_id, quantity_g, wet_quantity_g, unit_quantity') as unknown as Promise<{ data: Array<{ bom_id: string; ingredient_id: string; quantity_g: number; wet_quantity_g: number | null; unit_quantity: number | null }> | null }>,
    supabase.from('production_plans')
      .select('product_id, year_month, units_planned, market')
      .gte('year_month', SEED_MONTH) as unknown as Promise<{ data: Array<{ product_id: string; year_month: string; units_planned: number; market: string | null }> | null }>,
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date, market')
      .in('status', ['submitted', 'partially_received'])
      .not('expected_delivery_date', 'is', null) as unknown as Promise<{ data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null }> | null }>,
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, ingredient_id, quantity_ordered, quantity_received, unit_of_measure')
      .not('ingredient_id', 'is', null) as unknown as Promise<{ data: Array<{ purchase_order_id: string; ingredient_id: string | null; quantity_ordered: number; quantity_received: number; unit_of_measure: string }> | null }>,
    supabase.from('stock_period_adjustments')
      .select('entity_id, year_month, market, wastage_units, wastage_comment, counted_units, count_comment, inbound_units, inbound_comment')
      .eq('entity_type', 'ingredient') as unknown as Promise<{ data: Array<{ entity_id: string; year_month: string; market: string; wastage_units: number; wastage_comment: string | null; counted_units: number | null; count_comment: string | null; inbound_units: number; inbound_comment: string | null }> | null }>,
  ])

  // ── BOM lookups per market ──
  const activeBomByProduct = new Map<string, string>()
  const activeBomByProductAu = new Map<string, string>()
  for (const b of boms ?? []) {
    if ((b.market ?? 'NZ') === 'AU') activeBomByProductAu.set(b.product_id, b.id)
    else activeBomByProduct.set(b.product_id, b.id)
  }
  const bomItemsByBom = new Map<string, Array<{ ingredient_id: string; quantity_g: number; wet_quantity_g: number | null; unit_quantity: number | null }>>()
  for (const it of bomItems ?? []) {
    if (!bomItemsByBom.has(it.bom_id)) bomItemsByBom.set(it.bom_id, [])
    bomItemsByBom.get(it.bom_id)!.push(it)
  }

  // ── Produced units per product per month, split by build market ──
  const prodIdxNz = indexProduction(((production ?? []) as Array<{ market: string | null }>).filter((r) => (r.market ?? 'NZ') !== 'AU') as never[])
  const prodIdxAu = indexProduction(((production ?? []) as Array<{ market: string | null }>).filter((r) => r.market === 'AU') as never[])
  const unitsNz = new Map<string, Map<string, number>>()
  const unitsAu = new Map<string, Map<string, number>>()
  for (const m of calcMonths) { unitsNz.set(m, new Map()); unitsAu.set(m, new Map()) }
  for (const p of products ?? []) {
    const isDual = activeBomByProductAu.has(p.id)
    // Ingredient consumption follows where the product is MANUFACTURED, not where
    // it's sold. A made-in-AU product's NZ-demand production is still made in AU,
    // so all its usage runs through the AU build; made-in-NZ, the reverse. Only
    // 'BOTH'/unset keep the per-market production split.
    const mm = (p as { manufacture_market: string | null }).manufacture_market
    for (const m of calcMonths) {
      const nz = getProductionCell(prodIdxNz, p.id, m) || 0
      const au = isDual ? (getProductionCell(prodIdxAu, p.id, m) || 0) : 0
      if (mm === 'AU' && isDual) {
        if (nz + au) unitsAu.get(m)!.set(p.id, nz + au)          // all consumed in AU
      } else if (mm === 'NZ') {
        if (nz + au) unitsNz.get(m)!.set(p.id, nz + au)          // all consumed in NZ
      } else {
        if (nz) unitsNz.get(m)!.set(p.id, nz)
        if (isDual && au) unitsAu.get(m)!.set(p.id, au)
      }
    }
  }
  const empty = new Map<string, Map<string, number>>(calcMonths.map((m) => [m, new Map()]))

  // ── Used + per-SKU drivers, one aggregate pass per market ──
  const runPass = (unitsNzArg: Map<string, Map<string, number>>, unitsAuArg: Map<string, Map<string, number>> | undefined, auBom: Map<string, string> | undefined) =>
    aggregateIngredientDemand({
      ingredients: ingredients ?? [], suppliers: suppliers ?? [],
      activeBomByProduct, activeBomByProductAu: auBom, bomItemsByBom,
      products: products ?? [], unitsByMonthByProduct: unitsNzArg, unitsAuByMonthByProduct: unitsAuArg,
      months: calcMonths,
    } as never)
  const groupsNz = runPass(unitsNz, undefined, undefined)
  const groupsAu = runPass(empty, unitsAu, activeBomByProductAu)

  type Row = ReturnType<typeof runPass>[number]['ingredients'][number]
  const nzRowById = new Map<string, Row>()
  const auRowById = new Map<string, Row>()
  for (const g of groupsNz) for (const r of g.ingredients) nzRowById.set(r.ingredient.id, r)
  for (const g of groupsAu) for (const r of g.ingredients) auRowById.set(r.ingredient.id, r)

  // ── Inbound (open-PO arrivals) per ingredient per market ──
  const ingById = new Map((ingredients ?? []).map((i) => [i.id, i]))
  const poMarketById = new Map<string, { market: Market; monthKey: string }>()
  for (const po of openPos ?? []) {
    if (!po.expected_delivery_date) continue
    const raw = po.expected_delivery_date.slice(0, 7) + '-01'
    const monthKey = raw < months[0] ? months[0] : raw
    if (!months.includes(monthKey)) continue
    poMarketById.set(po.id, { market: po.market === 'AU' ? 'AU' : 'NZ', monthKey })
  }
  const inboundNz = new Map<string, Map<string, number>>()
  const inboundAu = new Map<string, Map<string, number>>()
  const addInbound = (map: Map<string, Map<string, number>>, ing: string, m: string, q: number) => {
    if (!map.has(ing)) map.set(ing, new Map())
    const mm = map.get(ing)!; mm.set(m, (mm.get(m) ?? 0) + q)
  }
  for (const ln of openPoLines ?? []) {
    if (!ln.ingredient_id) continue
    const po = poMarketById.get(ln.purchase_order_id)
    if (!po) continue
    const remaining = Math.max(0, Number(ln.quantity_ordered) - Number(ln.quantity_received))
    if (remaining <= 0) continue
    const ing = ingById.get(ln.ingredient_id)
    const lineUom = (ln.unit_of_measure ?? '').trim().toLowerCase()
    const ingUom = (ing?.unit_of_measure ?? '').trim().toLowerCase()
    const qty = ((ingUom === 'kg' || ingUom === 'g' || ingUom === '') && lineUom === 'g')
      ? convertGramsToIngredientUom(remaining, ing?.unit_of_measure ?? null) : remaining
    addInbound(po.market === 'AU' ? inboundAu : inboundNz, ln.ingredient_id, po.monthKey, qty)
  }

  // ── Manual adjustments (wastage + counts) ──
  interface Adj { wastage: number; wComment: string | null; counted: number | null; cComment: string | null; inbound: number; iComment: string | null }
  const adjBy = new Map<string, Adj>()   // key: ingId|market|month
  for (const a of adjustments ?? []) {
    const key = `${a.entity_id}|${a.market}|${a.year_month.slice(0, 10)}`
    adjBy.set(key, {
      wastage: Number(a.wastage_units) || 0,
      wComment: a.wastage_comment,
      counted: a.counted_units != null ? Number(a.counted_units) : null,
      cComment: a.count_comment,
      inbound: Number(a.inbound_units) || 0,
      iComment: a.inbound_comment,
    })
  }
  const adjOf = (ing: string, mk: Market, m: string): Adj =>
    adjBy.get(`${ing}|${mk}|${m}`) ?? { wastage: 0, wComment: null, counted: null, cComment: null, inbound: 0, iComment: null }

  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]))

  // ── Roll each ingredient's ledger ──
  const rows: IngStockRow[] = []
  for (const ing of ingredients ?? []) {
    const uom = demandUnitLabel(ing.unit_of_measure)
    const costNz = Number(ing.total_loaded_cost) || 0
    const costAu = ing.total_loaded_cost_au != null ? Number(ing.total_loaded_cost_au) : (costNz > 0 ? costNz / fx : 0)

    const buildMarket = (
      mk: Market, usedRow: Row | undefined, inboundMap: Map<string, Map<string, number>>, cost: number,
    ): IngMarketRow => {
      const seed = adjOf(ing.id, mk, SEED_MONTH)
      const opening = seed.counted ?? 0
      const cells: Record<string, IngCell> = {}
      let prevEom = opening
      for (const m of months) {
        const inboundPo = inboundMap.get(ing.id)?.get(m) ?? 0
        const adj = adjOf(ing.id, mk, m)
        const inbound = inboundPo + adj.inbound
        const used = usedRow?.demandByMonth.get(m) ?? 0
        const system = round(prevEom + inbound - used - adj.wastage, 3)
        const eom = adj.counted != null ? adj.counted : system
        const drivers: IngDriver[] = (usedRow?.products ?? [])
          .map((p) => ({ product_id: p.id, sku: p.sku_code, name: p.name, used: round(p.demandByMonth.get(m) ?? 0, 3) }))
          .filter((d) => d.used > 0)
        cells[m] = {
          inbound: round(inbound, 3), inboundPo: round(inboundPo, 3), inboundManual: adj.inbound, inboundComment: adj.iComment,
          used: round(used, 3), wastage: adj.wastage,
          system, counted: adj.counted, eom: round(eom, 3), value: round(eom * cost, 2),
          wastageComment: adj.wComment, countComment: adj.cComment, drivers,
        }
        prevEom = eom
      }
      return { market: mk, opening, openingComment: seed.cComment, cells }
    }

    const nz = buildMarket('NZ', nzRowById.get(ing.id), inboundNz, costNz)
    const au = buildMarket('AU', auRowById.get(ing.id), inboundAu, costAu)

    // Total = NZ + AU per column; value in NZD (AU converted at FX).
    const totalCells: Record<string, IngCell> = {}
    for (const m of months) {
      const a = nz.cells[m], b = au.cells[m]
      totalCells[m] = {
        inbound: round(a.inbound + b.inbound, 3), inboundPo: round(a.inboundPo + b.inboundPo, 3),
        inboundManual: round(a.inboundManual + b.inboundManual, 3), inboundComment: null,
        used: round(a.used + b.used, 3),
        wastage: round(a.wastage + b.wastage, 3), system: round(a.system + b.system, 3),
        counted: null, eom: round(a.eom + b.eom, 3), value: round(a.value + b.value * fx, 2),
        wastageComment: null, countComment: null, drivers: [],
      }
    }
    const total: IngMarketRow = { market: 'TOTAL', opening: nz.opening + au.opening, openingComment: null, cells: totalCells }

    const hasActivity = nz.opening !== 0 || au.opening !== 0 ||
      months.some((m) => nz.cells[m].inbound || nz.cells[m].used || au.cells[m].inbound || au.cells[m].used || nz.cells[m].wastage || au.cells[m].wastage)

    rows.push({
      entity_id: ing.id, sku: ing.sku_code, name: ing.name, uom,
      supplier_id: ing.supplier_id, supplier_name: ing.supplier_id ? (supplierName.get(ing.supplier_id) ?? 'Supplier not set') : 'Supplier not set',
      nz, au, total, hasActivity,
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))
  return { rows: rows.filter((r) => r.hasActivity), months, seedMonth: SEED_MONTH, fx }
}
