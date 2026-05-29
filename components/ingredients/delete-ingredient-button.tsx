'use client'

import { useState } from 'react'
import { softDeleteIngredient } from '@/app/(dashboard)/ingredients/actions'

interface InUseProduct {
  id: string
  name: string
}

interface Props {
  ingredientId:   string
  ingredientName: string
  inUseProducts:  InUseProduct[]   // active products whose active BOM references this ingredient
}

/**
 * Delete button for the ingredient detail page. Opens a confirmation
 * panel that lists every active recipe still using this ingredient
 * (per the design we picked: warn, but allow). Soft-deletes via the
 * server action — the row is retained so existing costings keep
 * working, and it can be restored from /ingredients/trash for 30 days.
 *
 * Rendered admin-only by the detail page.
 */
export function DeleteIngredientButton({ ingredientId, ingredientName, inUseProducts }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
      >
        Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold">Delete &ldquo;{ingredientName}&rdquo;?</h3>
            </div>

            <div className="px-5 py-4 text-sm text-gray-700 space-y-3">
              <p>
                This ingredient will be hidden from the ingredients list and the BOM picker.
                Existing recipes that already use it keep costing correctly &mdash; the record is retained.
              </p>

              {inUseProducts.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-800">
                  <div className="text-xs font-semibold">
                    In use right now: {inUseProducts.length} active recipe{inUseProducts.length === 1 ? '' : 's'} reference{inUseProducts.length === 1 ? 's' : ''} this ingredient.
                  </div>
                  <ul className="mt-1.5 text-xs list-disc pl-4 space-y-0.5 max-h-40 overflow-auto">
                    {inUseProducts.map((p) => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-600">
                  This ingredient is not currently used in any active recipe.
                </div>
              )}

              <p className="text-xs text-gray-500">
                You can restore from <span className="font-medium">Ingredients &rarr; Trash</span> within 30 days.
                After that it&rsquo;s permanently purged.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <form action={softDeleteIngredient.bind(null, ingredientId)}>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  Delete (recoverable 30 days)
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
