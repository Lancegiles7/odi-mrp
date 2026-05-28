import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'PO issuers' }

interface IssuerRow {
  id: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  is_default: boolean
  is_active: boolean
}

export default async function IssuersPage() {
  const supabase = createClient()
  const { data } = await supabase
    .from('po_issuers')
    .select('id, name, title, phone, email, is_default, is_active')
    .order('is_default', { ascending: false })
    .order('name') as { data: IssuerRow[] | null }
  const rows = data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/settings" className="hover:text-gray-900">Settings</Link>
            <span>/</span>
            <span className="text-gray-900">PO issuers</span>
          </nav>
          <h1 className="text-2xl font-semibold">PO issuers</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} saved · choose one as the &ldquo;Issued by&rdquo; contact on each PO. The default is used for new POs.</p>
        </div>
        <Link href="/settings/issuers/new" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800">+ New issuer</Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Title</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium w-[100px]">Default</th>
              <th className="text-left px-3 py-2 font-medium w-[80px]">Status</th>
              <th className="text-right px-3 py-2 font-medium w-[60px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/settings/issuers/${r.id}`} className="hover:underline">{r.name}</Link>
                </td>
                <td className="px-4 py-2 text-gray-700">{r.title ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-gray-700">{r.phone ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-gray-700">{r.email ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2">
                  {r.is_default
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">★ Default</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  {r.is_active
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/settings/issuers/${r.id}`} className="text-xs text-blue-600 hover:underline font-medium">Edit</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No issuers yet. Add one to use as the &ldquo;Issued by&rdquo; on POs.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
