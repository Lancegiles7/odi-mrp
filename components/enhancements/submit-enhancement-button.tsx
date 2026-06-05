'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ENHANCEMENT_CATEGORIES, ENHANCEMENT_PRIORITIES } from '@/lib/constants'
import { createEnhancement } from '@/app/(dashboard)/enhancements/actions'

/**
 * Top-right "+ Submit enhancement" button + modal. Visible to every
 * signed-in user. On success the page is refreshed so the new row
 * appears at the top of the list.
 */
export function SubmitEnhancementButton() {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [pending, start]      = useTransition()
  const [error,   setError]   = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    start(async () => {
      const res = await createEnhancement(formData)
      if (!res.ok) { setError(res.error ?? 'Submit failed'); return }
      setOpen(false)
      router.push(res.id ? `/enhancements/${res.id}` : '/enhancements')
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true) }}
        className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
      >
        + Submit enhancement
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold">Submit an enhancement</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Lance reviews these and decides what to build. Be specific — examples help.</p>
            </div>

            <form action={onSubmit} className="px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Title <span className="text-red-500">*</span></label>
                <input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="Short one-liner — what would you like to see?"
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Description <span className="text-red-500">*</span></label>
                <textarea
                  name="description"
                  required
                  rows={5}
                  maxLength={4000}
                  placeholder="What's the problem this would solve? When would you use it? Any examples?"
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Category <span className="text-red-500">*</span></label>
                  <select name="category" required defaultValue="" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white">
                    <option value="" disabled>— Pick one —</option>
                    {ENHANCEMENT_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Priority</label>
                  <select name="priority" defaultValue="medium" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white">
                    {ENHANCEMENT_PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label} — {p.hint}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50">
                  {pending ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
