'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addComment } from '@/app/(dashboard)/enhancements/actions'

/**
 * Post-a-comment textarea for an enhancement. Stays on the page, refreshes
 * the server-rendered comment list on success.
 */
export function CommentForm({ enhancementId }: { enhancementId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement | null>(null)
  const [pending, start] = useTransition()
  const [error,   setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    start(async () => {
      const res = await addComment(formData)
      if (!res.ok) { setError(res.error ?? 'Failed to post comment'); return }
      formRef.current?.reset()
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-2">
      <input type="hidden" name="enhancement_id" value={enhancementId} />
      <textarea
        name="body"
        rows={2}
        required
        maxLength={4000}
        placeholder="Add a comment…"
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
      />
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </form>
  )
}
