'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { receivePoLines } from '@/app/(dashboard)/purchase-orders/actions'

interface LineRow {
  id: string
  label: string
  sku: string | null
  quantity_ordered: number
  quantity_received: number
  unit_cost: number | null
  unit_of_measure: string
  notes: string
}

interface Props {
  poId: string
  poNumber: string
  supplierName: string
  expectedDate: string | null
  lines: LineRow[]
}

interface RowState {
  receiving_now: number
  unit_cost: number | null
  note: string
}

export function ReceiveForm({ poId, poNumber, supplierName, expectedDate, lines }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [state, setState] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {}
    for (const l of lines) {
      const remaining = Math.max(0, l.quantity_ordered - l.quantity_received)
      out[l.id] = {
        receiving_now: remaining,
        unit_cost:     l.unit_cost,
        note:          '',
      }
    }
    return out
  })

  function updateRow(id: string, patch: Partial<RowState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const willBePartial = useMemo(() => {
    return lines.some((l) => {
      const newReceived = Math.min(l.quantity_ordered, l.quantity_received + (state[l.id]?.receiving_now ?? 0))
      return newReceived < l.quantity_ordered
    })
  }, [lines, state])

  function onSave() {
    setError(null)
    const receipts = lines
      .filter((l) => (state[l.id]?.receiving_now ?? 0) > 0)
      .map((l) => ({
        line_id:       l.id,
        receiving_now: state[l.id].receiving_now,
        unit_cost:     state[l.id].unit_cost,
        note:          state[l.id].note,
      }))

    if (receipts.length === 0) {
      setError('Nothing to receive — set a quantity on at least one line.')
      return
    }

    start(async () => {
      const res = await receivePoLines({ po_id: poId, receipts })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      router.push(`/purchase-orders/${poId}`)
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/purchase-orders/${poId}`} className="text-xs text-gray-500 hover:underline">← Back to PO</Link>
          <div>
            <h1 className="text-base font-semibold">Receive — {poNumber}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {supplierName}{expectedDate ? ` · expected ${expectedDate}` : ''}
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Tip: leave at 0 to skip a line · price can be amended at receipt
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{error}</div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-4 py-2 font-medium">Item</th>
            <th className="text-right px-3 py-2 font-medium">Ordered</th>
            <th className="text-right px-3 py-2 font-medium">Already received</th>
            <th className="text-right px-3 py-2 font-medium">Receiving now</th>
            <th className="text-right px-3 py-2 font-medium">Unit price</th>
            <th className="text-right px-3 py-2 font-medium">Remaining after</th>
            <th className="text-left px-3 py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const s = state[l.id]
            const newReceived = Math.min(l.quantity_ordered, l.quantity_received + (s.receiving_now ?? 0))
            const remaining   = Math.max(0, l.quantity_ordered - newReceived)
            const isShort     = remaining > 0 && (s.receiving_now ?? 0) > 0
            return (
              <tr key={l.id} className={`border-t border-gray-100 ${isShort ? 'bg-amber-50/40' : ''}`}>
                <td className="px-4 py-2">
                  <div className="font-medium">{l.label}</div>
                  {l.sku && <div className="text-[10px] text-gray-500 font-mono">{l.sku}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.quantity_ordered.toLocaleString()} {l.unit_of_measure}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {l.quantity_received > 0 ? l.quantity_received.toLocaleString() : '0'}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={s.receiving_now}
                    onChange={(e) => updateRow(l.id, { receiving_now: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) })}
                    className="w-24 text-right text-xs border border-amber-300 rounded px-1.5 py-1 bg-amber-50 tabular-nums"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={s.unit_cost ?? ''}
                    onChange={(e) => updateRow(l.id, { unit_cost: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder={l.unit_cost?.toString() ?? '0.00'}
                    className="w-24 text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums"
                    title="Amend the per-unit price if it differs from the PO"
                  />
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${isShort ? 'text-amber-800 font-semibold' : 'text-gray-500'}`}>
                  {remaining > 0 ? `${remaining.toLocaleString()} ${l.unit_of_measure}` : '—'}
                </td>
                <td className="px-3 py-2">
                  <input
                    value={s.note}
                    onChange={(e) => updateRow(l.id, { note: e.target.value })}
                    placeholder="Batch # · QA note · backorder"
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {willBePartial
            ? <>Status will move to <span className="font-semibold text-amber-800">Partial</span> (some lines short).</>
            : <>Status will move to <span className="font-semibold text-emerald-700">Received</span>.</>}
        </div>
        <div className="flex gap-2">
          <Link href={`/purchase-orders/${poId}`} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</Link>
          <button
            disabled={pending}
            onClick={onSave}
            className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save receipt'}
          </button>
        </div>
      </div>
    </div>
  )
}
