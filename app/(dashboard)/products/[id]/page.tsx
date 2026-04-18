import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { calcProductCostSummary } from '@/lib/costing'
import { BomEditor } from '@/components/products/bom-editor'
import type { BomItemWithIngredient, Ingredient } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Product' }

interface PageProps {
  params: { id: string }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const supabase = createClient()

  const [{ data: product }, { data: ingredients }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        boms (
          id, version, is_active, notes,
          bom_items (
            id, ingredient_id, quantity_g, uom, price_override, notes, sort_order,
            ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic )
          )
        )
      `)
      .eq('id', params.id)
      .single(),
    supabase
      .from('ingredients')
      .select('id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])

  if (!product) notFound()

  const activeBom = (product.boms as Array<{
    id: string
    version: number
    is_active: boolean
    notes: string | null
    bom_items: BomItemWithIngredient[]
  }>)?.find((b) => b.is_active)

  const bomItems: BomItemWithIngredient[] = activeBom?.bom_items ?? []

  const costSummary = calcProductCostSummary(product, bomItems)

  const allIngredients = (ingredients ?? []) as Pick<
    Ingredient,
    'id' | 'name' | 'sku_code' | 'unit_of_measure' | 'total_loaded_cost' | 'is_organic'
  >[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/products" className="text-sm text-gray-500 hover:text-gray-900">
            ← Products
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">{product.name}</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">{product.sku_code}</p>
        </div>
        <Link
          href={`/products/${params.id}/edit`}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Edit product
        </Link>
      </div>

      {/* Product metadata */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Details</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 mb-0.5">Type</dt>
            <dd className="font-medium text-gray-900">{product.product_type ?? <span className="text-gray-300">—</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">Pack Size</dt>
            <dd className="font-medium text-gray-900">{product.size_g != null ? `${product.size_g}g` : <span className="text-gray-300">—</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">Serving Size</dt>
            <dd className="font-medium text-gray-900">{product.serving_size != null ? `${product.serving_size}g` : <span className="text-gray-300">—</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500 mb-0.5">RRP (NZD)</dt>
            <dd className="font-medium text-gray-900">{product.rrp != null ? formatCurrency(product.rrp) : <span className="text-gray-300">—</span>}</dd>
          </div>
          {product.hero_call_out && (
            <div className="col-span-2">
              <dt className="text-gray-500 mb-0.5">Hero Call Out</dt>
              <dd className="font-medium text-gray-900">{product.hero_call_out}</dd>
            </div>
          )}
          {product.back_of_pack && (
            <div className="col-span-2">
              <dt className="text-gray-500 mb-0.5">Back of Pack</dt>
              <dd className="font-medium text-gray-900">{product.back_of_pack}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Cost summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Cost Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <p className="text-gray-500 mb-0.5">Ingredient Total</p>
            <p className="font-medium text-gray-900">{formatCurrency(costSummary.ingredient_total)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">Grand Total</p>
            <p className="font-semibold text-gray-900 text-base">{formatCurrency(costSummary.grand_total)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">COS</p>
            <p className="font-medium text-gray-900">
              {costSummary.cos != null ? `${(costSummary.cos * 100).toFixed(1)}%` : <span className="text-gray-300">—</span>}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">GP</p>
            <p className={`font-semibold ${costSummary.gp != null ? (costSummary.gp >= 0.5 ? 'text-green-600' : costSummary.gp >= 0.3 ? 'text-amber-600' : 'text-red-600') : 'text-gray-900'}`}>
              {costSummary.gp != null ? `${(costSummary.gp * 100).toFixed(1)}%` : <span className="text-gray-300">—</span>}
            </p>
          </div>
        </div>

        {/* Cost input breakdown */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 pt-4 border-t border-gray-100 text-xs">
          {[
            ['Packaging', product.packaging],
            ['Toll', product.toll],
            ['Margin', product.margin],
            ['Other', product.other],
            ['Currency Exchange', product.currency_exchange],
            ['Freight', product.freight],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className="text-gray-400 mb-0.5">{label}</p>
              <p className="text-gray-700">{val != null ? formatCurrency(val as number) : <span className="text-gray-300">—</span>}</p>
            </div>
          ))}
        </div>
      </div>

      {/* BOM editor */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Bill of Materials</h2>
            {activeBom && (
              <p className="text-xs text-gray-400 mt-0.5">Version {activeBom.version}</p>
            )}
          </div>
        </div>

        {activeBom ? (
          <BomEditor
            bomId={activeBom.id}
            initialItems={bomItems}
            ingredients={allIngredients}
            sizeG={product.size_g ?? 0}
            servingSize={product.serving_size ?? 0}
          />
        ) : (
          <p className="text-sm text-gray-500">No active BOM found.</p>
        )}
      </div>
    </div>
  )
}
