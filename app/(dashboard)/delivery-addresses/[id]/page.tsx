import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AddressForm } from '@/components/delivery-addresses/address-form'
import { updateDeliveryAddress } from '@/app/(dashboard)/delivery-addresses/actions'

export const metadata: Metadata = { title: 'Delivery address' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

interface AddressRow {
  id: string
  label: string
  street: string
  contact_name: string | null
  phone: string | null
  country: 'NZ' | 'AU'
  is_default: boolean
  is_active: boolean
  notes: string | null
}

export default async function EditDeliveryAddressPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data } = await supabase
    .from('delivery_addresses')
    .select('id, label, street, contact_name, phone, country, is_default, is_active, notes')
    .eq('id', params.id)
    .maybeSingle() as { data: AddressRow | null }

  if (!data) notFound()

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/delivery-addresses" className="hover:text-gray-900">Delivery addresses</Link>
        <span>/</span>
        <span className="text-gray-900">{data.label}</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">{data.label}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <AddressForm
          action={updateDeliveryAddress}
          savedAt={searchParams.saved === '1'}
          error={searchParams.error}
          initial={data}
        />
      </div>
    </div>
  )
}
