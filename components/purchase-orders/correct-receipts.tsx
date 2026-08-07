'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { correctReceivedQuantities } from '@/app/(dashboard)/purchase-orders/actions'

interface Row {
  line_id: string
  label: string
  sku: string | null
  ordered: number
  received: number
  locked: boolean   // already moved inventory (ingredient/packaging) — can't adjust here
}

export function CorrectReceipts({ poId, rows }: { poId: string; rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [vals, setVals] = useState<Record<string, number>>(
    () => Object.fromEntries(rows.map((r) => [r.line_id, r.received])),
  )
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const editable = rows.filter((r) => !r.locked)
  if (rows.length === 0) return null

  function setVal(id: string, v: string) {
    const n = v === '' ? 0 : Math.max(0, Math.round(Number(v)))
    setVals((prev) => ({ ...prev, [id]: Number.isFinite(n) ? n : 0 }))
  }
  function resetAll() {
    setVals((prev) => {
      const next = { ...prev }
      for (const r of editable) next[r.line_id] = 0
      return next
    })
  }

  function onSave() {
    setError(null); setInfo(null)
    start(async () => {
      const corrections = editable.map((r) => ({ line_id: r.line_id, quantity_received: vals[r.line_id] ?? 0 }))
      const res = await correctReceivedQuantities({ po_id: poId, corrections })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      setInfo(
        'Received quantities updated.' +
        (res.skipped?.length ? ` (Skipped ${res.skipped.length} inventory-affecting line(s).)` : '') +
        ' The Receive screen now reflects these amounts.',
      )
      router.refresh()
    })
  }

  return (
    <details className="bg-white border border-gray-200 rounded-lg">
      <summary className="list-none cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-gray-50">
        <span className="text-sm font-semibold text-gray-900">Correct received quantities</span>
        <span className="text-xs text-gray-500">Fix a mis-keyed receipt ▾</span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-3">
          Adjust the <span className="font-medium">received</span> amount on any product line, then Save. Setting a line back to 0
          reopens it for receiving. Ingredient / packaging lines that have already moved warehouse stock are locked here — those
          need a stock adjustment to reverse.
        </p>

        {info  && <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">{info}</div>}
        {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

        <table className="w-full text-xs border border-gray-200 rounded-md overflow-hidden">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2 w-[90px]">Ordered</th>
              <th className="text-right px-3 py-2 w-[120px]">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line_id} className={`border-t border-gray-100 ${r.locked ? 'bg-gray-50/60' : ''}`}>
                <td className="px-3 py-1.5">
                  <div className="font-medium">{r.label}</div>
                  {r.sku && <div className="text-[10px] text-gray-500 font-mono">{r.sku}</div>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.ordered.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.locked ? (
                    <span className="inline-flex items-center gap-1 text-gray-500 tabular-nums" title="Already moved warehouse stock — reverse via a stock adjustment">
                      🔒 {r.received.toLocaleString()}
                    </span>
                  ) : (
                    <input
                      type="number" min={0}
                      value={vals[r.line_id] ?? 0}
                      onChange={(e) => setVal(r.line_id, e.target.value)}
                      className="w-24 text-right text-xs border border-gray-300 rounded px-1.5 py-1 tabular-nums"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between pt-3">
          <button onClick={resetAll} disabled={pending || editable.length === 0} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
            Reset all to 0
          </button>
          <button
            onClick={onSave}
            disabled={pending || editable.length === 0}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save corrections'}
          </button>
        </div>
      </div>
    </details>
  )
}
