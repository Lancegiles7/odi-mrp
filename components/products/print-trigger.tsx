'use client'

export function PrintTrigger() {
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800"
    >
      ⤓ Save as PDF / print
    </button>
  )
}
