import type { Metadata } from 'next'
import Link from 'next/link'
import { CompanyForm } from '@/components/companies/company-form'
import { createCompany } from '@/app/(dashboard)/settings/companies/actions'

export const metadata: Metadata = { title: 'New PO company' }

interface PageProps { searchParams: { error?: string } }

export default function NewCompanyPage({ searchParams }: PageProps) {
  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/settings" className="hover:text-gray-900">Settings</Link>
        <span>/</span>
        <Link href="/settings/companies" className="hover:text-gray-900">PO companies</Link>
        <span>/</span>
        <span className="text-gray-900">New</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">New PO company</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <CompanyForm
          action={createCompany}
          error={searchParams.error}
          initial={{
            legal_name: '', country: null,
            business_number_label: null, business_number: null,
            tax_number_label: null, tax_number: null,
            address: null, website: null, email: null, phone: null,
            logo_path: null, brand_colour: null,
            is_default: false, is_active: true, notes: null,
          }}
        />
      </div>
    </div>
  )
}
