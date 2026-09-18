'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { copyRecipe } from '@/app/(dashboard)/products/actions'

/**
 * Makes this build's recipe match the other build's. Copies the other recipe's
 * saved lines over this one — so the two stay in step without retyping.
 */
export function CopyRecipeButton({ productId, from }: { productId: string; from: 'NZ' | 'AU' }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const to = from === 'NZ' ? 'AU' : 'NZ'

  function run() {
    const ok = confirm(
      `Replace the ${to} recipe with a copy of the ${from} recipe?\n\n` +
      `Every ingredient line in the ${to} recipe is overwritten. Packaging is not changed.\n\n` +
      `This copies the ${from} recipe as last SAVED — click Save BOM on it first if you've just edited it.`,
    )
    if (!ok) return
    start(async () => {
      const res = await copyRecipe(productId, from)
      if (!res.ok) alert(res.error ?? 'Copy failed')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="text-sm px-2.5 py-1 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? 'Copying…' : `Copy from ${from} recipe`}
    </button>
  )
}
