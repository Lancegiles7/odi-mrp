/**
 * Packaging Stock Movements — the packaging twin of the ingredient ledger
 * (lib/ingredient-stock-movements.ts). Per packaging item, per country (NZ /
 * AU) and combined, rolling forward month by month:
 *
 *   opening + received (open POs + manual) − used (production × packaging list)
 *     − wastage (manual) = system EOM,  overridden by the month-end actual count.
 *
 * Same seed month, horizon, production units and manual adjustments table
 * (entity_type = 'packaging') as ingredients, so both tabs roll on the same
 * months. Returns the ingredient ledger shapes so the same table renders it.
 */
import { createClient } from '@/lib/supabase/server'
import { aggregatePackagingDemand } from '@/lib/packaging-demand'
import { getAppSettings } from '@/lib/settings'
import {
  loadProducedUnits, INGREDIENT_SEED_MONTH, INGREDIENT_HORIZON,
  type IngStockLedger, type IngStockRow, type IngMarketRow, type IngCell, type IngDriver, type Market,
} from '@/lib/ingredient-stock-movements'

function addMonth(m: string): string {
  let y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) + 1
  if (mo > 12) { mo = 1; y++ }
  return `${y}-${String(mo).padStart(2, '0')}-01`
}
const round = (n: number, dp = 2) => { const f = 10 ** dp; return Math.round(n * f) / f }

export async function loadPackagingStockLedger(): Promise<IngStockLedger> {
  const supabase = createClient()
  const settings = await getAppSettings()
  const fx = Number(settings.fx_rates?.AUD) || 1.2

  const SEED_MONTH = INGREDIENT_SEED_MONTH
  const months: string[] = []
  let cur = addMonth(SEED_MONTH)
  for (let i = 0; i < INGREDIENT_HORIZON; i++) { months.push(cur); cur = addMonth(cur) }
  const calcMonths = [SEED_MONTH, ...months]

  const [
    produced, { data: packaging }, { data: suppliers }, { data: links },
    { data: openPos }, { data: openPoLines }, { data: adjustments },
  ] = await Promise.all([
    loadProducedUnits(supabase, calcMonths),
    supabase.from('packaging')
      .select('id, sku_code, name, type, unit_of_measure, supplier_id, total_loaded_cost_nzd, opening_stock_override, opening_stock_override_au')
      .eq('is_active', true) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string; supplier_id: string | null; total_loaded_cost_nzd: number | null; opening_stock_override: number | null; opening_stock_override_au: number | null }> | null }>,
    supabase.from('suppliers').select('id, name') as unknown as Promise<{ data: Array<{ id: string; name: string }> | null }>,
    supabase.from('product_packaging').select('product_id, packaging_id, quantity_per_unit, market') as unknown as Promise<{ data: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number; market: string | null }> | null }>,
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date, market')
      .in('status', ['submitted', 'partially_received'])
      .not('expected_delivery_date', 'is', null) as unknown as Promise<{ data: Array<{ id: string; po_number: string; status: string; expected_delivery_date: string | null; market: string | null }> | null }>,
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, packaging_id, quantity_ordered, quantity_received')
      .not('packaging_id', 'is', null) as unknown as Promise<{ data: Array<{ purchase_order_id: string; packaging_id: string | null; quantity_ordered: number; quantity_received: number }> | null }>,
    supabase.from('stock_period_adjustments')
      .select('entity_id, year_month, market, wastage_units, wastage_comment, counted_units, count_comment, inbound_units, inbound_comment')
      .eq('entity_type', 'packaging') as unknown as Promise<{ data: Array<{ entity_id: string; year_month: string; market: string; wastage_units: number; wastage_comment: string | null; counted_units: number | null; count_comment: string | null; inbound_units: number; inbound_comment: string | null }> | null }>,
  ])
  const { products, unitsNz, unitsAu } = produced

  // Packaging is used where the product is MADE (units are already routed to
  // the make market). A made-in-AU/NZ product whose packaging list only exists
  // for the other build still uses that packaging — at the make market.
  const mmById = new Map(products.map((p) => [p.id, p.manufacture_market]))
  const linkMarkets = new Map<string, Set<string>>()
  for (const l of links ?? []) {
    if (!linkMarkets.has(l.product_id)) linkMarkets.set(l.product_id, new Set())
    linkMarkets.get(l.product_id)!.add((l.market ?? 'NZ') === 'AU' ? 'AU' : 'NZ')
  }
  const routedLinks = (links ?? []).map((l) => {
    const mm = mmById.get(l.product_id)
    const lm = (l.market ?? 'NZ') === 'AU' ? 'AU' : 'NZ'
    if ((mm === 'AU' || mm === 'NZ') && lm !== mm && !linkMarkets.get(l.product_id)!.has(mm)) return { ...l, market: mm }
    return { ...l, market: lm }
  })

  // One pass per market so each market row gets its own used + drivers.
  const pkgInput = (packaging ?? []).map((p) => ({ ...p }))
  const empty = new Map<string, Map<string, number>>(calcMonths.map((m) => [m, new Map()]))
  const runPass = (mk: Market) => aggregatePackagingDemand({
    packaging: pkgInput, suppliers: suppliers ?? [],
    productPackaging: routedLinks.filter((l) => l.market === mk),
    products,
    unitsByMonthByProduct: mk === 'NZ' ? unitsNz : empty,
    unitsAuByMonthByProduct: mk === 'AU' ? unitsAu : empty,
    months: calcMonths,
  })
  type Row = ReturnType<typeof runPass>[number]['packaging'][number]
  const nzRowById = new Map<string, Row>()
  const auRowById = new Map<string, Row>()
  for (const g of runPass('NZ')) for (const r of g.packaging) nzRowById.set(r.packaging.id, r)
  for (const g of runPass('AU')) for (const r of g.packaging) auRowById.set(r.packaging.id, r)

  // ── Inbound (open-PO arrivals, remaining qty) per packaging per market ──
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
  for (const ln of openPoLines ?? []) {
    if (!ln.packaging_id) continue
    const po = poMarketById.get(ln.purchase_order_id)
    if (!po) continue
    const remaining = Math.max(0, Number(ln.quantity_ordered) - Number(ln.quantity_received))
    if (remaining <= 0) continue
    const map = po.market === 'AU' ? inboundAu : inboundNz
    if (!map.has(ln.packaging_id)) map.set(ln.packaging_id, new Map())
    const mm = map.get(ln.packaging_id)!
    mm.set(po.monthKey, (mm.get(po.monthKey) ?? 0) + remaining)
  }

  // ── Manual adjustments (wastage, counts, no-PO inbound) ──
  interface Adj { wastage: number; wComment: string | null; counted: number | null; cComment: string | null; inbound: number; iComment: string | null }
  const adjBy = new Map<string, Adj>()
  for (const a of adjustments ?? []) {
    adjBy.set(`${a.entity_id}|${a.market}|${a.year_month.slice(0, 10)}`, {
      wastage: Number(a.wastage_units) || 0, wComment: a.wastage_comment,
      counted: a.counted_units != null ? Number(a.counted_units) : null, cComment: a.count_comment,
      inbound: Number(a.inbound_units) || 0, iComment: a.inbound_comment,
    })
  }
  const adjOf = (id: string, mk: Market, m: string): Adj =>
    adjBy.get(`${id}|${mk}|${m}`) ?? { wastage: 0, wComment: null, counted: null, cComment: null, inbound: 0, iComment: null }

  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]))

  const rows: IngStockRow[] = []
  for (const pk of packaging ?? []) {
    const costNz = Number(pk.total_loaded_cost_nzd) || 0
    const costAu = costNz > 0 ? costNz / fx : 0   // packaging carries an NZ$ cost only

    const buildMarket = (mk: Market, usedRow: Row | undefined, inboundMap: Map<string, Map<string, number>>, cost: number): IngMarketRow => {
      const seed = adjOf(pk.id, mk, SEED_MONTH)
      const opening = seed.counted ?? 0
      const cells: Record<string, IngCell> = {}
      let prevEom = opening
      for (const m of months) {
        const inboundPo = inboundMap.get(pk.id)?.get(m) ?? 0
        const adj = adjOf(pk.id, mk, m)
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

    const nz = buildMarket('NZ', nzRowById.get(pk.id), inboundNz, costNz)
    const au = buildMarket('AU', auRowById.get(pk.id), inboundAu, costAu)

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

    rows.push({
      entity_id: pk.id, sku: pk.sku_code, name: pk.name, uom: pk.unit_of_measure || 'each',
      supplier_id: pk.supplier_id,
      supplier_name: pk.supplier_id ? (supplierName.get(pk.supplier_id) ?? 'Supplier not set') : 'Supplier not set',
      nz, au, total,
      // Every active item is listed (not only ones with activity) — the ledger
      // starts blank, so counts have to be enterable on everything.
      hasActivity: true,
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))
  return { rows, months, seedMonth: SEED_MONTH, fx }
}
