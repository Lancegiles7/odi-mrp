import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { getAppSettings } from '@/lib/settings'
import { calcProductCostSummary } from '@/lib/costing'
import { PRODUCT_GROUPS } from '@/lib/constants'
import type { BomItemWithIngredient, ProductGroup } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Products / BOMs' }

interface PageProps {
  searchParams: { deleted?: string }
}

type ProductRow = {
  id: string
  sku_code: string
  name: string
  product_type: ProductGroup | null
  size_g: number | null
  rrp: number | null
  packaging: number | null
  toll: number | null
  margin: number | null
  other: number | null
  freight: number | null
  apply_fx: boolean
  wastage_pct: number
  is_active: boolean
  boms: Array<{
    id: string
    is_active: boolean
    bom_items: BomItemWithIngredient[]
  }>
}

// Shared column widths so tables line up even though each group has its own.
const COLS = (
  <colgroup>
    <col className="w-[220px]" />   {/* SKU     */}
    <col />                          {/* Name    */}
    <col className="w-[80px]"  />   {/* Size    */}
    <col className="w-[90px]"  />   {/* RRP     */}
    <col className="w-[110px]" />   {/* NZ      */}
    <col className="w-[110px]" />   {/* AU      */}
    <col className="w-[90px]"  />   {/* COS NZ  */}
    <col className="w-[80px]"  />   {/* COS AU  */}
    <col className="w-[70px]"  />   {/* action  */}
  </colgroup>
)

export default async function ProductsPage({ searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data: products }, settings] = await Promise.all([
    supabase
      .from('products')
      .select(`
        id, sku_code, name, product_type, size_g, rrp,
        packaging, toll, margin, other, freight, apply_fx, wastage_pct, is_active,
        boms (
          id, is_active,
          bom_items (
            id, ingredient_id, quantity_g, uom, price_override, notes, sort_order,
            ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic )
          )
        )
      `)
      .eq('is_active', true)
      .order('name', { ascending: true }) as unknown as Promise<{ data: ProductRow[] | null }>,
    getAppSettings(),
  ])

  const all = products ?? []
  const grouped = new Map<string | null, ProductRow[]>()
  for (const p of all) {
    const key = p.product_type ?? null
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(p)
  }

  // Show all 7 groups always (even if empty) + Uncategorised if it has rows
  const orderedGroups: Array<{ key: ProductGroup | null; label: string; items: ProductRow[] }> = [
    ...PRODUCT_GROUPS.map((g) => ({
      key: g.value as ProductGroup,
      label: g.label,
      items: grouped.get(g.value as ProductGroup) ?? [],
    })),
    ...(grouped.has(null) ? [{ key: null, label: 'Uncategorised', items: grouped.get(null)! }] : []),
  ]

  const totalProducts = all.length
  const visibleGroups = orderedGroups.filter((g) => g.items.length > 0).length

  return (
    <div>
      {searchParams.deleted && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800 flex items-center justify-between">
          <span>Product moved to trash. It will be permanently deleted in 30 days.</span>
          <Link href="/products/trash" className="underline font-medium">View trash →</Link>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Products / BOMs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalProducts} product{totalProducts === 1 ? '' : 's'} across {visibleGroups} group{visibleGroups === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/products/import"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/products/new"
            className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
          >
            + New product
          </Link>
        </div>
      </div>

      {totalProducts === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-500 mb-4">No products yet.</p>
          <div className="flex justify-center gap-4">
            <Link href="/products/import" className="text-sm font-medium underline underline-offset-2 text-gray-600">
              Import from BOM spreadsheet
            </Link>
            <Link href="/products/new" className="text-sm font-medium underline underline-offset-2 text-gray-900">
              Add manually
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {orderedGroups.map((group) => {
            const items = group.items
            const summaries = items.map((p) => {
              const activeBom = p.boms?.find((b) => b.is_active)
              return calcProductCostSummary(p, activeBom?.bom_items ?? [], settings)
            })
            const gpValues = summaries
              .map((s) => s.gp_nz)
              .filter((v): v is number => v !== null && isFinite(v))
            const avgGp =
              gpValues.length > 0
                ? gpValues.reduce((a, b) => a + b, 0) / gpValues.length
                : null

            return (
              <details
                key={group.label}
                className="group/grp bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                <summary className="list-none cursor-pointer select-none">
                  <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 transition-transform group-open/grp:rotate-90 inline-block w-3 text-center">▶</span>
                      <span className="font-semibold text-sm text-gray-900">{group.label}</span>
                      <span className="text-xs text-gray-500">
                        {items.length} product{items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <span className="text-xs text-gray-400">Empty</span>
                    ) : avgGp !== null ? (
                      <span className="text-xs text-gray-500">
                        Avg GP (NZ) <span className="font-medium text-gray-700">{(avgGp * 100).toFixed(1)}%</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No BOM costs yet</span>
                    )}
                  </div>
                </summary>

                {items.length > 0 && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm table-fixed">
                      {COLS}
                      <thead>
                        <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                          <th className="text-left font-medium px-4 py-2">SKU</th>
                          <th className="text-left font-medium px-4 py-2">Name</th>
                          <th className="text-right font-medium px-4 py-2">Size</th>
                          <th className="text-right font-medium px-4 py-2">RRP</th>
                          <th className="text-right font-medium px-4 py-2">NZ total</th>
                          <th className="text-right font-medium px-4 py-2">AU total</th>
                          <th className="text-right font-medium px-4 py-2">GP NZ</th>
                          <th className="text-right font-medium px-4 py-2">GP AU</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((p, i) => {
                          const s = summaries[i]
                          const hasCost = s.ingredient_total > 0 || s.base_cost > 0
                          // Colour bands inverted vs COS — higher GP is better.
                          const gpNzBand =
                            s.gp_nz === null
                              ? 'bg-gray-100 text-gray-400'
                              : s.gp_nz > 0.65
                                ? 'bg-green-50 text-green-700'
                                : s.gp_nz > 0.55
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700'
                          return (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono text-xs text-gray-700 truncate">{p.sku_code}</td>
                              <td className="px-4 py-2 font-medium text-gray-900 truncate">
                                <Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link>
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {p.size_g ? `${p.size_g} g` : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {p.rrp ? formatCurrency(p.rrp) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-semibold">
                                {hasCost ? formatCurrency(s.nz_grand_total) : <span className="text-gray-300 font-normal">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                                {hasCost ? formatCurrency(s.au_grand_total) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {s.gp_nz !== null && hasCost
                                  ? <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium tabular-nums ${gpNzBand}`}>{(s.gp_nz * 100).toFixed(1)}%</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-500">
                                {s.gp_au !== null && hasCost
                                  ? `${(s.gp_au * 100).toFixed(1)}%`
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <Link href={`/products/${p.id}`} className="text-xs text-gray-700 hover:underline">View →</Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
