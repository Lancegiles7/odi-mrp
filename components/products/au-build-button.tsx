'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addAuBuild, removeAuBuild } from '@/app/(dashboard)/products/actions'

/**
 * Adds or removes a product's AU (VMC) build. Adding seeds the AU recipe and
 * packaging as a copy of the NZ build; removing drops it entirely.
 */
export function AuBuildButton({ productId, exists }: { productId: string; exists: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function add() {
    start(async () => {
      await addAuBuild(productId)
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Remove the AU build? Its recipe and packaging will be deleted. The NZ build is untouched.')) return
    start(async () => {
      await removeAuBuild(productId)
      router.refresh()
    })
  }

  if (!exists) {
    return (
      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="text-sm px-3 py-1.5 border border-gray-900 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? 'Adding…' : '+ Add AU build (copies NZ)'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="text-xs px-2.5 py-1 border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? 'Removing…' : 'Remove AU build'}
    </button>
  )
}
