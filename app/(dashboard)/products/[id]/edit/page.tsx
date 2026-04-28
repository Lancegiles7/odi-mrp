import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateProduct } from '../../actions'
import { ProductForm } from '@/components/products/product-form'
import { BomEditor } from '@/components/products/bom-editor'
import { getAppSettings } from '@/lib/settings'
import type {
  BomItemWithIngredient,
  Ingredient,
  Product,
} from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Edit Product' }

interface PageProps {
  params: { id: string }
  searchParams: { error?: string }
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'SKU Code and Product Name are required.',
  duplicate_sku:  'A product with that SKU Code already exists.',
  server:         'Something went wrong. Please try again.',
}

export default async function EditProductPage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data: product }, { data: ingredients }, settings] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        boms (
          id, version, is_active,
          bom_items (
            id, ingredient_id, quantity_g, uom, price_override, notes, sort_order,
            ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic )
          )
        )
      `)
      .eq('id', params.id)
      .single() as unknown as Promise<{ data: (Product & { boms: Array<{ id: string; version: number; is_active: boolean; bom_items: BomItemWithIngredient[] }> }) | null }>,
    supabase
      .from('ingredients')
      .select('id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    getAppSettings(),
  ])

  if (!product) notFound()

  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? null) : null
  const action = updateProduct.bind(null, params.id)

  const activeBom = product.boms?.find((b) => b.is_active)
  const bomItems: BomItemWithIngredient[] = (activeBom?.bom_items ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const allIngredients = (ingredients ?? []) as Pick<
    Ingredient,
    'id' | 'name' | 'sku_code' | 'unit_of_measure' | 'total_loaded_cost' | 'is_organic'
  >[]

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href={`/products/${params.id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {product.name}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Edit product</h1>
      </div>

      <ProductForm
        product={product}
        action={action}
        errorMessage={errorMessage}
        fxRate={Number(settings.fx_rate)}
      />

      {/* BOM editor — shown below the main form */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Ingredients / BOM</h2>
            {activeBom && (
              <p className="text-xs text-gray-400 mt-0.5">Version {activeBom.version} (active)</p>
            )}
          </div>
          <Link
            href={`/ingredients/new?return_to=${encodeURIComponent(`/products/${params.id}/edit`)}`}
            className="text-sm px-2.5 py-1 border border-gray-900 bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            + Create new ingredient
          </Link>
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
