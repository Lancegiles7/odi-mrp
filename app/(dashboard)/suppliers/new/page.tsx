import type { Metadata } from 'next'
import Link from 'next/link'
import { SupplierForm } from '@/components/suppliers/supplier-form'
import { createSupplier } from '@/app/(dashboard)/suppliers/actions'

export const metadata: Metadata = { title: 'New supplier' }

interface PageProps { searchParams: { error?: string } }

export default function NewSupplierPage({ searchParams }: PageProps) {
  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/suppliers" className="hover:text-gray-900">Suppliers</Link>
        <span>/</span>
        <span className="text-gray-900">New</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">New supplier</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <SupplierForm
          action={createSupplier}
          error={searchParams.error}
          initial={{
            code: '', name: '', contact_name: null, email: null, phone: null,
            address: null, payment_terms: null, lead_time_days: null, notes: null, is_active: true,
          }}
        />
      </div>
    </div>
  )
}
