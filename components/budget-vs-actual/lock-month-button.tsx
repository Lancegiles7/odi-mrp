'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { lockMonth, unlockMonth } from '@/app/(dashboard)/reporting/budget-vs-actual/actions'

export function LockMonthButton({
  year_month, isLocked, isAdmin,
}: {
  year_month: string; isLocked: boolean; isAdmin: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function lock() {
    setError(null)
    if (!confirm(`Lock ${year_month.slice(0, 7)}? After locking, no further edits to actuals or stock counts. Admin can unlock if needed.`)) return
    start(async () => {
      const res = await lockMonth(year_month)
      if (!res.ok) { setError(res.error ?? 'Lock failed'); return }
      router.refresh()
    })
  }

  function unlock() {
    setError(null)
    if (!confirm(`Unlock ${year_month.slice(0, 7)}? This will allow editing again.`)) return
    start(async () => {
      const res = await unlockMonth(year_month)
      if (!res.ok) { setError(res.error ?? 'Unlock failed'); return }
      router.refresh()
    })
  }

  if (isLocked) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-[11px] text-red-600">{error}</span>}
        <button
          type="button"
          disabled={!isAdmin || pending}
          onClick={unlock}
          title={isAdmin ? 'Unlock this month (admin)' : 'Locked — only admin can unlock'}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium disabled:opacity-50"
        >
          {pending ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={lock}
        className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded font-medium disabled:opacity-50"
      >
        {pending ? 'Locking…' : `Lock ${year_month.slice(0, 7)}`}
      </button>
    </div>
  )
}
