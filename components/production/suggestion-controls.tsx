'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptSuggestions, clearSuggestions } from '@/app/(dashboard)/production/actions'

export interface SuggestionPair { product_id: string; market: 'NZ' | 'AU' }

interface Props {
  /** Cells currently showing as model drafts in this manufacturer section. */
  pairs: SuggestionPair[]
  count: number
  fromMonth: string
}

/**
 * Shows how many model suggestions are sitting un-confirmed in a manufacturer
 * section, with one click to confirm them all (they stop showing as drafts) or
 * clear them (drop the model's draft numbers, leaving manual numbers alone).
 */
export function SuggestionControls({ pairs, count, fromMonth }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (count <= 0) return null

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setConfirmClear(false)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
      <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 border-dashed font-medium">
        ✨ {count.toLocaleString()} suggested
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => { e.preventDefault(); run(() => acceptSuggestions({ pairs, fromMonth })) }}
        className="text-emerald-700 hover:text-emerald-900 hover:underline disabled:opacity-50"
      >
        Accept all
      </button>
      {confirmClear ? (
        <>
          <span className="text-gray-500">Clear drafts?</span>
          <button
            type="button"
            disabled={pending}
            onClick={(e) => { e.preventDefault(); run(() => clearSuggestions({ pairs, fromMonth })) }}
            className="text-rose-600 hover:text-rose-800 hover:underline disabled:opacity-50"
          >
            Yes, clear
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setConfirmClear(false) }}
            className="text-gray-400 hover:text-gray-600"
          >
            no
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={(e) => { e.preventDefault(); setConfirmClear(true) }}
          className="text-gray-400 hover:text-gray-600 hover:underline disabled:opacity-50"
        >
          Clear
        </button>
      )}
      {pending && <span className="text-gray-400">…</span>}
      {error && <span className="text-rose-600">{error}</span>}
    </span>
  )
}
