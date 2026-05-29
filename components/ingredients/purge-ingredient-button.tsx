'use client'

import { useState } from 'react'
import { permanentlyDeleteIngredient } from '@/app/(dashboard)/ingredients/actions'

/**
 * "Delete forever" button for the ingredient trash. Expands to an
 * inline confirmation before submitting. Mirrors PurgeProductButton.
 */
export function PurgeIngredientButton({ ingredientId, ingredientName }: { ingredientId: string; ingredientName: string }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
      >
        Delete forever
      </button>
    )
  }

  return (
    <form action={permanentlyDeleteIngredient.bind(null, ingredientId)} className="inline-flex items-center gap-2">
      <span className="text-[11px] text-gray-700">Really delete {ingredientName}?</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="px-2 py-0.5 text-[11px] font-medium text-gray-700 bg-white border border-gray-300 rounded"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="px-2 py-0.5 text-[11px] font-medium text-white bg-red-600 rounded hover:bg-red-700"
      >
        Yes
      </button>
    </form>
  )
}
