'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateUser, resendInvite, hardDeleteUser, setUserPassword } from '@/app/(dashboard)/settings/users/actions'
import { UserAvatar } from '@/components/users/user-avatar'
import { ROLES } from '@/lib/constants'

interface RoleOpt { id: string; name: string }
interface Initial {
  full_name:       string
  role_id:         string
  role_name:       string | null
  is_active:       boolean
  email:           string
  last_sign_in_at: string | null
  invite_pending:  boolean
}

function formatRoleLabel(name: string): string {
  return name.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function avatarColour(role: string | null): 'purple' | 'blue' | 'emerald' | 'amber' | 'gray' {
  switch (role) {
    case ROLES.ADMIN:        return 'purple'
    case ROLES.OPERATIONS:   return 'blue'
    case ROLES.SUPPLY_CHAIN: return 'emerald'
    case ROLES.FINANCE:      return 'amber'
    default:                 return 'gray'
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-NZ', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/**
 * Edit form for a single user. All three sections (profile, resend invite,
 * danger zone) live in one client component so a save+refresh stays smooth.
 *
 * Self-edit guards:
 *   - You can't deactivate yourself.
 *   - You can't demote yourself away from Admin.
 *   - You can't delete yourself.
 * (Same checks repeat on the server in actions.ts.)
 */
export function EditUserForm({
  userId, currentUserId, roles, initial, savedAt, initialError,
}: {
  userId:         string
  currentUserId:  string
  roles:          RoleOpt[]
  initial:        Initial
  savedAt?:       boolean
  initialError?:  string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error,   setError]   = useState<string | null>(initialError ?? null)
  const [info,    setInfo]    = useState<string | null>(savedAt ? 'Saved.' : null)

  const isSelf = userId === currentUserId
  const [tempPw, setTempPw] = useState('')

  function genPassword(): string {
    // Readable random password (no ambiguous chars) with a digit + symbol so
    // it satisfies common strength policies.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const arr = new Uint32Array(12)
    window.crypto.getRandomValues(arr)
    let out = ''
    for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length]
    return `${out}-7x`
  }

  function onSetPassword() {
    const pw = tempPw.trim()
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); setInfo(null); return }
    setError(null); setInfo(null)
    start(async () => {
      const res = await setUserPassword(userId, pw)
      if (!res.ok) { setError(res.error ?? 'Failed to set password'); return }
      setInfo(`Temporary password set for ${initial.full_name}. Share it with them — they sign in at the login page with their email + this password, then can change it.`)
    })
  }

  function onSave(formData: FormData) {
    setError(null); setInfo(null)
    start(async () => {
      const res = await updateUser(formData)
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      setInfo('Saved.')
      router.refresh()
    })
  }

  function onResend() {
    setError(null); setInfo(null)
    start(async () => {
      const res = await resendInvite(userId)
      if (!res.ok) { setError(res.error ?? 'Resend failed'); return }
      setInfo('Invite email re-sent.')
    })
  }

  function onDeactivate() {
    if (!confirm(`Deactivate ${initial.full_name}? They won't be able to sign in. Their audit history is preserved. You can reactivate later.`)) return
    setError(null); setInfo(null)
    start(async () => {
      const fd = new FormData()
      fd.set('id',        userId)
      fd.set('full_name', initial.full_name)
      fd.set('role_id',   initial.role_id)
      // is_active intentionally NOT set ⇒ defaults to "off"
      const res = await updateUser(fd)
      if (!res.ok) { setError(res.error ?? 'Deactivate failed'); return }
      router.refresh()
    })
  }

  function onDelete() {
    if (!confirm(
      `Permanently delete ${initial.full_name}? This cannot be undone.\n\n` +
      `Blocked if this user is referenced by any records (POs, products, ingredients etc). ` +
      `In that case, deactivate them instead.`,
    )) return
    setError(null); setInfo(null)
    start(async () => {
      const res = await hardDeleteUser(userId)
      if (!res.ok) {
        let msg = res.error ?? 'Delete failed'
        if (res.references && res.references.length > 0) {
          msg += '\n\nReferences:\n' + res.references.map((r) => `  • ${r.table}: ${r.count}`).join('\n')
        }
        setError(msg)
        return
      }
      router.push('/settings/users?invited=0')
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 mb-4">
        <UserAvatar name={initial.full_name} colour={avatarColour(initial.role_name)} size="md" />
        <div>
          <div className="font-semibold text-sm">
            {initial.full_name}
            {isSelf && <span className="ml-1 text-[10px] text-gray-400">(you)</span>}
          </div>
          <div className="text-xs text-gray-500">
            {initial.email || <span className="italic">email unknown — service role key required</span>}
            {initial.last_sign_in_at && <> · last sign-in {formatWhen(initial.last_sign_in_at)}</>}
            {initial.invite_pending && initial.is_active && (
              <> · <span className="text-amber-700 font-medium">invite pending</span></>
            )}
          </div>
        </div>
      </div>

      <form action={onSave} className="space-y-4 text-sm">
        <input type="hidden" name="id" value={userId} />

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Full name</label>
          <input
            name="full_name"
            defaultValue={initial.full_name}
            required maxLength={80}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Role</label>
          <select
            name="role_id"
            defaultValue={initial.role_id}
            disabled={isSelf}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white disabled:bg-gray-50"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{formatRoleLabel(r.name)}</option>
            ))}
          </select>
          {isSelf && <p className="text-[10px] text-gray-500 mt-1">You can&rsquo;t change your own role — another admin has to.</p>}
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={initial.is_active}
            disabled={isSelf}
            className="rounded border-gray-300"
          />
          <span>Active</span>
          <span className="text-gray-400">— inactive users can&rsquo;t sign in but their history is preserved</span>
        </label>

        <div className="flex justify-between pt-3 border-t border-gray-100">
          {initial.invite_pending ? (
            <button
              type="button"
              onClick={onResend}
              disabled={pending}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Resend invite email
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <a href="/settings/users" className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</a>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>

      {/* Shared feedback for the profile form + the password / danger actions. */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 whitespace-pre-line">{error}</div>
      )}
      {info && !error && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">{info}</div>
      )}

      {/* Set a temporary password — bypasses the invite email entirely. */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-700 mb-1">Set a temporary password</div>
        <p className="text-[11px] text-gray-500 mb-3">
          Skips the invite email. Sets a password and confirms the account so they can sign in at the login page straight away — then change it once they&rsquo;re in.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={tempPw}
            onChange={(e) => setTempPw(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="off"
            spellCheck={false}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono w-60"
          />
          <button
            type="button"
            onClick={() => setTempPw(genPassword())}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Generate
          </button>
          <button
            type="button"
            onClick={onSetPassword}
            disabled={pending || tempPw.trim().length < 8}
            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? 'Setting…' : 'Set password'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">Copy the password before you leave this page — it isn&rsquo;t stored anywhere to read back.</p>
      </div>

      {/* Danger zone — only for other users */}
      {!isSelf && (
        <div className="mt-6 pt-4 border-t border-red-200">
          <div className="text-xs font-semibold text-red-700 mb-1">Danger zone</div>
          <p className="text-[11px] text-gray-500 mb-3">
            Deactivation preserves audit trail (recommended). Delete is permanent and blocked if this user is referenced by any records.
          </p>
          <div className="flex gap-2">
            {initial.is_active && (
              <button
                type="button"
                onClick={onDeactivate}
                disabled={pending}
                className="px-3 py-1.5 text-xs text-amber-700 border border-amber-300 rounded-md hover:bg-amber-50 disabled:opacity-50"
              >
                Deactivate
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="px-3 py-1.5 text-xs text-red-700 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              Delete permanently
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
