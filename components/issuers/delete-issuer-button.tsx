'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteIssuer } from '@/app/(dashboard)/settings/issuers/actions'

export function DeleteIssuerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    if (!confirm(`Permanently delete issuer "${name}"?\n\nBlocked if any purchase orders reference this issuer.`)) return
    start(async () => {
      const res = await deleteIssuer(id)
      if (!res.ok) { setError(res.error ?? 'Delete failed'); return }
      router.push('/settings/issuers')
      router.refresh()
    })
  }

  return (
    <div>
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete issuer'}
      </button>
    </div>
  )
}
