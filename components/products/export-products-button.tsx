'use client'

import { useTransition } from 'react'
import { exportProductsCsv } from '@/app/(dashboard)/products/actions'

export function ExportProductsButton() {
  const [pending, start] = useTransition()
  function onClick() {
    start(async () => {
      const res = await exportProductsCsv()
      if (!res.ok || !res.csv) { alert(res.error ?? 'Export failed'); return }
      const blob = new Blob([res.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'odi-products.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? 'Exporting…' : '⤓ Export CSV'}
    </button>
  )
}
