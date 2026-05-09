'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSupplier } from '@/app/(dashboard)/suppliers/actions'

export function DeleteSupplierButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    if (!confirm(`Permanently delete supplier "${name}"?\n\nThis only works if no purchase orders, ingredients, or packaging items reference it.`)) return
    start(async () => {
      const res = await deleteSupplier(id)
      if (!res.ok) { setError(res.error ?? 'Delete failed'); return }
      router.push('/suppliers')
      router.refresh()
    })
  }

  return (
    <div>
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete supplier'}
      </button>
    </div>
  )
}
