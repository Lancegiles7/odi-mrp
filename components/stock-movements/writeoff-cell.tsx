'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setProductWriteoff } from '@/app/(dashboard)/stock-movements/actions'

/** Editable finished-goods write-off for one product / month / market.
 *  Saves on blur (or Enter) and refreshes so the EOM re-rolls. */
export function WriteoffCell({ product_id, market, month, units }: {
  product_id: string; market: 'NZ' | 'AU'; month: string; units: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [val, setVal] = useState<string>(units ? String(units) : '')

  function save() {
    const u = val.trim() === '' ? null : Number(val)
    if (u != null && !Number.isFinite(u)) return
    if ((u ?? 0) === (units ?? 0)) return   // unchanged
    start(async () => {
      await setProductWriteoff({ product_id, year_month: month, market, units: u })
      router.refresh()
    })
  }

  return (
    <input
      value={val}
      disabled={pending}
      inputMode="decimal"
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="0"
      title="Write-off — units lost/disposed this month"
      className="w-14 text-right text-[11px] tabular-nums bg-white border border-rose-200 rounded px-1 py-0.5 text-rose-700 placeholder:text-gray-300 focus:outline-none focus:border-rose-400"
    />
  )
}
