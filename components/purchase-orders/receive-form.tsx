'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { receivePoLines, uploadReceiptCoa, removeReceiptCoa } from '@/app/(dashboard)/purchase-orders/actions'

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
  received: number                   // TOTAL received for this line (edit-in-place)
  received_date: string              // ISO yyyy-mm-dd the stock physically arrived (per line)
  invoice_unit_cost: number | null   // user-entered invoice price (defaults to PO price)
  lot_number: string
  expiry_date: string                // ISO yyyy-mm-dd, '' when unset
  coa_file_path: string | null
  coa_file_name: string | null
  coa_uploading: boolean
  coa_error: string | null
  note: string
}

// Soft-warn when stock arrives within this many days of its expiry.
const EXPIRY_WARN_DAYS = 90

function daysUntil(iso: string): number | null {
  if (!iso) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

export function ReceiveForm({ poId, poNumber, supplierName, expectedDate, lines }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // "Set all" convenience — changing it stamps every line's received date.
  // Each line still holds its own date so split deliveries can differ.
  const today = new Date().toISOString().slice(0, 10)
  const [receivedDate, setReceivedDate] = useState<string>(today)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [state, setState] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {}
    for (const l of lines) {
      // Pre-fill the total: a fresh line defaults to the full ordered qty (the
      // common "received in full" case); an already-received line shows its
      // current total so you can correct it.
      out[l.id] = {
        received:          l.quantity_received > 0 ? l.quantity_received : l.quantity_ordered,
        received_date:     today,
        invoice_unit_cost: l.unit_cost,
        lot_number:        '',
        expiry_date:       '',
        coa_file_path:     null,
        coa_file_name:     null,
        coa_uploading:     false,
        coa_error:         null,
        note:              '',
      }
    }
    return out
  })

  function updateRow(id: string, patch: Partial<RowState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function onCoaPick(lineId: string, file: File | null) {
    if (!file) return
    updateRow(lineId, { coa_uploading: true, coa_error: null })
    const fd = new FormData()
    fd.set('line_id', lineId)
    fd.set('file', file)
    const res = await uploadReceiptCoa(fd)
    if (!res.ok) {
      updateRow(lineId, { coa_uploading: false, coa_error: res.error ?? 'Upload failed' })
      return
    }
    updateRow(lineId, {
      coa_uploading: false,
      coa_file_path: res.file_path ?? null,
      coa_file_name: res.file_name ?? null,
    })
  }

  async function onCoaRemove(lineId: string) {
    const path = state[lineId]?.coa_file_path
    // Clear UI immediately; best-effort delete of the orphaned object.
    updateRow(lineId, { coa_file_path: null, coa_file_name: null, coa_error: null })
    if (fileInputs.current[lineId]) fileInputs.current[lineId]!.value = ''
    if (path) await removeReceiptCoa(path)
  }

  const willBePartial = useMemo(() => {
    return lines.some((l) => (state[l.id]?.received ?? 0) < l.quantity_ordered)
  }, [lines, state])

  function onSave() {
    setError(null)
    const anyUploading = lines.some((l) => state[l.id]?.coa_uploading)
    if (anyUploading) {
      setError('A COA is still uploading — wait for it to finish.')
      return
    }

    // Only send lines whose total actually changed (edit-in-place).
    const receipts = lines
      .filter((l) => (state[l.id]?.received ?? 0) !== l.quantity_received)
      .map((l) => ({
        line_id:           l.id,
        received:          state[l.id].received,
        received_date:     state[l.id].received_date,
        invoice_unit_cost: state[l.id].invoice_unit_cost,
        note:              state[l.id].note,
        lot_number:        state[l.id].lot_number,
        expiry_date:       state[l.id].expiry_date,
        coa_file_path:     state[l.id].coa_file_path,
        coa_file_name:     state[l.id].coa_file_name,
      }))

    if (receipts.length === 0) {
      setError('No changes to save — edit a Received quantity first.')
      return
    }
    if (receipts.some((r) => !r.received_date)) {
      setError('Set a Date received on every line you’re changing.')
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
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            Set all dates
            <input
              type="date"
              value={receivedDate}
              max={today}
              onChange={(e) => {
                const v = e.target.value
                setReceivedDate(v)
                setState((prev) => Object.fromEntries(
                  Object.entries(prev).map(([id, r]) => [id, { ...r, received_date: v }]),
                ))
              }}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>
          <div className="text-xs text-gray-400 max-w-[170px]">
            Fills every line · each line’s date can differ
          </div>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Item</th>
              <th className="text-right px-3 py-2 font-medium">Ordered</th>
              <th className="text-right px-3 py-2 font-medium">Received</th>
              <th className="text-left px-3 py-2 font-medium">Date received</th>
              <th className="text-right px-3 py-2 font-medium">PO price</th>
              <th className="text-right px-3 py-2 font-medium">Invoice price</th>
              <th className="text-left px-3 py-2 font-medium">Lot #</th>
              <th className="text-left px-3 py-2 font-medium">Expiry</th>
              <th className="text-left px-3 py-2 font-medium">COA</th>
              <th className="text-left px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const s = state[l.id]
              const received    = s.received ?? 0
              const isShort     = received < l.quantity_ordered
              const qtyOver     = received > l.quantity_ordered
              const changed     = received !== l.quantity_received
              // Price drift vs PO line price
              const priceDrift = l.unit_cost != null && s.invoice_unit_cost != null
                && Math.abs(s.invoice_unit_cost - l.unit_cost) > 0.001
              const priceDelta = (priceDrift && l.unit_cost != null && s.invoice_unit_cost != null)
                ? s.invoice_unit_cost - l.unit_cost : 0
              const expDays = daysUntil(s.expiry_date)
              const expirySoon = expDays != null && expDays <= EXPIRY_WARN_DAYS
              const expiryPast = expDays != null && expDays < 0
              const flagged = qtyOver || priceDrift || expirySoon
              return (
                <tr key={l.id} className={`border-t border-gray-100 align-top ${flagged ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{l.label}</div>
                    {l.sku && <div className="text-[10px] text-gray-500 font-mono">{l.sku}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.quantity_ordered.toLocaleString()} {l.unit_of_measure}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={s.received}
                      onChange={(e) => updateRow(l.id, { received: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) })}
                      className={`w-24 text-right text-xs border rounded px-1.5 py-1 tabular-nums ${changed ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}
                    />
                    {l.quantity_received > 0 && <div className="text-[10px] text-gray-400 mt-0.5">was {l.quantity_received.toLocaleString()}</div>}
                    {isShort && <div className="text-[10px] text-amber-800 mt-0.5">⚠ {(l.quantity_ordered - received).toLocaleString()} short of order</div>}
                    {qtyOver && <div className="text-[10px] text-amber-800 mt-0.5">⚠ over order by {(received - l.quantity_ordered).toLocaleString()}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={s.received_date}
                      max={today}
                      onChange={(e) => updateRow(l.id, { received_date: e.target.value })}
                      className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {l.unit_cost != null ? `$${l.unit_cost.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={s.invoice_unit_cost ?? ''}
                      onChange={(e) => updateRow(l.id, { invoice_unit_cost: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder={l.unit_cost?.toString() ?? '0.00'}
                      className={`w-24 text-right text-xs rounded px-1.5 py-1 tabular-nums ${priceDrift ? 'border border-amber-300 bg-amber-50' : 'border border-gray-200'}`}
                      title="Per-unit price from the supplier invoice"
                    />
                    {priceDrift && (
                      <div className="text-[10px] text-amber-800 mt-0.5">
                        ⚠ {priceDelta > 0 ? '+' : ''}${priceDelta.toFixed(2)} vs PO
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={s.lot_number}
                      onChange={(e) => updateRow(l.id, { lot_number: e.target.value })}
                      placeholder="Lot / batch #"
                      className="w-28 text-xs border border-gray-200 rounded px-1.5 py-1 font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={s.expiry_date}
                      onChange={(e) => updateRow(l.id, { expiry_date: e.target.value })}
                      className={`text-xs rounded px-1.5 py-1 ${expirySoon ? 'border border-amber-300 bg-amber-50' : 'border border-gray-200'}`}
                    />
                    {expiryPast
                      ? <div className="text-[10px] text-red-700 mt-0.5">⚠ already expired</div>
                      : expirySoon && <div className="text-[10px] text-amber-800 mt-0.5">⚠ expires in ~{Math.max(0, Math.round((expDays ?? 0) / 7))} wks</div>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      ref={(el) => { fileInputs.current[l.id] = el }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => onCoaPick(l.id, e.target.files?.[0] ?? null)}
                    />
                    {s.coa_uploading ? (
                      <span className="text-[11px] text-gray-500">Uploading…</span>
                    ) : s.coa_file_path ? (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded px-1.5 py-1 max-w-[180px]">
                        <span>📄</span>
                        <span className="truncate" title={s.coa_file_name ?? ''}>{s.coa_file_name}</span>
                        <button
                          type="button"
                          onClick={() => onCoaRemove(l.id)}
                          className="text-emerald-700/60 hover:text-emerald-900 ml-0.5"
                          title="Remove COA"
                        >✕</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputs.current[l.id]?.click()}
                        className="inline-flex items-center gap-1 text-[11px] border border-gray-300 rounded px-2 py-1 text-gray-600 hover:bg-gray-50"
                      >⤓ Attach COA</button>
                    )}
                    {s.coa_error && <div className="text-[10px] text-red-700 mt-0.5">{s.coa_error}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={s.note}
                      onChange={(e) => updateRow(l.id, { note: e.target.value })}
                      placeholder="QA note · backorder"
                      className="w-full min-w-[120px] text-xs border border-gray-200 rounded px-1.5 py-1"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
        <div className="text-xs text-gray-600">
          {willBePartial
            ? <>Status will move to <span className="font-semibold text-amber-800">Partial</span>.</>
            : <>Status will move to <span className="font-semibold text-emerald-700">Received</span>.</>}
          {' '}On confirm, received qty moves into <b>Stock on Hand</b> at <b>Main Warehouse</b>; Lot&nbsp;#, Expiry and COA are saved against each receipt and shown in the PO&apos;s receipt history.
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href={`/purchase-orders/${poId}`} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</Link>
          <button
            disabled={pending}
            onClick={onSave}
            className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Confirm receipt + update SOH'}
          </button>
        </div>
      </div>
    </div>
  )
}
