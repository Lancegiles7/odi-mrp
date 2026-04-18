import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

export const metadata: Metadata = { title: 'Products' }

export default async function ProductsPage() {
  const supabase = createClient()

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, sku_code, name, product_type, size_g, rrp, is_active,
      boms(id, is_active, bom_items(id))
    `)
    .eq('is_active', true)
    .order('product_type', { ascending: true })
    .order('name', { ascending: true })

  // Group by product_type
  const grouped = new Map<string, typeof products>()
  for (const p of products ?? []) {
    const type = p.product_type ?? 'Uncategorised'
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type)!.push(p)
  }

  const types = Array.from(grouped.keys()).sort()

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">Finished goods — grouped by product type</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/products/import"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Import BOM
          </Link>
          <Link
            href="/products/new"
            className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          >
            Add product
          </Link>
        </div>
      </div>

      {!products || products.length === 0 ? (
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
        <div className="space-y-6">
          {types.map((type) => {
            const typeProducts = grouped.get(type) ?? []
            return (
              <div key={type}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
                  {type}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    ({typeProducts.length})
                  </span>
                </h2>

                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-3 font-medium text-gray-600">SKU Code</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Product Name</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">Size</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">RRP</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Ingredients</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {typeProducts.map((p) => {
                        const activeBom = (p.boms as Array<{ id: string; is_active: boolean; bom_items: Array<{ id: string }> }>)
                          ?.find((b) => b.is_active)
                        const itemCount = activeBom?.bom_items?.length ?? 0

                        return (
                          <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku_code}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              <Link href={`/products/${p.id}`} className="hover:underline">
                                {p.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {p.size_g ? `${p.size_g}g` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                              {p.rrp ? formatCurrency(p.rrp) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                itemCount > 0
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-400'
                              }`}>
                                {itemCount} {itemCount === 1 ? 'ingredient' : 'ingredients'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/products/${p.id}`}
                                className="text-xs text-gray-500 hover:text-gray-900 font-medium"
                              >
                                View →
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
