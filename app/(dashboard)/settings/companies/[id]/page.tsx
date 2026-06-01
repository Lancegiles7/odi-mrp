import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CompanyForm } from '@/components/companies/company-form'
import { DeleteCompanyButton } from '@/components/companies/delete-company-button'
import { updateCompany } from '@/app/(dashboard)/settings/companies/actions'

export const metadata: Metadata = { title: 'PO company' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

interface CompanyRow {
  id:                     string
  legal_name:             string
  country:                string | null
  business_number_label:  string | null
  business_number:        string | null
  tax_number_label:       string | null
  tax_number:             string | null
  address:                string | null
  website:                string | null
  email:                  string | null
  phone:                  string | null
  logo_path:              string | null
  brand_colour:           string | null
  is_default:             boolean
  is_active:              boolean
  notes:                  string | null
}

export default async function EditCompanyPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data } = await supabase
    .from('po_companies')
    .select('id, legal_name, country, business_number_label, business_number, tax_number_label, tax_number, address, website, email, phone, logo_path, brand_colour, is_default, is_active, notes')
    .eq('id', params.id)
    .maybeSingle() as { data: CompanyRow | null }

  if (!data) notFound()

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/settings" className="hover:text-gray-900">Settings</Link>
        <span>/</span>
        <Link href="/settings/companies" className="hover:text-gray-900">PO companies</Link>
        <span>/</span>
        <span className="text-gray-900">{data.legal_name}</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">{data.legal_name}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <CompanyForm
          action={updateCompany}
          savedAt={searchParams.saved === '1'}
          error={searchParams.error}
          initial={data}
        />
      </div>

      <div className="mt-5 bg-white border border-red-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h2>
        <p className="text-xs text-gray-500 mb-3">Permanent. Blocked if any POs reference this company.</p>
        <DeleteCompanyButton id={data.id} name={data.legal_name} />
      </div>
    </div>
  )
}
