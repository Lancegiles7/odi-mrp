import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PackagingForm, type PackagingInitial } from '@/components/packaging/packaging-form'
import { PackagingProductsBom } from '@/components/packaging/packaging-products-bom'
import { DeletePackagingButton } from '@/components/packaging/delete-packaging-button'
import { updatePackaging } from '@/app/(dashboard)/packaging/actions'
import type { FxRates } from '@/lib/packaging-cost'

export const metadata: Metadata = { title: 'Packaging item' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

export default async function EditPackagingPage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data }, { data: suppliers }, { data: settings }, { data: usedIn }, { data: balance }, { data: allProducts }] = await Promise.all([
    supabase.from('packaging')
      .select('id, sku_code, name, type, unit_of_measure, description, supplier_id, supplier_sku_code, supplier_pack_size, supplier_pack_unit, price, currency, fx_rate_override, freight_per_unit_nzd, opening_stock_override, reorder_point, is_active, notes, original_order_qty, original_order_date, original_order_notes, current_soh, current_soh_as_of')
      .eq('id', params.id)
      .maybeSingle() as { data: PackagingInitial | null },
    supabase.from('suppliers').select('id, name').order('name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('app_settings').select('fx_rates').eq('id', 1).maybeSingle() as { data: { fx_rates: FxRates } | null },
    supabase.from('product_packaging')
      .select('product_id, quantity_per_unit, entry_mode, entry_value, include_in_cost, notes')
      .eq('packaging_id', params.id) as { data: Array<{ product_id: string; quantity_per_unit: number; entry_mode: string | null; entry_value: number | null; include_in_cost: boolean; notes: string | null }> | null },
    supabase.from('inventory_balances').select('quantity_on_hand').eq('packaging_id', params.id).maybeSingle() as { data: { quantity_on_hand: number } | null },
    supabase.from('products').select('id, sku_code, name').order('name') as { data: Array<{ id: string; sku_code: string | null; name: string }> | null },
  ])

  if (!data) notFound()

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/packaging" className="hover:text-gray-900">Packaging</Link>
        <span>/</span>
        <span className="text-gray-900">{data.name}</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">{data.name}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
        <PackagingForm
          action={updatePackaging}
          suppliers={suppliers ?? []}
          fxRates={settings?.fx_rates ?? { NZD: 1 }}
          savedAt={searchParams.saved === '1'}
          error={searchParams.error}
          initial={data}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-end mb-2">
          <span className="text-[11px] text-gray-500">Stock on hand: {Math.round(Number(balance?.quantity_on_hand ?? data.opening_stock_override ?? 0)).toLocaleString()}</span>
        </div>
        <PackagingProductsBom
          packagingId={data.id!}
          packagingName={data.name}
          initialRows={(usedIn ?? []).map((u) => ({
            product_id: u.product_id,
            entry_mode: (u.entry_mode === 'per_group' ? 'per_group' : 'per_pack') as 'per_pack' | 'per_group',
            entry_value: u.entry_value != null ? Number(u.entry_value) : Number(u.quantity_per_unit),
            include_in_cost: u.include_in_cost ?? true,
            notes: u.notes,
          }))}
          products={allProducts ?? []}
        />
      </div>

      <div className="mt-5 bg-white border border-red-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h2>
        <p className="text-xs text-gray-500 mb-3">
          Permanent. Product BOM links and inventory balances are cleared. Blocked if any PO lines or stock movements reference this packaging item — mark it inactive instead.
        </p>
        <DeletePackagingButton id={data.id!} name={data.name} />
      </div>
    </div>
  )
}
