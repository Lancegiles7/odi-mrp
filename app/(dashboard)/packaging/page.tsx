import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { packagingTypeLabel, PACKAGING_TYPE_COLOURS, PACKAGING_TYPES, PRODUCT_GROUPS } from '@/lib/constants'

export const metadata: Metadata = { title: 'Packaging' }

interface PackagingRow {
  id: string
  sku_code: string
  name: string
  type: string
  supplier_id: string | null
  price: number | null
  currency: string
  freight_per_unit_nzd: number | null
  total_loaded_cost_nzd: number | null
  opening_stock_override: number | null
  is_active: boolean
}

interface PageProps { searchParams: { type?: string; supplier?: string; group?: string } }

export default async function PackagingPage({ searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data: rows }, { data: suppliers }, { data: balances }, { data: links }] = await Promise.all([
    supabase.from('packaging')
      .select('id, sku_code, name, type, supplier_id, price, currency, freight_per_unit_nzd, total_loaded_cost_nzd, opening_stock_override, is_active')
      .order('name') as { data: PackagingRow[] | null },
    supabase.from('suppliers').select('id, name').order('name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('inventory_balances').select('packaging_id, quantity_on_hand').not('packaging_id', 'is', null) as { data: Array<{ packaging_id: string; quantity_on_hand: number }> | null },
    // For each packaging item, derive the set of product groups via product_packaging → products.product_type
    supabase.from('product_packaging')
      .select('packaging_id, products:product_id(product_type)') as unknown as { data: Array<{ packaging_id: string; products: { product_type: string | null } | null }> | null },
  ])

  const supplierById = new Map((suppliers ?? []).map((s) => [s.id, s.name]))
  const balanceById = new Map<string, number>()
  for (const b of balances ?? []) balanceById.set(b.packaging_id, Number(b.quantity_on_hand))

  // Map: packaging_id → Set<product_type> derived from linked products
  const groupsByPackaging = new Map<string, Set<string>>()
  for (const l of links ?? []) {
    const pt = l.products?.product_type
    if (!pt) continue
    if (!groupsByPackaging.has(l.packaging_id)) groupsByPackaging.set(l.packaging_id, new Set())
    groupsByPackaging.get(l.packaging_id)!.add(pt)
  }

  const all = rows ?? []
  const filterType     = searchParams.type     ?? 'all'
  const filterSupplier = searchParams.supplier ?? 'all'
  const filterGroup    = searchParams.group    ?? 'all'
  const filtered = all.filter((p) => {
    if (filterType !== 'all'     && p.type        !== filterType)     return false
    if (filterSupplier !== 'all' && p.supplier_id !== filterSupplier) return false
    if (filterGroup !== 'all') {
      const g = groupsByPackaging.get(p.id)
      if (filterGroup === 'unassigned') {
        if (g && g.size > 0) return false
      } else if (!g?.has(filterGroup)) {
        return false
      }
    }
    return true
  })

  function fmt(n: number | null | undefined): string {
    if (n == null) return '—'
    return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
  }
  function soh(n: number | null | undefined): string {
    if (n == null) return '0'
    return Math.round(Number(n)).toLocaleString()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Packaging</h1>
          <p className="text-sm text-gray-500 mt-1">{all.length} items · loaded cost = price × FX + freight (NZD)</p>
        </div>
        <Link href="/packaging/new" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800">
          + New packaging item
        </Link>
      </div>

      <form className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-xs flex-wrap" action="/packaging" method="get">
        <span className="text-gray-500">Filter:</span>
        <select name="type" defaultValue={filterType} className="border border-gray-300 rounded-md px-2 py-1.5">
          <option value="all">All types</option>
          {PACKAGING_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          <option value="OTHER">Other</option>
        </select>
        <select name="supplier" defaultValue={filterSupplier} className="border border-gray-300 rounded-md px-2 py-1.5">
          <option value="all">All suppliers</option>
          {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="group" defaultValue={filterGroup} className="border border-gray-300 rounded-md px-2 py-1.5" title="Filter by the product group(s) each packaging item is linked to">
          <option value="all">All product groups</option>
          {PRODUCT_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          <option value="unassigned">Unassigned (no product link)</option>
        </select>
        <button className="px-2 py-1.5 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200">Apply</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 w-[160px]">Code</th>
              <th className="text-left px-3 py-2 w-[140px]">Type</th>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-right px-3 py-2 w-[90px]">Price</th>
              <th className="text-left px-3 py-2 w-[60px]">Ccy</th>
              <th className="text-right px-3 py-2 w-[80px]">Freight</th>
              <th className="text-right px-3 py-2 w-[110px]">Loaded NZD</th>
              <th className="text-right px-3 py-2 w-[80px]">SOH</th>
              <th className="text-left px-3 py-2 w-[70px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const stock = balanceById.get(p.id) ?? p.opening_stock_override ?? 0
              const colour = PACKAGING_TYPE_COLOURS[p.type] ?? PACKAGING_TYPE_COLOURS['OTHER']
              return (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/packaging/${p.id}`} className="hover:underline text-gray-900">{p.sku_code}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${colour}`}>{packagingTypeLabel(p.type)}</span>
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/packaging/${p.id}`} className="hover:underline">{p.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{p.supplier_id ? (supplierById.get(p.supplier_id) ?? '—') : <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(p.price)}</td>
                  <td className="px-3 py-2 text-gray-700">{p.currency}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(p.freight_per_unit_nzd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(p.total_loaded_cost_nzd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{soh(stock)}</td>
                  <td className="px-3 py-2">
                    {p.is_active
                      ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                      : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">No packaging items match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
