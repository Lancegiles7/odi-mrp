import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { StatusBadge } from '@/components/ingredients/status-badge'
import { IngredientsSearch } from '@/components/ingredients/ingredients-search'
import { INGREDIENT_CERTIFICATIONS } from '@/lib/constants'
import type { IngredientStatus, IngredientCertification, ProductGroup } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Ingredients' }

interface PageProps {
  searchParams: {
    q?:      string
    status?: string
    group?:  string
    category?: string
    deleted?: string
  }
}

interface IngredientRow {
  id: string
  sku_code: string
  name: string
  lead_time: string | null
  status: IngredientStatus
  price: number | null
  freight: number | null
  total_loaded_cost: number | null
  is_organic: boolean
  category: string
  origin: string | null
  certification: IngredientCertification | null
  supplier_id: string | null
  suppliers: { name: string | null } | null
}

const CERT_BY_VALUE = new Map(INGREDIENT_CERTIFICATIONS.map((c) => [c.value, c]))

export default async function IngredientsPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const search   = searchParams.q?.trim() ?? ''
  const status   = searchParams.status?.trim() ?? ''
  const group    = searchParams.group?.trim()  ?? ''
  const category = searchParams.category?.trim() ?? ''

  // ── Base query ───────────────────────────────────────────────
  let query = supabase
    .from('ingredients')
    .select(`
      id, sku_code, name, lead_time, status, price, freight, total_loaded_cost,
      is_organic, category, origin, certification, supplier_id,
      suppliers ( name )
    `)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sku_code', { ascending: true })

  // Text search now also matches supplier name. The PostgREST `or` filter
  // can't traverse the foreign join, so we fetch matching supplier IDs
  // first when a search term is present.
  if (search) {
    const { data: matchingSuppliers } = await supabase
      .from('suppliers').select('id').ilike('name', `%${search}%`)
    const supplierIds = (matchingSuppliers ?? []).map((s) => s.id)
    const supplierFilter = supplierIds.length > 0
      ? `,supplier_id.in.(${supplierIds.join(',')})`
      : ''
    query = query.or(`sku_code.ilike.%${search}%,name.ilike.%${search}%${supplierFilter}`)
  }

  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)

  const { data: ingredients, error } = await query as unknown as { data: IngredientRow[] | null; error: { message: string } | null }

  // ── "Used in products" filter ─────────────────────────────────
  // Done at the application layer because it's a multi-step join.
  let visibleIngredients = ingredients ?? []
  let groupLabel: string | null = null

  if (group === 'active' || group === 'unused' || (group && group !== '')) {
    // Pull the active-product → ingredient mapping via bom_items.
    const ingredientIds = visibleIngredients.map((i) => i.id)
    if (ingredientIds.length > 0) {
      const { data: links } = await supabase
        .from('bom_items')
        .select(`
          ingredient_id,
          boms!inner ( is_active, product_id, products!inner ( is_active, deleted_at, product_type ) )
        `)
        .in('ingredient_id', ingredientIds)
        .eq('boms.is_active', true)
        .eq('boms.products.is_active', true)
        .is('boms.products.deleted_at', null) as unknown as { data: Array<{
          ingredient_id: string
          boms: { product_id: string; is_active: boolean; products: { is_active: boolean; deleted_at: string | null; product_type: ProductGroup | null } } | null
        }> | null }

      const usedByActive = new Set<string>()
      const usedByGroup  = new Set<string>()
      for (const link of links ?? []) {
        const ingId = link.ingredient_id
        usedByActive.add(ingId)
        const productGroup = link.boms?.products?.product_type ?? null
        if (productGroup && productGroup === group) usedByGroup.add(ingId)
      }

      if (group === 'active') {
        visibleIngredients = visibleIngredients.filter((i) => usedByActive.has(i.id))
        groupLabel = 'Used by active products'
      } else if (group === 'unused') {
        visibleIngredients = visibleIngredients.filter((i) => !usedByActive.has(i.id))
        groupLabel = 'Not used in any active BOM'
      } else {
        visibleIngredients = visibleIngredients.filter((i) => usedByGroup.has(i.id))
        groupLabel = `Used in ${group.replace('_', ' ')}`
      }
    }
  }

  // ── Document counts (per visible ingredient) ──────────────────
  const ingredientIds = visibleIngredients.map((i) => i.id)
  const docCounts = new Map<string, number>()
  if (ingredientIds.length > 0) {
    const { data: docs } = await supabase
      .from('ingredient_documents')
      .select('ingredient_id')
      .in('ingredient_id', ingredientIds) as unknown as { data: Array<{ ingredient_id: string }> | null }
    for (const d of docs ?? []) {
      docCounts.set(d.ingredient_id, (docCounts.get(d.ingredient_id) ?? 0) + 1)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ingredients</h1>
          <p className="text-sm text-gray-500 mt-1">Raw materials used in production</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ingredients/trash" className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">Trash</Link>
          <Link href="/ingredients/import" className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Import</Link>
          <Link href="/ingredients/new" className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800">Add ingredient</Link>
        </div>
      </div>

      {searchParams.deleted && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Ingredient moved to <Link href="/ingredients/trash" className="underline font-medium">Trash</Link>. Recoverable for 30 days.
        </div>
      )}

      <div className="mb-4">
        <IngredientsSearch
          defaultSearch={search}
          defaultStatus={status}
          defaultGroup={group}
          defaultCategory={category}
        />
      </div>

      {/* Active filter summary */}
      <div className="flex items-center gap-2 mb-3 text-[11px] flex-wrap">
        <span className="text-gray-500">Showing:</span>
        {status
          ? <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Status: {status}</span>
          : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">All statuses</span>}
        {groupLabel
          ? <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{groupLabel}</span>
          : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">All ingredients</span>}
        <span className="text-gray-400">·</span>
        <span className="text-gray-500">{visibleIngredients.length} ingredient{visibleIngredients.length === 1 ? '' : 's'}</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-600">Failed to load ingredients. Please refresh.</p>
        ) : visibleIngredients.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-500">
              {(search || status || group)
                ? 'No ingredients match your filters.'
                : 'No ingredients yet. Add one or import from a spreadsheet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">SKU</th>
                  <th className="text-left px-4 py-2 font-medium">Ingredient</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Supplier</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Lead time</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Organic</th>
                  <th className="text-left px-4 py-2 font-medium">Origin</th>
                  <th className="text-left px-4 py-2 font-medium">Cert.</th>
                  <th className="text-center px-4 py-2 font-medium">Docs</th>
                  <th className="text-right px-4 py-2 font-medium">Price</th>
                  <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Total loaded</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[13px]">
                {visibleIngredients.map((ing) => {
                  const cert = ing.certification ? CERT_BY_VALUE.get(ing.certification) : null
                  const docCount = docCounts.get(ing.id) ?? 0
                  const supplierName = ing.suppliers?.name ?? null
                  return (
                    <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                        <Link href={`/ingredients/${ing.id}`} className="hover:underline">{ing.sku_code}</Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        <Link href={`/ingredients/${ing.id}`} className="hover:underline">{ing.name}</Link>
                        {ing.category === 'snack' && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">Snack</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {supplierName ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {ing.lead_time ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={ing.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        {ing.is_organic
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Organic</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Non-Organic</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {ing.origin ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {cert
                          ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${cert.chip}`}>{cert.short}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {docCount > 0
                          ? <Link href={`/ingredients/${ing.id}#documents`} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">📎 {docCount}</Link>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums">
                        {ing.price !== null ? formatCurrency(ing.price) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                        {ing.total_loaded_cost !== null ? formatCurrency(ing.total_loaded_cost) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/ingredients/${ing.id}`} className="text-xs text-gray-500 hover:text-gray-900 font-medium mr-3">View</Link>
                        <Link href={`/ingredients/${ing.id}/edit`} className="text-xs text-gray-500 hover:text-gray-900 font-medium">Edit</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
