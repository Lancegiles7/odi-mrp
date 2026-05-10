'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setProductActual, setOpeningSoh } from '@/app/(dashboard)/reporting/budget-vs-actual/actions'
import type { Channel } from '@/lib/budget-vs-actual'

/** Inline-editable cell for a single channel actual. Saves on blur or Enter. */
export function ActualCellInput({
  product_id, year_month, channel, initial, isLocked,
  bgClass = '',
}: {
  product_id: string
  year_month: string
  channel:    Channel
  initial:    number
  isLocked:   boolean
  bgClass?:   string
}) {
  const router = useRouter()
  const [value, setValue] = useState<string>(initial > 0 ? String(initial) : '')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (isLocked) return
    setError(null)
    const trimmed = value.trim()
    const newVal = trimmed === '' ? null : Number(trimmed)
    if (newVal != null && !Number.isFinite(newVal)) { setError('!'); return }
    if ((newVal ?? 0) === (initial ?? 0)) return

    start(async () => {
      const res = await setProductActual({ product_id, year_month, channel, units: newVal })
      if (!res.ok) { setError(res.error ?? '!'); setValue(initial > 0 ? String(initial) : ''); return }
      router.refresh()
    })
  }

  return (
    <input
      type="number" step="any" min={0}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      disabled={isLocked || pending}
      placeholder="—"
      title={error ?? undefined}
      className={`w-full text-right text-xs border-0 bg-transparent px-1.5 py-1 tabular-nums focus:outline focus:outline-2 focus:outline-blue-400 focus:bg-white rounded ${error ? 'outline outline-2 outline-red-400' : ''} ${bgClass}`}
    />
  )
}

/** Inline-editable cell for opening SOH (uses monthly_stock_counts). */
export function OpeningCellInput({
  entity_id, year_month, initial, isLocked,
}: {
  entity_id:  string
  year_month: string
  initial:    number | null
  isLocked:   boolean
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
    if (newVal != null && !Number.isFinite(newVal)) { setError('!'); return }
    if ((newVal ?? null) === (initial ?? null)) return

    start(async () => {
      const res = await setOpeningSoh({
        entity_type: 'product',
        entity_id,
        year_month,
        opening_soh: newVal,
      })
      if (!res.ok) { setError(res.error ?? '!'); setValue(initial != null ? String(initial) : ''); return }
      router.refresh()
    })
  }

  return (
    <input
      type="number" step="any" min={0}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      disabled={isLocked || pending}
      placeholder="—"
      title={error ?? undefined}
      className={`w-full text-right text-xs border-0 bg-transparent px-1.5 py-1 tabular-nums focus:outline focus:outline-2 focus:outline-blue-400 focus:bg-white rounded ${error ? 'outline outline-2 outline-red-400' : ''}`}
    />
  )
}
