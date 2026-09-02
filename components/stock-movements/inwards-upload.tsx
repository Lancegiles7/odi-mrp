'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importInwardsReceipts } from '@/app/(dashboard)/stock-movements/actions'

export function InwardsUpload() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ imported?: number; unmatched?: string[] } | null>(null)

  function submit(formData: FormData) {
    setError(null); setDone(null)
    start(async () => {
      const res = await importInwardsReceipts(formData)
      if (!res.ok) { setError(res.error ?? 'Import failed'); return }
      setDone(res)
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800">
        ⤓ Upload inwards
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg border border-gray-200 w-full max-w-lg mt-10" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold">Upload Inwards Finished Goods</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <form ref={formRef} action={submit} className="px-5 py-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700">Inwards Finished Goods · sheet</label>
                <p className="text-[11px] text-gray-400 mb-1.5">.xlsx · reads SKU, Received date and Retail Units Received. Each arrival lands in its received month. Re-uploading replaces the file&rsquo;s rows, and any delivery already receipted against a PO is skipped.</p>
                <input type="file" name="inwards" accept=".xlsx,.xls,.csv" required
                  className="block w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
              </div>

              {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

              {done && (
                <div className="text-xs bg-emerald-50 border border-emerald-200 rounded px-3 py-2 space-y-1">
                  <div className="font-medium text-emerald-800">Saved ✓</div>
                  <div className="text-gray-700">{done.imported ?? 0} receipts imported.</div>
                  {!!done.skippedPo && (
                    <div className="text-gray-700">
                      {done.skippedPo} row{done.skippedPo === 1 ? '' : 's'} skipped &mdash; already receipted against a PO in the MRP, so counting the sheet row too would double the stock.
                    </div>
                  )}
                  {!!done.unmatched?.length && (
                    <div className="text-amber-700">⚠ Unmatched SKUs (skipped): {done.unmatched.join(', ')}</div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
                  {pending ? 'Importing…' : 'Import inwards'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
