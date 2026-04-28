'use client'

import { useState, useTransition } from 'react'
import {
  completeCurrentPlanningMonth,
  reopenPreviousPlanningMonth,
} from '@/app/(dashboard)/settings/actions'
import { monthLabel } from '@/lib/demand'

interface Props {
  firstMonth: string         // ISO date like '2026-04-01'
  hasAnchorOverride: boolean // true when planning_start_month is set (i.e. user has completed at least one month)
}

export function CompleteMonthButton({ firstMonth, hasAnchorOverride }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onComplete() {
    const label = monthLabel(firstMonth)
    if (!confirm(
      `Mark ${label} as complete?\n\nThis hides ${label} from the Demand, Production, and Ingredient demand views and shifts the rolling window forward by one month. You can reopen it later if needed.`,
    )) return
    setError(null)
    startTransition(async () => {
      const res = await completeCurrentPlanningMonth()
      if (!res.ok) setError(res.error ?? 'Could not complete month')
    })
  }

  function onReopen() {
    if (!confirm('Reopen the previous month? This brings it back into all planning views.')) return
    setError(null)
    startTransition(async () => {
      const res = await reopenPreviousPlanningMonth()
      if (!res.ok) setError(res.error ?? 'Could not reopen month')
    })
  }

  return (
    <div className="flex items-center gap-2">
      {hasAnchorOverride && (
        <button
          type="button"
          onClick={onReopen}
          disabled={pending}
          className="px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          title="Bring the previous month back into the planning window"
        >
          ← Reopen previous
        </button>
      )}
      <button
        type="button"
        onClick={onComplete}
        disabled={pending}
        className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-50"
        title={`Mark ${monthLabel(firstMonth)} as complete and shift the rolling window forward`}
      >
        {pending ? 'Saving…' : `✓ Complete ${monthLabel(firstMonth)}`}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
