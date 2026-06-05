'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ENHANCEMENT_STATUSES } from '@/lib/constants'
import { updateEnhancementStatus } from '@/app/(dashboard)/enhancements/actions'
import type { EnhancementStatus } from '@/lib/types/database.types'

/**
 * Admin-only panel on the detail page for changing status, posting a note
 * to the submitter, and (when status = built) capturing a link to where
 * in the app the feature lives.
 */
export function AdminStatusPanel({
  enhancementId,
  initialStatus,
  initialNote,
  initialBuiltUrl,
}: {
  enhancementId:   string
  initialStatus:   EnhancementStatus
  initialNote:     string | null
  initialBuiltUrl: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<EnhancementStatus>(initialStatus)
  const [info,   setInfo]   = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  function onSave(formData: FormData) {
    setInfo(null); setError(null)
    start(async () => {
      const res = await updateEnhancementStatus(formData)
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      setInfo('Saved.')
      router.refresh()
    })
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
      <div className="text-xs uppercase tracking-wider font-semibold text-amber-900 mb-2">
        Admin · change status
      </div>
      <form action={onSave} className="space-y-2">
        <input type="hidden" name="id" value={enhancementId} />

        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as EnhancementStatus)}
          className="w-full text-sm border border-amber-300 rounded-md px-2 py-1.5 bg-white"
        >
          {ENHANCEMENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <textarea
          name="status_note"
          rows={2}
          defaultValue={initialNote ?? ''}
          maxLength={1000}
          placeholder="Optional note for the submitter (e.g. why declined, when expected)..."
          className="w-full text-sm border border-amber-300 rounded-md px-2 py-1.5 bg-white"
        />

        {status === 'built' && (
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-amber-900 mb-1 font-semibold">Built — link to where it lives</label>
            <input
              type="text"
              name="built_url"
              defaultValue={initialBuiltUrl ?? ''}
              placeholder="/ingredients · /demand?country=nz · /enhancements"
              className="w-full text-xs border border-amber-300 rounded-md px-2 py-1.5 bg-white font-mono"
            />
            <p className="text-[10px] text-amber-700 mt-0.5">Shown to the submitter as "→ Try it on …"</p>
          </div>
        )}

        {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
        {info  && !error && <div className="p-2 bg-white border border-emerald-200 rounded text-xs text-emerald-800">{info}</div>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-3 py-1.5 text-xs bg-amber-700 text-white rounded-md hover:bg-amber-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save status change'}
        </button>
      </form>
    </div>
  )
}
