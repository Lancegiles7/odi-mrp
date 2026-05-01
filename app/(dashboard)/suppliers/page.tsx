import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Suppliers' }

interface SupplierRow {
  id: string
  code: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  payment_terms: string | null
  lead_time_days: number | null
  is_active: boolean
}

export default async function SuppliersPage() {
  const supabase = createClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id, code, name, contact_name, email, phone, payment_terms, lead_time_days, is_active')
    .order('name') as { data: SupplierRow[] | null }

  const rows = data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} suppliers · payment terms shown on POs</p>
        </div>
        <Link href="/suppliers/new" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800">
          + New supplier
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium w-[80px]">Code</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Contact</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium">Payment terms</th>
              <th className="text-right px-3 py-2 font-medium">Lead time</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/suppliers/${s.id}`} className="hover:underline text-gray-900">{s.code}</Link>
                </td>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/suppliers/${s.id}`} className="hover:underline">{s.name}</Link>
                </td>
                <td className="px-4 py-2 text-gray-700">{s.contact_name ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2 text-gray-700">{s.email ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-gray-700">{s.phone ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-gray-700">{s.payment_terms ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-right text-gray-700">{s.lead_time_days != null ? `${s.lead_time_days} days` : <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2">
                  {s.is_active
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">No suppliers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
