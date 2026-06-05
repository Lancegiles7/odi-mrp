import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ROLES, INGREDIENT_CERTIFICATIONS } from '@/lib/constants'
import { StatusBadge } from '@/components/ingredients/status-badge'
import { PriceHistory } from '@/components/ingredients/price-history'
import { DeleteIngredientButton } from '@/components/ingredients/delete-ingredient-button'
import { IngredientDocuments } from '@/components/ingredients/ingredient-documents'
import type { UploadedDoc } from '@/app/(dashboard)/ingredients/[id]/documents/actions'
import type {
  IngredientStatus,
  IngredientCertification,
  IngredientDocType,
  IngredientWithSupplier,
  IngredientPriceHistory,
} from '@/lib/types/database.types'

const CERT_BY_VALUE = new Map(INGREDIENT_CERTIFICATIONS.map((c) => [c.value, c]))

export const metadata: Metadata = { title: 'Ingredient' }

interface PageProps {
  params: { id: string }
  searchParams: { restored?: string; error?: string }
}

export default async function IngredientDetailPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('user_profiles').select('roles(name)').eq('id', user?.id ?? '').maybeSingle() as { data: { roles: { name: string } | null } | null }
  const isAdmin = profile?.roles?.name === ROLES.ADMIN

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

  // List of ACTIVE products whose active BOM references this ingredient.
  // Now also returns quantity_g so the detail page can show "Xg / unit"
  // next to each product, and the Delete dialog gets the same data.
  const { data: activeBomLinks } = await supabase
    .from('bom_items')
    .select('quantity_g, boms!inner(product_id, is_active)')
    .eq('ingredient_id', params.id)
    .eq('boms.is_active', true) as unknown as { data: Array<{ quantity_g: number; boms: { product_id: string; is_active: boolean } | null }> | null }

  const productQty = new Map<string, number>()
  for (const link of activeBomLinks ?? []) {
    const pid = link.boms?.product_id
    if (!pid) continue
    productQty.set(pid, (productQty.get(pid) ?? 0) + Number(link.quantity_g ?? 0))
  }
  const inUseProductIds = Array.from(productQty.keys())

  const { data: inUseProductRows } = inUseProductIds.length === 0
    ? { data: [] as Array<{ id: string; name: string; product_type: string | null }> }
    : await supabase
        .from('products')
        .select('id, name, product_type')
        .in('id', inUseProductIds)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name') as unknown as { data: Array<{ id: string; name: string; product_type: string | null }> | null }

  const inUseProducts = inUseProductRows ?? []
  const inUseProductsWithQty = inUseProducts.map((p) => ({
    ...p,
    quantity_g: productQty.get(p.id) ?? 0,
  }))

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

  // ── Documents ─────────────────────────────────────────────────
  const { data: docRows } = await supabase
    .from('ingredient_documents')
    .select(`
      id, file_name, doc_type, size_bytes, notes, expires_at, uploaded_at,
      user_profiles!ingredient_documents_uploaded_by_fkey ( full_name )
    `)
    .eq('ingredient_id', params.id)
    .order('uploaded_at', { ascending: false }) as unknown as { data: Array<{
      id: string; file_name: string; doc_type: IngredientDocType;
      size_bytes: number | null; notes: string | null; expires_at: string | null;
      uploaded_at: string;
      user_profiles: { full_name: string | null } | null
    }> | null }

  const initialDocs: UploadedDoc[] = (docRows ?? []).map((d) => ({
    id:              d.id,
    file_name:       d.file_name,
    doc_type:        d.doc_type,
    size_bytes:      d.size_bytes,
    notes:           d.notes,
    expires_at:      d.expires_at,
    uploaded_at:     d.uploaded_at,
    uploaded_by_name: d.user_profiles?.full_name ?? null,
  }))

  const cert = (ingredient as unknown as { certification?: string | null }).certification
  const certInfo = cert ? CERT_BY_VALUE.get(cert as IngredientCertification) : null
  const origin = (ingredient as unknown as { origin?: string | null }).origin

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/ingredients" className="text-sm text-gray-500 hover:text-gray-900">
            ← Ingredients
          </Link>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold">{ingredient.name}</h1>
            <StatusBadge status={ingredient.status as IngredientStatus} />
            {ingredient.is_organic ? (
              <span className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700 font-medium">Organic</span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-700 font-medium">Non-Organic</span>
            )}
            {certInfo && (
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${certInfo.chip}`}>{certInfo.label}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-600 flex items-center gap-3">
            <span className="font-mono">{ingredient.sku_code}</span>
            {origin && <span>· Origin: <span className="font-medium">{origin}</span></span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <DeleteIngredientButton
              ingredientId={ingredient.id}
              ingredientName={ingredient.name}
              inUseProducts={inUseProducts}
            />
          )}
          <Link
            href={`/ingredients/${ingredient.id}/edit`}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Edit
          </Link>
        </div>
      </div>

      {searchParams.restored && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Ingredient restored from trash.
        </div>
      )}
      {searchParams.error === 'delete_failed' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Could not delete — please try again.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Basics */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Basics</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Unit of measure" value={ingredient.unit_of_measure} />
            <Row label="Lead time" value={ingredient.lead_time} />
            <Row label="Origin" value={origin ?? null} />
            <Row label="Certification" value={certInfo?.label ?? null} />
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

      {/* Used in BOMs — full list (was a count before). */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold">Used in (BOMs)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {inUseProductsWithQty.length === 0
              ? 'Not used in any active product BOM yet.'
              : `${inUseProductsWithQty.length} active product${inUseProductsWithQty.length === 1 ? '' : 's'} use${inUseProductsWithQty.length === 1 ? 's' : ''} this ingredient.`}
          </p>
        </div>
        {inUseProductsWithQty.length > 0 && (
          <ul className="divide-y divide-gray-100 text-sm">
            {inUseProductsWithQty.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.id}`}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 hover:underline">{p.name}</span>
                  <span className="text-xs text-gray-500 tabular-nums">{p.quantity_g.toLocaleString()} g / unit</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Documents — uploads stored in Storage bucket `ingredient-docs`. */}
      <IngredientDocuments
        ingredientId={ingredient.id}
        ingredientName={ingredient.name}
        initialDocs={initialDocs}
      />
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
