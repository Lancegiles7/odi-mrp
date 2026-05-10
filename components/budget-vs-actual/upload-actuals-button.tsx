'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadProductActuals, type UploadRow } from '@/app/(dashboard)/reporting/budget-vs-actual/actions'

const blankRow = (): UploadRow => ({ sku: '', opening: null, nz_retail: null, nz_d2c: null, nz_samples: null })

export function UploadActualsButton({
  year_month, isFyStart,
}: {
  year_month: string; isFyStart: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<UploadRow[]>(Array.from({ length: 8 }, blankRow))
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [unmatched, setUnmatched] = useState<string[] | null>(null)
  const [matchedCount, setMatchedCount] = useState<number | null>(null)

  function update(idx: number, patch: Partial<UploadRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function totalOf(r: UploadRow): number | null {
    const a = r.nz_retail, b = r.nz_d2c, c = r.nz_samples
    if (a == null && b == null && c == null) return null
    return (a ?? 0) + (b ?? 0) + (c ?? 0)
  }

  // Paste handler — supports both Excel/Sheets multi-cell paste and single-cell
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, startRow: number, startCol: 'sku' | 'opening' | 'nz_retail' | 'nz_d2c' | 'nz_samples') {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return  // single cell, normal paste
    e.preventDefault()
    const parsedRows = text.trimEnd().split(/\r?\n/).map((line) => line.split('\t'))
    const cols: Array<'sku' | 'opening' | 'nz_retail' | 'nz_d2c' | 'nz_samples'> = ['sku', 'opening', 'nz_retail', 'nz_d2c', 'nz_samples']
    const startIdx = cols.indexOf(startCol)

    setRows((prev) => {
      const next = [...prev]
      // Grow rows if needed
      while (next.length < startRow + parsedRows.length) next.push(blankRow())
      parsedRows.forEach((cells, ri) => {
        const targetRow = startRow + ri
        cells.forEach((cellRaw, ci) => {
          const colIdx = startIdx + ci
          if (colIdx >= cols.length) return
          const col = cols[colIdx]
          const cell = cellRaw.trim()
          if (col === 'sku') {
            next[targetRow] = { ...next[targetRow], sku: cell }
          } else {
            const num = cell === '' || cell === '—' ? null : Number(cell.replace(/,/g, ''))
            next[targetRow] = { ...next[targetRow], [col]: Number.isFinite(num as number) ? num : null }
          }
        })
      })
      return next
    })
  }

  function addRows(n: number) {
    setRows((prev) => [...prev, ...Array.from({ length: n }, blankRow)])
  }

  function reset() {
    setRows(Array.from({ length: 8 }, blankRow))
    setError(null)
    setUnmatched(null)
    setMatchedCount(null)
  }

  function onSave() {
    setError(null)
    setUnmatched(null)
    setMatchedCount(null)
    const valid = rows.filter((r) => r.sku.trim().length > 0)
    if (valid.length === 0) { setError('Add at least one row with a SKU'); return }
    start(async () => {
      const res = await uploadProductActuals({ year_month, rows: valid })
      if (!res.ok) { setError(res.error ?? 'Upload failed'); return }
      setMatchedCount(res.matched ?? 0)
      setUnmatched(res.unmatched_skus ?? [])
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded font-medium hover:bg-gray-50"
      >
        Upload actuals
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-sm font-semibold">Upload monthly actuals — {year_month.slice(0, 7)}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste columns A · {isFyStart ? 'C · ' : ''}F · G · H from your <em>SOH_Balance_dd_M_YY.xlsx</em>. Total = Retail + D2C + Samples (auto). {!isFyStart && 'Opening column ignored after FY-start month — system auto-rolls from previous EOM.'}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-5">
              {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
              {matchedCount != null && (
                <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900">
                  ✓ Saved <strong>{matchedCount}</strong> row{matchedCount === 1 ? '' : 's'}.
                  {unmatched && unmatched.length > 0 && (
                    <span className="ml-2 text-amber-800">
                      <strong>{unmatched.length}</strong> SKU{unmatched.length === 1 ? '' : 's'} skipped (not found in products): <span className="font-mono">{unmatched.slice(0, 5).join(', ')}{unmatched.length > 5 ? `, +${unmatched.length - 5} more` : ''}</span>
                    </span>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-gray-200 rounded">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                      <th className="text-left px-2 py-2">SKU<span className="block text-[9px] normal-case font-normal text-gray-400">col A</span></th>
                      <th className="text-right px-2 py-2 w-[110px]" title={isFyStart ? 'Opening SOH (used)' : 'Opening (ignored — auto-roll)'}>Opening<span className={`block text-[9px] normal-case font-normal ${isFyStart ? 'text-gray-400' : 'text-amber-600'}`}>col C{!isFyStart && ' · ignored'}</span></th>
                      <th className="text-right px-2 py-2 w-[110px] bg-emerald-50/50">Retail<span className="block text-[9px] normal-case font-normal text-gray-400">col F</span></th>
                      <th className="text-right px-2 py-2 w-[110px] bg-emerald-50/50">D2C<span className="block text-[9px] normal-case font-normal text-gray-400">col G</span></th>
                      <th className="text-right px-2 py-2 w-[110px] bg-purple-50/60">Samples<span className="block text-[9px] normal-case font-normal text-gray-400">col H</span></th>
                      <th className="text-right px-2 py-2 w-[100px] bg-gray-50">Total<span className="block text-[9px] normal-case font-normal text-gray-400">auto</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1">
                          <input value={r.sku} onChange={(e) => update(i, { sku: e.target.value })} onPaste={(e) => onPaste(e, i, 'sku')}
                            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 font-mono"
                            placeholder="FG-ODI-..." />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" min={0} value={r.opening ?? ''}
                            onChange={(e) => update(i, { opening: e.target.value === '' ? null : Number(e.target.value) })}
                            onPaste={(e) => onPaste(e, i, 'opening')}
                            disabled={!isFyStart}
                            className={`w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums ${!isFyStart ? 'bg-gray-50 text-gray-400' : ''}`} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" min={0} value={r.nz_retail ?? ''}
                            onChange={(e) => update(i, { nz_retail: e.target.value === '' ? null : Number(e.target.value) })}
                            onPaste={(e) => onPaste(e, i, 'nz_retail')}
                            className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" min={0} value={r.nz_d2c ?? ''}
                            onChange={(e) => update(i, { nz_d2c: e.target.value === '' ? null : Number(e.target.value) })}
                            onPaste={(e) => onPaste(e, i, 'nz_d2c')}
                            className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" min={0} value={r.nz_samples ?? ''}
                            onChange={(e) => update(i, { nz_samples: e.target.value === '' ? null : Number(e.target.value) })}
                            onPaste={(e) => onPaste(e, i, 'nz_samples')}
                            className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-600">
                          {totalOf(r) != null ? totalOf(r)!.toLocaleString() : <span className="text-gray-300 italic">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => addRows(5)}  className="text-xs text-blue-600 hover:underline">+ 5 rows</button>
                  <button type="button" onClick={() => addRows(20)} className="text-xs text-blue-600 hover:underline">+ 20 rows</button>
                  <button type="button" onClick={reset} className="text-xs text-gray-500 hover:underline">Reset</button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Tip: paste any rectangle from Excel — top-left cell is where you click first.
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 border border-gray-300 rounded">Close</button>
              <button type="button" onClick={onSave} disabled={pending}
                className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded font-medium disabled:opacity-50">
                {pending ? 'Saving…' : 'Save actuals'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
