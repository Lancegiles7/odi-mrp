import type { Metadata } from 'next'
import Link from 'next/link'
import { IssuerForm } from '@/components/issuers/issuer-form'
import { createIssuer } from '@/app/(dashboard)/settings/issuers/actions'

export const metadata: Metadata = { title: 'New PO issuer' }

interface PageProps { searchParams: { error?: string } }

export default function NewIssuerPage({ searchParams }: PageProps) {
  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/settings" className="hover:text-gray-900">Settings</Link>
        <span>/</span>
        <Link href="/settings/issuers" className="hover:text-gray-900">PO issuers</Link>
        <span>/</span>
        <span className="text-gray-900">New</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">New PO issuer</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <IssuerForm
          action={createIssuer}
          error={searchParams.error}
          initial={{ name: '', title: null, phone: null, email: null, is_default: false, is_active: true, notes: null }}
        />
      </div>
    </div>
  )
}
