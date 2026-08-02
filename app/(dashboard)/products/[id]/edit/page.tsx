import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateProduct } from '../../actions'
import { ProductForm } from '@/components/products/product-form'
import { BomEditor } from '@/components/products/bom-editor'
import { ProductPackagingBom } from '@/components/packaging/product-packaging-bom'
import { AuBuildButton } from '@/components/products/au-build-button'
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

  const [{ data: product }, { data: ingredients }, settings, { data: packaging }, { data: productPackaging }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        boms (
          id, version, is_active, market,
          bom_items (
            id, ingredient_id, quantity_g, wet_quantity_g, unit_quantity, uom, price_override, notes, sort_order,
            ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, total_loaded_cost_au, is_organic, currency, price )
          )
        )
      `)
      .eq('id', params.id)
      .single() as unknown as Promise<{ data: (Product & { boms: Array<{ id: string; version: number; is_active: boolean; market: string; bom_items: BomItemWithIngredient[] }> }) | null }>,
    supabase
      .from('ingredients')
      .select('id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    getAppSettings(),
    supabase
      .from('packaging')
      .select('id, sku_code, name, type, unit_of_measure, total_loaded_cost_nzd')
      .eq('is_active', true)
      .order('name') as { data: Array<{ id: string; sku_code: string; name: string; type: string; unit_of_measure: string; total_loaded_cost_nzd: number | null }> | null },
    supabase
      .from('product_packaging')
      .select('packaging_id, quantity_per_unit, entry_mode, entry_value, include_in_cost, notes, market')
      .eq('product_id', params.id) as { data: Array<{ packaging_id: string; quantity_per_unit: number; entry_mode: string | null; entry_value: number | null; include_in_cost: boolean; notes: string | null; market: string | null }> | null },
  ])

  if (!product) notFound()

  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? null) : null
  const action = updateProduct.bind(null, params.id)

  const sortItems = (items: BomItemWithIngredient[]) =>
    items.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // The NZ build is the default (rows with no market tag count as NZ); the AU
  // build is optional and only present once "Add AU build" has been run.
  const nzBom = product.boms?.find((b) => b.is_active && (b.market ?? 'NZ') === 'NZ')
  const auBom = product.boms?.find((b) => b.is_active && b.market === 'AU')
  const nzItems = sortItems(nzBom?.bom_items ?? [])
  const auItems = sortItems(auBom?.bom_items ?? [])

  const packRows = (m: 'NZ' | 'AU') =>
    (productPackaging ?? [])
      .filter((r) => (r.market ?? 'NZ') === m)
      .map((r) => ({
        packaging_id: r.packaging_id,
        entry_mode: (r.entry_mode === 'per_group' ? 'per_group' : 'per_pack') as 'per_pack' | 'per_group',
        entry_value: r.entry_value != null ? Number(r.entry_value) : Number(r.quantity_per_unit),
        include_in_cost: r.include_in_cost ?? true,
        notes: r.notes,
      }))

  const allIngredients = (ingredients ?? []) as Pick<
    Ingredient,
    'id' | 'name' | 'sku_code' | 'unit_of_measure' | 'total_loaded_cost' | 'is_organic'
  >[]

  const hasAuBuild = !!auBom
  const makerNz = product.manufacturer ?? 'NZ build'
  const makerAu = product.manufacturer_au ?? 'VMC'

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
        fxRate={Number(settings.fx_rates.AUD)}
      />

      {/* ── NZ build ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
        <h2 className="text-base font-semibold text-gray-900">NZ build · {makerNz}</h2>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Ingredients / BOM</h3>
            {nzBom && <p className="text-xs text-gray-400 mt-0.5">Version {nzBom.version} (active)</p>}
          </div>
          <Link
            href={`/ingredients/new?return_to=${encodeURIComponent(`/products/${params.id}/edit`)}`}
            className="text-sm px-2.5 py-1 border border-gray-900 bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            + Create new ingredient
          </Link>
        </div>

        {nzBom ? (
          <BomEditor
            bomId={nzBom.id}
            initialItems={nzItems}
            ingredients={allIngredients}
            sizeG={product.size_g ?? 0}
            servingSize={product.serving_size ?? 0}
          />
        ) : (
          <p className="text-sm text-gray-500">No active BOM found.</p>
        )}
      </div>

      <ProductPackagingBom
        productId={params.id}
        productName={product.name}
        packaging={packaging ?? []}
        market="NZ"
        initialRows={packRows('NZ')}
      />

      {/* ── AU build ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          <h2 className="text-base font-semibold text-gray-900">
            AU build{hasAuBuild ? ` · ${makerAu}` : ''}
          </h2>
          {!hasAuBuild && <span className="text-xs text-gray-400">— made in Australia (e.g. VMC)</span>}
        </div>
        <AuBuildButton productId={params.id} exists={hasAuBuild} />
      </div>

      {hasAuBuild ? (
        <>
          <div className="bg-white border border-amber-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Ingredients / BOM — AU</h3>
                <p className="text-xs text-gray-400 mt-0.5">Seeded from NZ · edit only what VMC sources differently</p>
              </div>
            </div>
            {auBom && (
              <BomEditor
                bomId={auBom.id}
                initialItems={auItems}
                ingredients={allIngredients}
                sizeG={product.size_g ?? 0}
                servingSize={product.serving_size ?? 0}
              />
            )}
          </div>

          <ProductPackagingBom
            productId={params.id}
            productName={product.name}
            packaging={packaging ?? []}
            market="AU"
            initialRows={packRows('AU')}
          />
        </>
      ) : (
        <p className="text-sm text-gray-500 -mt-2">
          This product is made only in NZ. Add an AU build if {makerAu} (or another Australian maker)
          produces it separately — the recipe and packaging start as a copy of NZ, then you change what differs.
        </p>
      )}
    </div>
  )
}
