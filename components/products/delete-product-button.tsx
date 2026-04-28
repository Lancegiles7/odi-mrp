'use client'

import { useState } from 'react'
import { softDeleteProduct } from '@/app/(dashboard)/products/actions'

interface Props {
  productId: string
  productName: string
}

/**
 * Delete button with inline confirmation. Renders as a single "Delete"
 * button; on click it swaps in a confirmation row ("Really delete? …")
 * before allowing the server action to fire. Only rendered by the
 * product detail page for admin users.
 */
export function DeleteProductButton({ productId, productName }: Props) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
      >
        Delete
      </button>
    )
  }

  return (
    <form action={softDeleteProduct.bind(null, productId)} className="flex items-center gap-2">
      <span className="text-xs text-gray-700">
        Delete <span className="font-medium">{productName}</span>? Kept for 30 days.
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
      >
        Yes, delete
      </button>
    </form>
  )
}
