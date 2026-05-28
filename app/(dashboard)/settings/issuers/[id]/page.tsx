import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IssuerForm } from '@/components/issuers/issuer-form'
import { DeleteIssuerButton } from '@/components/issuers/delete-issuer-button'
import { updateIssuer } from '@/app/(dashboard)/settings/issuers/actions'

export const metadata: Metadata = { title: 'PO issuer' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

interface IssuerRow {
  id: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  is_default: boolean
  is_active: boolean
  notes: string | null
}

export default async function EditIssuerPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data } = await supabase
    .from('po_issuers')
    .select('id, name, title, phone, email, is_default, is_active, notes')
    .eq('id', params.id)
    .maybeSingle() as { data: IssuerRow | null }

  if (!data) notFound()

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/settings" className="hover:text-gray-900">Settings</Link>
        <span>/</span>
        <Link href="/settings/issuers" className="hover:text-gray-900">PO issuers</Link>
        <span>/</span>
        <span className="text-gray-900">{data.name}</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">{data.name}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <IssuerForm
          action={updateIssuer}
          savedAt={searchParams.saved === '1'}
          error={searchParams.error}
          initial={data}
        />
      </div>

      <div className="mt-5 bg-white border border-red-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h2>
        <p className="text-xs text-gray-500 mb-3">Permanent. Blocked if any POs reference this issuer.</p>
        <DeleteIssuerButton id={data.id} name={data.name} />
      </div>
    </div>
  )
}
