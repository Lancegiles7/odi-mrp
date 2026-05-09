import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SupplierForm } from '@/components/suppliers/supplier-form'
import { DeleteSupplierButton } from '@/components/suppliers/delete-supplier-button'
import { updateSupplier } from '@/app/(dashboard)/suppliers/actions'

export const metadata: Metadata = { title: 'Supplier' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

interface SupplierRow {
  id: string
  code: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  payment_terms: string | null
  lead_time_days: number | null
  notes: string | null
  is_active: boolean
}

export default async function EditSupplierPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id, code, name, contact_name, email, phone, address, payment_terms, lead_time_days, notes, is_active')
    .eq('id', params.id)
    .maybeSingle() as { data: SupplierRow | null }

  if (!data) notFound()

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/suppliers" className="hover:text-gray-900">Suppliers</Link>
        <span>/</span>
        <span className="text-gray-900">{data.name}</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">{data.name}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <SupplierForm
          action={updateSupplier}
          savedAt={searchParams.saved === '1'}
          error={searchParams.error}
          initial={data}
        />
      </div>

      <div className="mt-5 bg-white border border-red-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h2>
        <p className="text-xs text-gray-500 mb-3">
          Permanent. Only allowed if no purchase orders, ingredients, or packaging items reference this supplier.
        </p>
        <DeleteSupplierButton id={data.id} name={data.name} />
      </div>
    </div>
  )
}
