import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Delivery addresses' }

interface AddressRow {
  id: string
  label: string
  street: string
  contact_name: string | null
  phone: string | null
  country: 'NZ' | 'AU'
  is_default: boolean
  is_active: boolean
}

export default async function DeliveryAddressesPage() {
  const supabase = createClient()
  const { data } = await supabase
    .from('delivery_addresses')
    .select('id, label, street, contact_name, phone, country, is_default, is_active')
    .order('country').order('label') as { data: AddressRow[] | null }

  const rows = data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Delivery addresses</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} saved · pick from this list when creating a PO</p>
        </div>
        <Link href="/delivery-addresses/new" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800">
          + New address
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Label</th>
              <th className="text-left px-4 py-2 font-medium">Address</th>
              <th className="text-left px-4 py-2 font-medium">Contact</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium w-[60px]">Country</th>
              <th className="text-left px-3 py-2 font-medium w-[100px]">Default</th>
              <th className="text-left px-3 py-2 font-medium w-[80px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/delivery-addresses/${a.id}`} className="hover:underline">{a.label}</Link>
                </td>
                <td className="px-4 py-2 text-gray-700 whitespace-pre-line">{a.street}</td>
                <td className="px-4 py-2 text-gray-700">{a.contact_name ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-gray-700">{a.phone ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.country === 'NZ' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{a.country}</span>
                </td>
                <td className="px-3 py-2">
                  {a.is_default
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">★ {a.country} default</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  {a.is_active
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No saved addresses yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
