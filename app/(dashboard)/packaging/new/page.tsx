import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PackagingForm } from '@/components/packaging/packaging-form'
import { createPackaging } from '@/app/(dashboard)/packaging/actions'
import type { FxRates } from '@/lib/packaging-cost'

export const metadata: Metadata = { title: 'New packaging' }

interface PageProps { searchParams: { error?: string } }

export default async function NewPackagingPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const [{ data: suppliers }, { data: settings }] = await Promise.all([
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name') as { data: Array<{ id: string; name: string }> | null },
    supabase.from('app_settings').select('fx_rates').eq('id', 1).maybeSingle() as { data: { fx_rates: FxRates } | null },
  ])

  const fxRates = settings?.fx_rates ?? { NZD: 1 }

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/packaging" className="hover:text-gray-900">Packaging</Link>
        <span>/</span>
        <span className="text-gray-900">New</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">New packaging item</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <PackagingForm
          action={createPackaging}
          suppliers={suppliers ?? []}
          fxRates={fxRates}
          error={searchParams.error}
          initial={{
            sku_code: '', name: '', type: 'OTHER', unit_of_measure: 'each', description: null,
            supplier_id: null, supplier_sku_code: null, supplier_pack_size: null, supplier_pack_unit: null,
            price: null, currency: 'NZD', fx_rate_override: null, freight_per_unit_nzd: null,
            opening_stock_override: null, reorder_point: null, is_active: true, notes: null,
          }}
        />
      </div>
    </div>
  )
}
