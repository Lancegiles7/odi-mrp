'use client'

import { useState, useTransition } from 'react'
import { getReceiptCoaUrl } from '@/app/(dashboard)/purchase-orders/actions'

interface Props {
  filePath: string
  fileName: string
}

// COA files sit in a private bucket, so each download needs a short-lived
// signed URL fetched on click.
export function CoaDownload({ filePath, fileName }: Props) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    start(async () => {
      const res = await getReceiptCoaUrl(filePath, fileName)
      if (!res.ok || !res.url) { setError(res.error ?? 'Could not open'); return }
      window.open(res.url, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1 text-[11px] text-emerald-800 hover:underline disabled:opacity-50"
        title={fileName}
      >
        <span>📄</span>
        <span className="truncate max-w-[160px]">{pending ? 'Opening…' : fileName}</span>
      </button>
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </span>
  )
}
