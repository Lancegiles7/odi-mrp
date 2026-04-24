import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'
import { rollingMonths, indexDemand, monthLabel } from '@/lib/demand'
import { DemandProductTable, type DemandProductData } from '@/components/demand/demand-product-table'
import type { DemandChannel, DemandForecast, ProductGroup } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Demand' }

interface ProductRow {
  id: string
  sku_code: string
  name: string
  product_type: ProductGroup | null
  is_active: boolean
}

export default async function DemandPage() {
  const supabase = createClient()

  const months = rollingMonths()
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const [{ data: products }, { data: demand }] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku_code, name, product_type, is_active')
      .is('deleted_at', null)
      .order('name', { ascending: true }) as unknown as Promise<{ data: ProductRow[] | null }>,
    supabase
      .from('demand_forecasts')
      .select('product_id, year_month, channel, units, is_edited')
      .gte('year_month', firstMonth)
      .lte('year_month', lastMonth) as unknown as Promise<{ data: DemandForecast[] | null }>,
  ])

  const allProducts = products ?? []
  const demandRows  = demand ?? []
  const idx = indexDemand(demandRows)

  // Build per-product data block for the client component
  function dataFor(productId: string): DemandProductData {
    const byMonth = idx.get(productId)
    const out: DemandProductData = {}
    for (const m of months) {
      const byCh = byMonth?.get(m)
      if (!byCh) { out[m] = {}; continue }
      out[m] = {}
      byCh.forEach((v, channel) => {
        out[m][channel as DemandChannel] = { units: v.units, edited: v.edited }
      })
    }
    return out
  }

  // Split by group. Inactive products go into a dedicated "Inactive" bucket.
  const active   = allProducts.filter((p) => p.is_active)
  const inactive = allProducts.filter((p) => !p.is_active)

  const byGroup = new Map<string | null, ProductRow[]>()
  for (const p of active) {
    const key = p.product_type ?? null
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(p)
  }

  const orderedGroups: Array<{ key: string | null; label: string; items: ProductRow[] }> = [
    ...PRODUCT_GROUPS.map((g) => ({
      key: g.value as string,
      label: g.label,
      items: byGroup.get(g.value as string) ?? [],
    })),
    ...(byGroup.has(null) ? [{ key: null, label: 'Uncategorised', items: byGroup.get(null)! }] : []),
  ]

  function yearTotalFor(productId: string): number {
    let s = 0
    const byMonth = idx.get(productId)
    if (!byMonth) return 0
    byMonth.forEach((byCh) => {
      byCh.forEach((v) => { s += v.units })
    })
    return s
  }

  function groupYearTotal(items: ProductRow[]): number {
    return items.reduce((s, p) => s + yearTotalFor(p.id), 0)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Demand</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)})
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/demand/import"
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            + Import XLSX
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span> Edited since import
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200"></span> Pipefill (manual)
        </span>
        <span className="text-gray-300">·</span>
        <span>Click any cell to edit · Enter or Tab to save</span>
      </div>

      {orderedGroups.map((group) => {
        if (group.items.length === 0) return null
        return (
          <details key={group.label} className="bg-white rounded-lg border border-gray-200 overflow-hidden" open={group.key === 'snacks_4bs'}>
            <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">▶</span>
                <span className="font-semibold text-sm">{group.label}</span>
                <span className="text-xs text-gray-500">{group.items.length} products</span>
              </div>
              <div className="text-xs text-gray-500">
                Group total <span className="font-medium text-gray-900 tabular-nums">{groupYearTotal(group.items).toLocaleString()}</span>
              </div>
            </summary>

            <div className="border-t border-gray-100 p-5 space-y-3">
              {group.items.map((p) => (
                <DemandProductTable
                  key={p.id}
                  productId={p.id}
                  productName={p.name}
                  skuCode={p.sku_code}
                  months={months}
                  initialData={dataFor(p.id)}
                  collapsed
                />
              ))}
            </div>
          </details>
        )
      })}

      {/* Inactive products */}
      {inactive.length > 0 && (
        <details className="bg-white rounded-lg border border-dashed border-gray-300 overflow-hidden">
          <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">▶</span>
              <span className="font-semibold text-sm text-gray-700">Inactive products</span>
              <span className="text-xs text-gray-500">{inactive.length} placeholder{inactive.length === 1 ? '' : 's'} · demand tracked, no active BOM</span>
            </div>
          </summary>
          <div className="border-t border-gray-100 p-5 space-y-3">
            {inactive.map((p) => (
              <DemandProductTable
                key={p.id}
                productId={p.id}
                productName={p.name}
                skuCode={p.sku_code}
                months={months}
                initialData={dataFor(p.id)}
                collapsed
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
