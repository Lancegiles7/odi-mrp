'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setStockLock } from '@/app/(dashboard)/settings/actions'

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Months to choose from: Apr 2026 (launch) through the current month, newest first. */
function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const now = new Date()
  let y = now.getUTCFullYear(), m = now.getUTCMonth() // 0-based
  while (y > 2026 || (y === 2026 && m >= 3)) {
    out.push({ value: `${y}-${String(m + 1).padStart(2, '0')}-01`, label: `${MON[m]} ${y}` })
    m--; if (m < 0) { m = 11; y-- }
  }
  return out
}

export function StockLockControl({
  lockedThrough, lockedLabel, lockedByName, isAdmin,
}: {
  lockedThrough: string | null
  lockedLabel: string | null
  lockedByName: string | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const opts = monthOptions()
  const [choice, setChoice] = useState<string>(lockedThrough ?? '2026-09-01')

  const run = (month: string | null) => {
    setError(null)
    startTransition(async () => {
      const res = await setStockLock(month)
      if (!res.ok) { setError(res.error ?? 'Something went wrong'); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {lockedThrough ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200"
            title={lockedByName ? `Locked by ${lockedByName}` : undefined}>
            🔒 Locked through {lockedLabel}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
            Unlocked
          </span>
        )}
        {isAdmin && (
          <button onClick={() => { setOpen((o) => !o); setError(null) }}
            className="text-xs font-medium px-3 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
            Manage lock
          </button>
        )}
      </div>

      {open && isAdmin && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 text-left">
            <div className="font-semibold text-emerald-900 mb-1">🔒 Stock lock</div>
            <p className="text-xs text-gray-500 mb-3">Everything on or before the chosen month is frozen — imports and edits skip it. Later months behave normally.</p>
            <label className="text-xs font-medium text-gray-600">Lock all months through</label>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
            <div className="flex items-center gap-2 mt-4">
              <button disabled={pending} onClick={() => run(choice)}
                className="text-sm font-semibold px-3 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
                {pending ? 'Saving…' : `Lock through ${opts.find((o) => o.value === choice)?.label ?? ''}`}
              </button>
              {lockedThrough && (
                <button disabled={pending} onClick={() => run(null)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-md border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50">
                  Unlock
                </button>
              )}
            </div>
            {lockedThrough && (
              <div className="mt-3 text-[11px] text-gray-400">
                Currently locked through <b className="text-violet-700">{lockedLabel}</b>{lockedByName ? ` · set by ${lockedByName}` : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
