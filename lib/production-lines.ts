/**
 * Production lines — the one calculation behind the Production schedule AND
 * the dashboard's production shortfall strip, so the two always agree.
 *
 * A line is a product made by one maker for one market. Products that sell to
 * Australia (or have an AU maker) split into an NZ line (NZ demand, NZ plan)
 * and an AU line (AU demand, AU plan); others keep a single NZ line driven by
 * all-channel demand. Opening stock is the Stock Movements closing (EOM) of
 * the last closed month, and NZ ↔ AU transfers move stock between lines.
 */
import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  indexDemand, indexProduction,
  getGrandTotal, getCountryTotal, getProductionCell, calcRollingBalance,
} from '@/lib/demand'
import { loadStockLedger, closingStockAt, type StockLedger } from '@/lib/stock-movements-data'
import type { TransferDetail } from '@/lib/transfer-stock'
import type { DemandForecast, ProductionPlan } from '@/lib/types/database.types'

type SB = ReturnType<typeof createClient>

export interface ProductionProduct {
  id: string
  sku_code: string
  name: string
  manufacturer: string | null
  manufacturer_au: string | null
  opening_stock_override: number | null
  is_active: boolean
}

export interface ProductionLine {
  key: string
  product: ProductionProduct
  market: 'NZ' | 'AU'
  maker: string | null
  opening: number
  forecastByMonth: Record<string, number>
  productionByMonth: Record<string, number>
  /** NZ ↔ AU transfer legs landing on / leaving this line, per month. */
  transfersByMonth: Record<string, TransferDetail[]>
  /** True when the product is split into NZ + AU lines (show the market tag). */
  showTag: boolean
  /** Markets whose POs / transfers belong to this line. */
  markets: Array<'NZ' | 'AU'>
}

export interface ProductionLinesResult {
  products: ProductionProduct[]
  lines: ProductionLine[]
  ledger: StockLedger
}

export async function loadProductionLines(supabase: SB, months: string[]): Promise<ProductionLinesResult> {
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const [{ data: products }, demand, { data: production }, ledger] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku_code, name, manufacturer, manufacturer_au, opening_stock_override, is_active')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('manufacturer', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }) as unknown as Promise<{ data: ProductionProduct[] | null }>,
    fetchAllRows<DemandForecast>((from, to) =>
      supabase
        .from('demand_forecasts')
        .select('product_id, year_month, channel, units, is_edited')
        .gte('year_month', firstMonth)
        .lte('year_month', lastMonth)
        .order('product_id').order('year_month').order('channel')
        .range(from, to) as unknown as PromiseLike<{ data: DemandForecast[] | null; error: { message: string } | null }>,
    ),
    supabase
      .from('production_plans')
      .select('product_id, year_month, units_planned, market')
      .gte('year_month', firstMonth)
      .lte('year_month', lastMonth) as unknown as Promise<{ data: Array<ProductionPlan & { market: string | null }> | null }>,
    loadStockLedger(),
  ])

  const allProducts = products ?? []
  const demandIdx = indexDemand(demand)
  // Production is planned per market; legacy rows default to NZ.
  const prodRows  = production ?? []
  const prodIdxNz = indexProduction(prodRows.filter((r) => (r.market ?? 'NZ') !== 'AU'))
  const prodIdxAu = indexProduction(prodRows.filter((r) => r.market === 'AU'))

  // Opening = closing (EOM) of the last closed month from Stock Movements.
  const closing = closingStockAt(ledger.rows, ledger.actualThrough)
  const openingFor = (pid: string, market: 'NZ' | 'AU'): number =>
    (market === 'AU' ? closing.get(pid)?.AU : closing.get(pid)?.NZ) ?? 0

  const byMonth = (fn: (m: string) => number): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const m of months) out[m] = fn(m)
    return out
  }
  // A single-line product carries both transfer legs (net zero).
  const transfersFor = (pid: string, markets: Array<'NZ' | 'AU'>): Record<string, TransferDetail[]> => {
    const out: Record<string, TransferDetail[]> = {}
    for (const m of months) {
      const list = markets.flatMap((mk) => ledger.transfers[mk].get(pid)?.get(m) ?? [])
      if (list.length) out[m] = list
    }
    return out
  }

  const lines: ProductionLine[] = []
  for (const p of allProducts) {
    const dual = !!(p.manufacturer_au && p.manufacturer_au.trim())
    const hasAu = dual || months.some((m) => getCountryTotal(demandIdx, p.id, m, 'AUS') > 0)
    const nzMarkets: Array<'NZ' | 'AU'> = hasAu ? ['NZ'] : ['NZ', 'AU']
    lines.push({
      key: `${p.id}:NZ`, product: p, market: 'NZ', maker: p.manufacturer,
      opening: openingFor(p.id, 'NZ'),
      forecastByMonth:  byMonth((m) => hasAu ? getCountryTotal(demandIdx, p.id, m, 'NZ') : getGrandTotal(demandIdx, p.id, m)),
      productionByMonth: byMonth((m) => getProductionCell(prodIdxNz, p.id, m)),
      transfersByMonth: transfersFor(p.id, nzMarkets),
      showTag: hasAu,
      markets: nzMarkets,
    })
    if (hasAu) {
      lines.push({
        key: `${p.id}:AU`, product: p, market: 'AU', maker: p.manufacturer_au?.trim() || p.manufacturer,
        opening: openingFor(p.id, 'AU'),
        forecastByMonth:  byMonth((m) => getCountryTotal(demandIdx, p.id, m, 'AUS')),
        // AU production is only what's been planned — no make-to-demand default.
        productionByMonth: byMonth((m) => getProductionCell(prodIdxAu, p.id, m)),
        transfersByMonth: transfersFor(p.id, ['AU']),
        showTag: true,
        markets: ['AU'],
      })
    }
  }

  return { products: allProducts, lines, ledger }
}

export const netTransfers = (list: TransferDetail[] | undefined) => (list ?? []).reduce((s, t) => s + t.units, 0)

/** Per-month { lines with demand, lines short } across the given lines. */
export function productionShortfallCounts(lines: ProductionLine[], months: string[]) {
  const totals = new Map<string, number>(months.map((m) => [m, 0]))
  const shorts = new Map<string, number>(months.map((m) => [m, 0]))
  for (const ln of lines) {
    const rolling = calcRollingBalance(months, ln.opening, (m) => ln.forecastByMonth[m] ?? 0, (m) => ln.productionByMonth[m] ?? 0, (m) => netTransfers(ln.transfersByMonth[m]))
    for (const r of rolling) {
      if (r.forecast > 0)    totals.set(r.month, (totals.get(r.month) ?? 0) + 1)
      if (r.state === 'red') shorts.set(r.month, (shorts.get(r.month) ?? 0) + 1)
    }
  }
  return { totals, shorts }
}
