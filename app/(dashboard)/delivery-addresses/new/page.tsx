import type { Metadata } from 'next'
import Link from 'next/link'
import { AddressForm } from '@/components/delivery-addresses/address-form'
import { createDeliveryAddress } from '@/app/(dashboard)/delivery-addresses/actions'

export const metadata: Metadata = { title: 'New delivery address' }

interface PageProps { searchParams: { error?: string } }

export default function NewDeliveryAddressPage({ searchParams }: PageProps) {
  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/delivery-addresses" className="hover:text-gray-900">Delivery addresses</Link>
        <span>/</span>
        <span className="text-gray-900">New</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">New delivery address</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <AddressForm
          action={createDeliveryAddress}
          error={searchParams.error}
          initial={{
            label: '', street: '', contact_name: null, phone: null,
            country: 'NZ', is_default: false, is_active: true, notes: null,
          }}
        />
      </div>
    </div>
  )
}
