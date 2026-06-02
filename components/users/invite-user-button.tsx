'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteUser } from '@/app/(dashboard)/settings/users/actions'

interface RoleOpt { id: string; name: string }

function formatRoleLabel(name: string): string {
  return name.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function roleDescription(name: string): string {
  switch (name) {
    case 'admin':         return 'full access including users & settings'
    case 'operations':    return 'production, products, BOMs'
    case 'supply_chain':  return 'ingredients, suppliers, POs'
    case 'finance':       return 'view all + raise POs'
    case 'read_only':     return 'view-only'
    default:              return ''
  }
}

/**
 * "+ Invite user" button + modal. Opens a small dialog with name/email/role,
 * fires the inviteUser server action, then refreshes the list. The actual
 * email is sent by Supabase's invite flow (auth.admin.inviteUserByEmail).
 *
 * Modal stays open on error so the admin can fix and retry. Closes on
 * success and a green banner shows on the list page (via ?invited=1).
 */
export function InviteUserButton({ roles }: { roles: RoleOpt[] }) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [pending, start]      = useTransition()
  const [error,   setError]   = useState<string | null>(null)

  // Default role: read_only (safest). The admin can pick something else.
  const defaultRoleId = roles.find((r) => r.name === 'read_only')?.id ?? roles[0]?.id ?? ''

  function onSubmit(formData: FormData) {
    setError(null)
    start(async () => {
      const res = await inviteUser(formData)
      if (!res.ok) { setError(res.error ?? 'Invite failed'); return }
      setOpen(false)
      router.push('/settings/users?invited=1')
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
      >
        + Invite user
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold">Invite a new user</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">They&rsquo;ll receive an email with a link to set their password and sign in.</p>
            </div>

            <form action={onSubmit} className="px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Full name <span className="text-red-500">*</span></label>
                <input name="full_name" required maxLength={80} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Mark Kim" />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Email <span className="text-red-500">*</span></label>
                <input name="email" type="email" required className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="mark@odinutrition.com" />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Role <span className="text-red-500">*</span></label>
                <select name="role_id" defaultValue={defaultRoleId} required className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white">
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {formatRoleLabel(r.name)}{roleDescription(r.name) ? ` — ${roleDescription(r.name)}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Permissions are enforced by the database — pick the smallest role they need.</p>
              </div>

              {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50">
                  {pending ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
