import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ingredients/status-badge'
import { PriceHistory } from '@/components/ingredients/price-history'
import type {
  IngredientStatus,
  IngredientWithSupplier,
  IngredientPriceHistory,
} from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Ingredient' }

interface PageProps {
  params: { id: string }
}

export default async function IngredientDetailPage({ params }: PageProps) {
  const supabase = createClient()

  const [{ data: ingredient }, { data: history }, { count: usedInCount }] = await Promise.all([
    supabase
      .from('ingredients')
      .select(`
        *,
        suppliers (
          id, code, name,
          contact_name, email, phone,
          country_of_origin, country_of_purchase, currency
        )
      `)
      .eq('id', params.id)
      .single() as unknown as Promise<{ data: IngredientWithSupplier | null }>,
    supabase
      .from('ingredient_price_history')
      .select('*')
      .eq('ingredient_id', params.id)
      .order('changed_at', { ascending: false })
      .limit(50) as unknown as Promise<{ data: IngredientPriceHistory[] | null }>,
    supabase
      .from('bom_items')
      .select('id', { count: 'exact', head: true })
      .eq('ingredient_id', params.id),
  ])

  if (!ingredient) notFound()

  // Count distinct suppliers also-linked ingredients for the "shared with" line
  let sharedCount = 0
  if (ingredient.supplier_id) {
    const { count } = await supabase
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', ingredient.supplier_id)
      .neq('id', ingredient.id)
      .eq('is_active', true)
    sharedCount = count ?? 0
  }

  const latest = history?.[0] ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/ingredients" className="text-sm text-gray-500 hover:text-gray-900">
            ← Ingredients
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{ingredient.name}</h1>
            <StatusBadge status={ingredient.status as IngredientStatus} />
            {ingredient.is_organic ? (
              <span className="px-2 py-0.5 text-xs rounded bg-green-50 text-green-700">Organic</span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded bg-orange-50 text-orange-700">Non-Organic</span>
            )}
          </div>
          <div className="mt-1 text-xs font-mono text-gray-600">{ingredient.sku_code}</div>
        </div>
        <Link
          href={`/ingredients/${ingredient.id}/edit`}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Basics */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Basics</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Unit of measure" value={ingredient.unit_of_measure} />
            <Row label="Lead time" value={ingredient.lead_time} />
            <Row label="Used in" value={usedInCount != null ? `${usedInCount} BOM line${usedInCount === 1 ? '' : 's'}` : '—'} />
            <Row label="Reorder point" value={ingredient.reorder_point != null ? `${ingredient.reorder_point}` : null} />
          </dl>
        </div>

        {/* Supplier */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Supplier</h3>
            <Link href={`/ingredients/${ingredient.id}/edit`} className="text-xs text-gray-500 hover:underline">
              Change supplier
            </Link>
          </div>
          {ingredient.suppliers ? (
            <>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <Field label="Supplier" value={ingredient.suppliers.name} />
                <Field label="Country of origin" value={ingredient.suppliers.country_of_origin} />
                <Field label="Country of purchase" value={
                  ingredient.suppliers.country_of_purchase
                    ? `${ingredient.suppliers.country_of_purchase}${ingredient.suppliers.currency ? ` (${ingredient.suppliers.currency})` : ''}`
                    : null
                } />
                <Field label="Contact name" value={ingredient.suppliers.contact_name} />
                <Field label="Phone" value={ingredient.suppliers.phone} />
                <Field label="Email" value={ingredient.suppliers.email} />
              </div>
              {sharedCount > 0 && (
                <div className="mt-3 text-[11px] text-gray-500 bg-gray-50 rounded p-2">
                  This supplier is shared with <span className="font-medium">{sharedCount} other ingredient{sharedCount === 1 ? '' : 's'}</span>. Editing their contact details updates all linked ingredients.
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-amber-700 bg-amber-50 rounded p-3">
              No supplier linked.{' '}
              {ingredient.confirmed_supplier && (
                <>Legacy text value: <span className="font-medium">{ingredient.confirmed_supplier}</span>. </>
              )}
              <Link href={`/ingredients/${ingredient.id}/edit`} className="underline">Link a supplier →</Link>
            </div>
          )}
        </div>
      </div>

      {/* Current pricing */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Current pricing</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-500">Price</span>
              <span className="font-semibold">{ingredient.price != null ? `${formatCurrency(ingredient.price)} /${ingredient.unit_of_measure ?? 'unit'}` : '—'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-500">Freight</span>
              <span className="font-semibold">{ingredient.freight != null ? `${formatCurrency(ingredient.freight)} /${ingredient.unit_of_measure ?? 'unit'}` : '—'}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 mt-2 border-t border-gray-100">
              <span className="font-medium">Total loaded</span>
              <span className="text-xl font-bold">
                {ingredient.total_loaded_cost != null ? formatCurrency(ingredient.total_loaded_cost) : '—'}
              </span>
            </div>
            {latest && (
              <p className="text-[11px] text-gray-500">
                As of {formatDate(latest.changed_at)}. Latest price always flows into active BOMs.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 col-span-2">
          <PriceHistory history={history ?? []} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value ?? <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  )
}
