'use client'

import { useState, useTransition } from 'react'
import { setStockMovementNote } from '@/app/(dashboard)/stock-movements/actions'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

type Scope = 'products' | 'ingredients' | 'packaging'

export function MonthlyNotes({ scope, months, initial }: {
  scope: Scope
  months: string[]                       // 'YYYY-MM-01', in display order
  initial: Record<string, string>        // saved notes by month
}) {
  const [open, setOpen] = useState(true)
  const [notes, setNotes] = useState<Record<string, string>>(initial)
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [savingMonth, setSavingMonth] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const withNotes = months.filter((m) => (initial[m] ?? '').trim()).length

  function save(month: string) {
    const val = (notes[month] ?? '').trim()
    if (val === (initial[month] ?? '').trim()) return   // nothing changed
    setSavingMonth(month)
    start(async () => {
      const res = await setStockMovementNote({ scope, year_month: month, note: val || null })
      setSavingMonth(null)
      if (res.ok) {
        initial[month] = val                            // keep baseline in sync
        setSaved((s) => ({ ...s, [month]: true }))
        setTimeout(() => setSaved((s) => ({ ...s, [month]: false })), 2000)
      }
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold text-gray-800">
          Monthly notes
          {withNotes > 0 && <span className="ml-2 text-xs font-normal text-gray-400">{withNotes} month{withNotes === 1 ? '' : 's'} with notes</span>}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▾ hide' : '▸ show'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((m) => (
            <div key={m} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label(m)}</span>
                {savingMonth === m ? <span className="text-[10px] text-gray-400">saving…</span>
                  : saved[m] ? <span className="text-[10px] text-emerald-600">✓ saved</span> : null}
              </div>
              <textarea
                value={notes[m] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [m]: e.target.value }))}
                onBlur={() => save(m)}
                disabled={pending && savingMonth === m}
                placeholder="Add a note for this month…"
                className="w-full text-xs border border-gray-200 rounded-md p-2 min-h-[56px] resize-y focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-300"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
