import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { StatusBadge } from '@/components/ingredients/status-badge'
import { IngredientsSearch } from '@/components/ingredients/ingredients-search'
import type { IngredientStatus } from '@/lib/types/database.types'

export const metadata: Metadata = {
  title: 'Ingredients',
}

interface PageProps {
  searchParams: {
    q?: string
    status?: string
  }
}

export default async function IngredientsPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const search = searchParams.q?.trim() ?? ''
  const statusFilter = searchParams.status ?? ''

  let query = supabase
    .from('ingredients')
    .select('id, sku_code, name, confirmed_supplier, lead_time, status, price, freight, total_loaded_cost, is_organic')
    .eq('is_active', true)
    .order('sku_code', { ascending: true })

  if (search) {
    query = query.or(`sku_code.ilike.%${search}%,name.ilike.%${search}%`)
  }

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data: ingredients, error } = await query

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ingredients</h1>
          <p className="text-sm text-gray-500 mt-1">
            Raw materials used in production
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/ingredients/import"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Import
          </Link>
          <Link
            href="/ingredients/new"
            className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          >
            Add ingredient
          </Link>
        </div>
      </div>

      {/* Search and filter */}
      <div className="mb-4">
        <IngredientsSearch
          defaultSearch={search}
          defaultStatus={statusFilter}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-600">
            Failed to load ingredients. Please refresh.
          </p>
        ) : !ingredients || ingredients.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-500">
              {search || statusFilter
                ? 'No ingredients match your search.'
                : 'No ingredients yet. Add one or import from a spreadsheet.'}
            </p>
            {!search && !statusFilter && (
              <div className="flex justify-center gap-3 mt-4">
                <Link
                  href="/ingredients/import"
                  className="text-sm font-medium text-gray-700 underline underline-offset-2"
                >
                  Import from spreadsheet
                </Link>
                <Link
                  href="/ingredients/new"
                  className="text-sm font-medium text-gray-900 underline underline-offset-2"
                >
                  Add manually
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">SKU Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ingredient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Confirmed Supplier</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Lead Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Organic</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Freight</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Total Loaded</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ingredients.map((ing) => (
                  <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                      <Link href={`/ingredients/${ing.id}`} className="hover:underline">
                        {ing.sku_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/ingredients/${ing.id}`} className="hover:underline">
                        {ing.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {ing.confirmed_supplier ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {ing.lead_time ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ing.status as IngredientStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {ing.is_organic ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Organic</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Non-Organic</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                      {ing.price !== null ? formatCurrency(ing.price) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                      {ing.freight !== null ? formatCurrency(ing.freight) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                      {ing.total_loaded_cost !== null
                        ? formatCurrency(ing.total_loaded_cost)
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/ingredients/${ing.id}`}
                        className="text-xs text-gray-500 hover:text-gray-900 font-medium mr-3"
                      >
                        View
                      </Link>
                      <Link
                        href={`/ingredients/${ing.id}/edit`}
                        className="text-xs text-gray-500 hover:text-gray-900 font-medium"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
              {(search || statusFilter) && ' matching your search'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
