import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  rollingMonths, indexDemand, indexProduction,
  getGrandTotal, getProductionCell, resolveOpeningStock, monthLabel,
} from '@/lib/demand'
import { MANUFACTURER_CHIP_COLOURS } from '@/lib/constants'
import { ProductionRow } from '@/components/production/production-row'
import { ManufacturerFilter } from '@/components/production/manufacturer-filter'
import type { DemandForecast, ProductionPlan } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Production schedule' }

interface ProductRow {
  id: string
  sku_code: string
  name: string
  manufacturer: string | null
  opening_stock_override: number | null
  is_active: boolean
}

interface PageProps {
  searchParams: { view?: string; manufacturer?: string }
}

export default async function ProductionPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const months = rollingMonths()
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const [{ data: products }, { data: demand }, { data: production }, { data: inventory }] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku_code, name, manufacturer, opening_stock_override, is_active')
      .is('deleted_at', null)
      .order('manufacturer', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }) as unknown as Promise<{ data: ProductRow[] | null }>,
    supabase
      .from('demand_forecasts')
      .select('product_id, year_month, channel, units, is_edited')
      .gte('year_month', firstMonth)
      .lte('year_month', lastMonth) as unknown as Promise<{ data: DemandForecast[] | null }>,
    supabase
      .from('production_plans')
      .select('product_id, year_month, units_planned')
      .gte('year_month', firstMonth)
      .lte('year_month', lastMonth) as unknown as Promise<{ data: ProductionPlan[] | null }>,
    supabase
      .from('inventory_balances')
      .select('ingredient_id, quantity_on_hand') as unknown as Promise<{ data: Array<{ ingredient_id: string; quantity_on_hand: number }> | null }>,
  ])

  const allProducts = products ?? []
  const demandIdx = indexDemand(demand ?? [])
  const prodIdx   = indexProduction(production ?? [])

  // inventory_balances is keyed by ingredient_id — we don't currently have product-level stock.
  // Placeholder lookup (empty) until product stock is wired. opening_stock_override still works.
  const stockByProduct = new Map<string, number>()
  for (const row of inventory ?? []) {
    // No mapping today; left as a stub for when product-level stock is tracked.
    stockByProduct.set(row.ingredient_id, row.quantity_on_hand)
  }

  function openingFor(p: ProductRow): number {
    return resolveOpeningStock(p.opening_stock_override, stockByProduct.get(p.id))
  }

  function forecastFor(productId: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const m of months) out[m] = getGrandTotal(demandIdx, productId, m)
    return out
  }
  function productionFor(productId: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const m of months) out[m] = getProductionCell(prodIdx, productId, m)
    return out
  }

  // Build manufacturer groups + derived stats
  const manufacturers = new Map<string, ProductRow[]>()
  const UNASSIGNED = '__unassigned__'
  for (const p of allProducts) {
    const key = p.manufacturer ?? UNASSIGNED
    if (!manufacturers.has(key)) manufacturers.set(key, [])
    manufacturers.get(key)!.push(p)
  }

  function shortfallCount(items: ProductRow[]): number {
    let n = 0
    for (const p of items) {
      const forecast   = forecastFor(p.id)
      const production = productionFor(p.id)
      let bal = openingFor(p)
      for (const m of months) {
        bal = bal + (production[m] ?? 0) - (forecast[m] ?? 0)
        if (bal < 0) n++
      }
    }
    return n
  }

  const view = searchParams.view === 'all' ? 'all' : 'grouped'
  const filterMfr = searchParams.manufacturer ?? 'all'

  // ─────────── Header + view toggle ───────────
  const header = (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Production schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)}) · Balance = prev + production − forecast
        </p>
      </div>
      <div className="flex gap-2 items-center">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          <Link
            href="/production"
            className={`px-3 py-1.5 font-medium ${view === 'grouped' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Grouped by manufacturer
          </Link>
          <Link
            href="/production?view=all"
            className={`px-3 py-1.5 font-medium border-l border-gray-300 ${view === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            View all products
          </Link>
        </div>
      </div>
    </div>
  )

  const monthHeaders = (
    <>
      {months.map((m) => (
        <th key={m} colSpan={3} className="text-center font-medium px-3 py-2 border-l border-gray-200">
          {monthLabel(m)}
        </th>
      ))}
    </>
  )
  const monthSubHeaders = (
    <>
      {months.map((m) => (
        <Fragmented key={m} />
      ))}
    </>
  )

  // ─────────── GROUPED VIEW ───────────
  if (view === 'grouped') {
    return (
      <div className="space-y-5">
        {header}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-300"></span> Production (editable)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Shortfall (negative balance)</span>
          <span className="text-gray-300">·</span>
          <span>Opening stock = manual override where set, else inventory on hand.</span>
        </div>

        {Array.from(manufacturers.entries()).map(([key, items]) => {
          const label = key === UNASSIGNED ? 'Manufacturer not set' : key
          const chip  = key === UNASSIGNED ? null : (MANUFACTURER_CHIP_COLOURS[key] ?? null)
          const short = shortfallCount(items)
          return (
            <details key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden" open={short > 0}>
              <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">▶</span>
                  <span className="font-semibold text-sm">{label}</span>
                  {chip && <span className={`text-[10px] px-1.5 py-0.5 rounded ${chip}`}>{items.length} products</span>}
                  {!chip && <span className="text-xs text-gray-500">{items.length} products</span>}
                </div>
                {short > 0
                  ? <span className="text-xs text-red-600 font-medium">{short} shortfall{short === 1 ? '' : 's'}</span>
                  : <span className="text-xs text-gray-500">On track</span>}
              </summary>

              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 2800 }}>
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                      <th className="text-left font-medium px-4 py-2 sticky left-0 bg-gray-50 z-10 w-[320px] min-w-[320px]">Product</th>
                      <th className="text-right font-medium px-3 py-2 w-[90px] min-w-[90px]">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                      {monthHeaders}
                    </tr>
                    <tr className="bg-gray-50 text-[10px] text-gray-500">
                      <th className="sticky left-0 bg-gray-50 z-10"></th>
                      <th></th>
                      {monthSubHeaders}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <ProductionRow
                        key={p.id}
                        productId={p.id}
                        skuCode={p.sku_code}
                        productName={p.name}
                        manufacturer={p.manufacturer}
                        isActive={p.is_active}
                        openingStock={openingFor(p)}
                        openingStockOverride={p.opening_stock_override}
                        months={months}
                        forecastByMonth={forecastFor(p.id)}
                        productionByMonth={productionFor(p.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </div>
    )
  }

  // ─────────── VIEW ALL ───────────
  const mfrOptions = ['all', ...Array.from(new Set(allProducts.map((p) => p.manufacturer).filter((m): m is string => !!m))), UNASSIGNED]
  const filtered = filterMfr === 'all'
    ? allProducts
    : allProducts.filter((p) => (p.manufacturer ?? UNASSIGNED) === filterMfr)

  const totals = {
    products: filtered.length,
    active:   filtered.filter((p) => p.is_active).length,
    inactive: filtered.filter((p) => !p.is_active).length,
    forecast: filtered.reduce((s, p) => {
      const f = forecastFor(p.id)
      return s + months.reduce((a, m) => a + (f[m] ?? 0), 0)
    }, 0),
    production: filtered.reduce((s, p) => {
      const prod = productionFor(p.id)
      return s + months.reduce((a, m) => a + (prod[m] ?? 0), 0)
    }, 0),
    shortfalls: shortfallCount(filtered),
    opening:    filtered.reduce((s, p) => s + openingFor(p), 0),
  }

  return (
    <div className="space-y-5">
      {header}

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Filter:</label>
        <ManufacturerFilter value={filterMfr} options={mfrOptions} unassignedKey={UNASSIGNED} />
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Tile label="Products" value={totals.products.toString()} sub={`${totals.active} active · ${totals.inactive} inactive`} />
        <Tile label="Forecast 12mo" value={totals.forecast.toLocaleString()} sub="units" />
        <Tile label="Production 12mo" value={totals.production.toLocaleString()} sub="scheduled" />
        <Tile label="Shortfalls" value={totals.shortfalls.toString()} sub="months × SKU" accent={totals.shortfalls > 0 ? 'red' : undefined} />
        <Tile label="Opening stock" value={totals.opening.toLocaleString()} sub="units on hand" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 3000 }}>
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-medium px-4 py-2 sticky left-0 bg-gray-50 z-10 w-[320px] min-w-[320px]">Product</th>
                <th className="text-left font-medium px-3 py-2 w-[120px] min-w-[120px]">Manufacturer</th>
                <th className="text-right font-medium px-3 py-2 w-[90px] min-w-[90px]">
                      Opening
                      <span className="block text-[9px] normal-case tracking-normal text-amber-700 font-normal">editable</span>
                    </th>
                {monthHeaders}
              </tr>
              <tr className="bg-gray-50 text-[10px] text-gray-500">
                <th className="sticky left-0 bg-gray-50 z-10"></th>
                <th></th>
                <th></th>
                {monthSubHeaders}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProductionRow
                  key={p.id}
                  productId={p.id}
                  skuCode={p.sku_code}
                  productName={p.name}
                  manufacturer={p.manufacturer}
                  isActive={p.is_active}
                  openingStock={openingFor(p)}
                  openingStockOverride={p.opening_stock_override}
                  months={months}
                  forecastByMonth={forecastFor(p.id)}
                  productionByMonth={productionFor(p.id)}
                  showManufacturerChip
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Fragmented() {
  return (
    <>
      <th className="text-right px-2 py-1 border-l border-gray-200 font-medium text-[10px]">Fcst</th>
      <th className="text-right px-2 py-1 font-medium text-[10px]">Prod</th>
      <th className="text-right px-2 py-1 font-medium text-[10px]">Bal</th>
    </>
  )
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'red' }) {
  const cls = accent === 'red'
    ? 'p-3 bg-red-50 border border-red-200 rounded-md'
    : 'p-3 bg-white border border-gray-200 rounded-md'
  const labelCls = accent === 'red' ? 'text-red-700' : 'text-gray-500'
  const valCls   = accent === 'red' ? 'text-red-800' : 'text-gray-900'
  return (
    <div className={cls}>
      <div className={`text-[11px] uppercase font-semibold ${labelCls}`}>{label}</div>
      <div className={`text-lg font-semibold ${valCls}`}>{value}</div>
      {sub && <div className={`text-[11px] ${labelCls}`}>{sub}</div>}
    </div>
  )
}
