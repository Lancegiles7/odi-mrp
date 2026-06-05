import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  PRODUCT_GROUPS, NZ_CHANNEL_SET, AUS_CHANNEL_SET, channelCountry,
  type ChannelCountry,
} from '@/lib/constants'
import { rollingMonths, indexDemand, monthLabel } from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'
import { DemandProductTable, type DemandProductData, type CountryFilter } from '@/components/demand/demand-product-table'
import { CompleteMonthButton } from '@/components/demand/complete-month-button'
import type { DemandChannel, DemandForecast, ProductGroup } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Demand' }

interface ProductRow {
  id: string
  sku_code: string
  name: string
  product_type: ProductGroup | null
  is_active: boolean
}

interface PageProps {
  searchParams: { country?: string }
}

function parseCountry(raw: string | undefined): CountryFilter {
  if (raw === 'nz' || raw === 'NZ')   return 'NZ'
  if (raw === 'aus' || raw === 'AUS') return 'AUS'
  return 'all'
}

export default async function DemandPage({ searchParams }: PageProps) {
  const country = parseCountry(searchParams.country)
  const supabase = createClient()

  const anchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, anchor)
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]

  const [{ data: products }, demandRows] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku_code, name, product_type, is_active')
      .is('deleted_at', null)
      .order('name', { ascending: true }) as unknown as Promise<{ data: ProductRow[] | null }>,
    fetchAllRows<DemandForecast>((from, to) =>
      supabase
        .from('demand_forecasts')
        .select('product_id, year_month, channel, units, is_edited')
        .gte('year_month', firstMonth)
        .lte('year_month', lastMonth)
        .order('product_id').order('year_month').order('channel')
        .range(from, to) as unknown as PromiseLike<{ data: DemandForecast[] | null; error: { message: string } | null }>,
    ),
  ])

  const allProducts = products ?? []
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

  // Country-filter-aware year total. When viewing NZ only, the group
  // total at the accordion summary reflects NZ demand only — matches
  // what the user sees inside.
  function yearTotalFor(productId: string, filter: CountryFilter = country): number {
    let s = 0
    const byMonth = idx.get(productId)
    if (!byMonth) return 0
    byMonth.forEach((byCh) => {
      byCh.forEach((v, ch) => {
        if (filter === 'NZ'  && !NZ_CHANNEL_SET.has(ch))  return
        if (filter === 'AUS' && !AUS_CHANNEL_SET.has(ch)) return
        s += v.units
      })
    })
    return s
  }

  function groupYearTotal(items: ProductRow[]): number {
    return items.reduce((s, p) => s + yearTotalFor(p.id), 0)
  }

  // Page-level tiles: total split by country + pipefill share.
  let totalAll = 0, totalNZ = 0, totalAUS = 0, pipefillNZ = 0, pipefillAUS = 0
  for (const p of allProducts) {
    const byMonth = idx.get(p.id)
    if (!byMonth) continue
    byMonth.forEach((byCh) => {
      byCh.forEach((v, ch) => {
        totalAll += v.units
        const c = channelCountry(ch)
        if (c === 'NZ')  totalNZ  += v.units
        if (c === 'AUS') totalAUS += v.units
        if (ch === 'pipefill_nz') pipefillNZ  += v.units
        if (ch === 'pipefill_au') pipefillAUS += v.units
      })
    })
  }
  const pctNZ  = totalAll > 0 ? Math.round((totalNZ  / totalAll) * 100) : 0
  const pctAUS = totalAll > 0 ? Math.round((totalAUS / totalAll) * 100) : 0

  // Active button styling for the country filter pill row.
  const pillBase = 'px-3 py-1.5 text-xs font-medium'
  const pillActive = (c: CountryFilter) =>
    country === c
      ? c === 'NZ'  ? 'bg-emerald-800 text-white'
      : c === 'AUS' ? 'bg-amber-700 text-white'
                    : 'bg-gray-900 text-white'
      : 'bg-white text-gray-700 hover:bg-gray-50'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Demand</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rolling 12 months ({monthLabel(firstMonth)} → {monthLabel(lastMonth)})
            {country !== 'all' && (
              <> · <span className="font-semibold text-gray-800">{country === 'NZ' ? 'NZ only' : 'AUS only'}</span></>
            )}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Country filter pills */}
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
            <Link href="/demand"          className={`${pillBase} ${pillActive('all')}`}>All</Link>
            <Link href="/demand?country=nz"  className={`${pillBase} border-l border-gray-300 ${pillActive('NZ')}`}>NZ</Link>
            <Link href="/demand?country=aus" className={`${pillBase} border-l border-gray-300 ${pillActive('AUS')}`}>AUS</Link>
          </div>
          <CompleteMonthButton firstMonth={firstMonth} hasAnchorOverride={anchor.getTime() !== Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)} />
          <Link
            href="/demand/import"
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            + Import XLSX
          </Link>
        </div>
      </div>

      {/* Page-level country split tiles */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-gray-200 rounded-md">
          <div className="text-[11px] uppercase font-semibold text-gray-500">Total 12mo</div>
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{totalAll.toLocaleString()}</div>
          <div className="text-[11px] text-gray-500">all channels · all countries</div>
        </div>
        <div className="p-3 bg-white border border-gray-200 rounded-md border-l-4 border-l-emerald-800">
          <div className="text-[11px] uppercase font-semibold text-gray-500">NZ 12mo</div>
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{totalNZ.toLocaleString()}</div>
          <div className="text-[11px] text-gray-500">{pctNZ}% of total · {pipefillNZ.toLocaleString()} pipefill</div>
        </div>
        <div className="p-3 bg-white border border-gray-200 rounded-md border-l-4 border-l-amber-700">
          <div className="text-[11px] uppercase font-semibold text-gray-500">AUS 12mo</div>
          <div className="text-lg font-semibold text-gray-900 tabular-nums">{totalAUS.toLocaleString()}</div>
          <div className="text-[11px] text-gray-500">{pctAUS}% of total · {pipefillAUS.toLocaleString()} pipefill</div>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-[11px] uppercase font-semibold text-blue-700">Pipefill 12mo</div>
          <div className="text-lg font-semibold text-blue-900 tabular-nums">{(pipefillNZ + pipefillAUS).toLocaleString()}</div>
          <div className="text-[11px] text-blue-700">NZ {pipefillNZ.toLocaleString()} · AUS {pipefillAUS.toLocaleString()}</div>
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
                countryFilter={country}
                collapsed
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
