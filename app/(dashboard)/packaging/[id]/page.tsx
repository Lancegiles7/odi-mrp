import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PackagingForm, type PackagingInitial } from '@/components/packaging/packaging-form'
import { updatePackaging } from '@/app/(dashboard)/packaging/actions'
import type { FxRates } from '@/lib/packaging-cost'

export const metadata: Metadata = { title: 'Packaging item' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

export default async function EditPackagingPage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data }, { data: suppliers }, { data: settings }, { data: usedIn }, { data: balance }] = await Promise.all([
    supabase.from('packaging')
      .select('id, sku_code, name, type, unit_of_measure, description, supplier_id, supplier_sku_code, supplier_pack_size, supplier_pack_unit, price, currency, fx_rate_override, freight_per_unit_nzd, opening_stock_override, reorder_point, is_active, notes')
      .eq('id', params.id)
      .maybeSingle() as { data: PackagingInitial | null },
    supabase.from('suppliers').select('id, name').order('name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('app_settings').select('fx_rates').eq('id', 1).maybeSingle() as { data: { fx_rates: FxRates } | null },
    supabase.from('product_packaging')
      .select('product_id, quantity_per_unit, products(sku_code, name)')
      .eq('packaging_id', params.id) as { data: Array<{ product_id: string; quantity_per_unit: number; products: { sku_code: string; name: string } | null }> | null },
    supabase.from('inventory_balances').select('quantity_on_hand').eq('packaging_id', params.id).maybeSingle() as { data: { quantity_on_hand: number } | null },
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

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Used in (products)</h3>
          <span className="text-[11px] text-gray-500">Stock on hand: {Math.round(Number(balance?.quantity_on_hand ?? data.opening_stock_override ?? 0)).toLocaleString()}</span>
        </div>
        {(usedIn ?? []).length === 0 ? (
          <p className="text-xs text-gray-500">Not on any product&rsquo;s BOM yet. Add this packaging to a product&rsquo;s Packaging BOM to flow demand through.</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500"><th className="text-left px-3 py-1.5">Product</th><th className="text-right px-3 py-1.5 w-[160px]">Qty per product unit</th></tr></thead>
            <tbody>
              {(usedIn ?? []).map((u) => (
                <tr key={u.product_id} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">
                    <Link href={`/products/${u.product_id}`} className="hover:underline">{u.products?.name ?? '—'}</Link>
                    {u.products?.sku_code && <span className="text-[10px] text-gray-500 ml-2 font-mono">{u.products.sku_code}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{u.quantity_per_unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
