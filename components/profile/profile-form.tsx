'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMyProfile, changeMyPassword } from '@/app/(dashboard)/profile/actions'
import { ROLES } from '@/lib/constants'

function formatRoleLabel(name: string | null): string {
  if (!name) return '—'
  return name.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function roleChipClasses(role: string | null): string {
  switch (role) {
    case ROLES.ADMIN:        return 'bg-purple-100 text-purple-800'
    case ROLES.OPERATIONS:   return 'bg-blue-100 text-blue-800'
    case ROLES.SUPPLY_CHAIN: return 'bg-emerald-100 text-emerald-800'
    case ROLES.FINANCE:      return 'bg-amber-100 text-amber-800'
    case ROLES.READ_ONLY:    return 'bg-gray-100 text-gray-700'
    default:                 return 'bg-gray-100 text-gray-500'
  }
}

/**
 * Self-service profile editor. Two cards stacked: name+role read-out at top,
 * change-password panel at bottom. Email is read-only — admins handle email
 * changes for now (avoids the auth re-confirmation flow for v1).
 */
export function ProfileForm({ email, fullName, roleName }: { email: string; fullName: string; roleName: string | null }) {
  const router = useRouter()
  const [pendingName, startName] = useTransition()
  const [pendingPwd,  startPwd]  = useTransition()
  const [nameInfo,    setNameInfo]    = useState<string | null>(null)
  const [nameError,   setNameError]   = useState<string | null>(null)
  const [pwdInfo,     setPwdInfo]     = useState<string | null>(null)
  const [pwdError,    setPwdError]    = useState<string | null>(null)
  const [showPwdPanel, setShowPwdPanel] = useState(false)

  function onSaveName(formData: FormData) {
    setNameInfo(null); setNameError(null)
    startName(async () => {
      const res = await updateMyProfile(formData)
      if (!res.ok) { setNameError(res.error ?? 'Save failed'); return }
      setNameInfo('Saved.')
      router.refresh()
    })
  }

  function onChangePwd(formData: FormData) {
    setPwdInfo(null); setPwdError(null)
    startPwd(async () => {
      const res = await changeMyPassword(formData)
      if (!res.ok) { setPwdError(res.error ?? 'Could not change password'); return }
      setPwdInfo('Password changed.')
      // Clear inputs by recreating the form via show/hide toggle.
      setShowPwdPanel(false)
    })
  }

  return (
    <div className="space-y-5">
      {/* Name + read-only email + role */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <form action={onSaveName} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Full name</label>
              <input
                name="full_name"
                defaultValue={fullName}
                required maxLength={80}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Email</label>
              <input value={email} readOnly className="w-full border border-gray-200 bg-gray-50 rounded-md px-2 py-1.5 text-sm text-gray-500" />
              <p className="text-[10px] text-gray-400 mt-0.5">Email is fixed — ask an admin to change it.</p>
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Role</label>
            <span className={`inline-block px-1.5 py-0.5 rounded font-medium text-[11px] ${roleChipClasses(roleName)}`}>
              {formatRoleLabel(roleName)}
            </span>
            <p className="text-[10px] text-gray-400 mt-1">Only an admin can change your role.</p>
          </div>

          {nameError && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{nameError}</div>}
          {nameInfo  && !nameError && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">{nameInfo}</div>}

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button type="submit" disabled={pendingName} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50">
              {pendingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Password</div>
            <p className="text-xs text-gray-500 mt-0.5">Minimum 8 characters.</p>
          </div>
          {!showPwdPanel && (
            <button type="button" onClick={() => { setShowPwdPanel(true); setPwdInfo(null); setPwdError(null) }} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">
              Change password
            </button>
          )}
        </div>

        {pwdInfo && !showPwdPanel && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">{pwdInfo}</div>
        )}

        {showPwdPanel && (
          <form action={onChangePwd} className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">New password</label>
                <input name="new_password" type="password" required minLength={8} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Confirm new password</label>
                <input name="confirm_password" type="password" required minLength={8} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
            </div>

            {pwdError && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{pwdError}</div>}

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button type="button" onClick={() => setShowPwdPanel(false)} disabled={pendingPwd} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={pendingPwd} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50">
                {pendingPwd ? 'Changing…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
