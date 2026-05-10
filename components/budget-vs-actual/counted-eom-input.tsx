'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setMonthlyStockCount } from '@/app/(dashboard)/reporting/budget-vs-actual/actions'
import type { EntityType } from '@/lib/budget-vs-actual'

export function CountedEomInput({
  entity_type, entity_id, year_month, initial, isLocked,
}: {
  entity_type: EntityType
  entity_id:   string
  year_month:  string
  initial:     number | null
  isLocked:    boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState<string>(initial != null ? String(initial) : '')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (isLocked) return
    setError(null)
    const trimmed = value.trim()
    const newVal = trimmed === '' ? null : Number(trimmed)
    if (newVal != null && !Number.isFinite(newVal)) { setError('Invalid'); return }
    if ((newVal ?? null) === (initial ?? null)) return  // no change

    start(async () => {
      const res = await setMonthlyStockCount({
        entity_type, entity_id, year_month, counted_eom: newVal,
      })
      if (!res.ok) { setError(res.error ?? 'Save failed'); setValue(initial != null ? String(initial) : ''); return }
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <input
        type="number" step="any" min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        disabled={isLocked || pending}
        placeholder={isLocked ? '—' : 'enter'}
        className={`w-full text-right text-xs border rounded px-1.5 py-1 tabular-nums ${error ? 'border-red-300 bg-red-50' : 'border-gray-200'} ${isLocked ? 'bg-gray-50 text-gray-400' : ''}`}
      />
      {pending && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">…</span>}
      {error && <div className="absolute -bottom-4 right-0 text-[9px] text-red-600">{error}</div>}
    </div>
  )
}
