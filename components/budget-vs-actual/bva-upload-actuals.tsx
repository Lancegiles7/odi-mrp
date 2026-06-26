'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importBvaActuals } from '@/app/(dashboard)/reporting/budget-vs-actual/actions'

interface MonthOpt { key: string; label: string; closed: boolean }

export function BvaUploadActuals({ months, defaultMonth }: { months: MonthOpt[]; defaultMonth: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [month, setMonth] = useState(defaultMonth)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Awaited<ReturnType<typeof importBvaActuals>> | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const openMonths = months.filter((m) => !m.closed)

  function submit(formData: FormData) {
    setError(null); setDone(null)
    formData.set('year_month', month)
    start(async () => {
      const res = await importBvaActuals(formData)
      if (!res.ok) { setError(res.error ?? 'Import failed'); return }
      setDone(res)
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800">
        ⤓ Upload month actuals
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg border border-gray-200 w-full max-w-xl mt-10" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold">Upload month actuals</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <form ref={formRef} action={submit} className="px-5 py-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Month</label>
                <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                  {openMonths.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Closed months aren&rsquo;t listed — unlock one first to re-import.</p>
              </div>

              <FileField name="shopify" label="D2C · Shopify orders export" hint=".csv" />
              <FileField name="upstock" label="Retail · Upstock orders export" hint=".csv · pouches counted ×6" />
              <FileField name="samples" label="Samples · tracker" hint=".xlsx · reads the month sheet's MONTHLY TOTAL" />

              {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

              {done && (
                <div className="text-xs bg-emerald-50 border border-emerald-200 rounded px-3 py-2 space-y-1.5">
                  <div className="font-medium text-emerald-800">Saved ✓</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-700 tabular-nums">
                    <span>D2C revenue: ${Math.round(done.wrote?.rev_d2c ?? 0).toLocaleString()}</span>
                    <span>Retail revenue: ${Math.round(done.wrote?.rev_retail ?? 0).toLocaleString()}</span>
                    <span>D2C orders: {done.wrote?.ord_d2c ?? 0}</span>
                    <span>Retail orders: {done.wrote?.ord_retail ?? 0} (WW {done.wrote?.ord_retail_ww ?? 0})</span>
                  </div>
                  <div className="text-gray-700 pt-1 border-t border-emerald-100">
                    {done.productsMatched ?? 0} products matched (Products / Ingredients / Packaging tabs updated)
                  </div>
                  {!!done.unmatchedSkus?.length && (
                    <div className="text-amber-700">⚠ Unmatched SKUs (ignored): {done.unmatchedSkus.join(', ')}</div>
                  )}
                  {!!done.unmatchedRetail?.length && (
                    <div className="text-amber-700">⚠ Unmatched retail codes: {done.unmatchedRetail.join(', ')}</div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
                  {pending ? 'Importing…' : 'Import actuals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function FileField({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="text-[11px] text-gray-400 mb-1">{hint}</div>
      <input type="file" name={name} accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
    </div>
  )
}
