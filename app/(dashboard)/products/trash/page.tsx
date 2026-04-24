import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES, PRODUCT_GROUP_LABELS, SOFT_DELETE_WINDOW_DAYS } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'
import {
  purgeExpiredProducts,
  restoreProduct,
} from '../actions'
import { PurgeProductButton } from '@/components/products/purge-product-button'

export const metadata: Metadata = { title: 'Product trash' }

interface PageProps {
  searchParams: { purged?: string; error?: string }
}

export default async function ProductTrashPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('roles(name)').eq('id', user.id).maybeSingle() as { data: { roles: { name: string } | null } | null }
  if (profile?.roles?.name !== ROLES.ADMIN) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold">Product trash</h1>
        <p className="mt-4 text-sm text-gray-600">
          You need the <span className="font-medium">Admin</span> role to access the trash.
        </p>
      </div>
    )
  }

  // Self-clean: purge anything past the 30-day window before showing
  const { purged } = await purgeExpiredProducts()

  const { data: rows } = await supabase
    .from('products')
    .select('id, sku_code, name, product_type, deleted_at, deleted_by, user_profiles:deleted_by(full_name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false }) as unknown as { data: Array<{
      id: string
      sku_code: string
      name: string
      product_type: string | null
      deleted_at: string
      deleted_by: string | null
      user_profiles: { full_name: string } | null
    }> | null }

  const items = rows ?? []
  const nowMs = Date.now()

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/products" className="text-sm text-gray-500 hover:text-gray-900">← Products / BOMs</Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">Trash</h1>
          <p className="text-sm text-gray-500 mt-1">
            Soft-deleted products. Automatically purged after {SOFT_DELETE_WINDOW_DAYS} days. Admin only.
          </p>
        </div>
      </div>

      {searchParams.purged && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Product permanently deleted.
        </div>
      )}
      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {searchParams.error === 'restore_failed' ? 'Could not restore — please try again.' : 'Could not permanently delete — please try again.'}
        </div>
      )}
      {purged > 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
          Auto-purged {purged} item{purged === 1 ? '' : 's'} past the {SOFT_DELETE_WINDOW_DAYS}-day window.
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-500">Trash is empty.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="text-left font-medium px-4 py-2.5">SKU</th>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Group</th>
                <th className="text-left font-medium px-4 py-2.5">Deleted</th>
                <th className="text-right font-medium px-4 py-2.5">Days left</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row) => {
                const deletedMs  = new Date(row.deleted_at).getTime()
                const expiresMs  = deletedMs + SOFT_DELETE_WINDOW_DAYS * 24 * 60 * 60 * 1000
                const daysLeft   = Math.max(0, Math.ceil((expiresMs - nowMs) / (24 * 60 * 60 * 1000)))
                const urgency    =
                  daysLeft <= 3 ? 'bg-red-50 text-red-700' :
                  daysLeft <= 7 ? 'bg-amber-50 text-amber-700' :
                                  'bg-gray-100 text-gray-700'
                const groupLabel =
                  row.product_type ? PRODUCT_GROUP_LABELS[row.product_type] ?? row.product_type : '—'

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{row.sku_code}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-2 text-gray-600">{groupLabel}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {formatDateTime(row.deleted_at)}
                      {row.user_profiles?.full_name && (
                        <span className="block text-[11px] text-gray-400">by {row.user_profiles.full_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${urgency}`}>
                        {daysLeft}d
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <form action={restoreProduct.bind(null, row.id)}>
                          <button
                            type="submit"
                            className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            Restore
                          </button>
                        </form>
                        <PurgeProductButton productId={row.id} productName={row.name} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
