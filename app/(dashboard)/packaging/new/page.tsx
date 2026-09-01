import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BatchCreateForm } from '@/components/packaging/batch-create-form'

export const metadata: Metadata = { title: 'New packaging' }

interface PageProps { searchParams: { product_id?: string; return_to?: string } }

export default async function NewPackagingPage({ searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data: products }, { data: suppliers }] = await Promise.all([
    supabase.from('products')
      .select('id, sku_code, name')
      .eq('is_active', true)
      .order('name') as { data: Array<{ id: string; sku_code: string | null; name: string }> | null },
    supabase.from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name') as { data: Array<{ id: string; name: string }> | null },
  ])

  return (
    <div className="max-w-[1300px]">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/packaging" className="hover:text-gray-900">Packaging</Link>
        <span>/</span>
        <span className="text-gray-900">New</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-1">New packaging items</h1>
      <p className="text-sm text-gray-500 mb-5">
        Add a row per packaging item — each row creates one packaging SKU. Pick a product to link them to it
        at the same time, or leave that blank for shared items like ecom dispatch boxes. Need to edit a single
        existing item? Open it from the
        <Link href="/packaging" className="underline mx-1">Packaging list</Link>.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <BatchCreateForm
          products={products ?? []}
          suppliers={suppliers ?? []}
          defaultProduct={searchParams.product_id ?? null}
        />
      </div>
    </div>
  )
}
