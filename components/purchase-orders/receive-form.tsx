'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { receivePoLines, receiveTransferLines, uploadReceiptCoa, removeReceiptCoa } from '@/app/(dashboard)/purchase-orders/actions'

interface SavedBatch {
  units: number
  lot_number: string | null
  expiry_date: string | null
  coa_file_path: string | null
  coa_file_name: string | null
}

interface LineRow {
  id: string
  label: string
  sku: string | null
  quantity_ordered: number
  quantity_received: number
  is_product: boolean
  saved_short_closed: boolean
  saved_received_date: string | null
  saved_batches: SavedBatch[]          // batches already on record for this line
  unit_cost: number | null
  unit_of_measure: string
  notes: string
}

interface Props {
  poId: string
  poNumber: string
  supplierName: string
  isTransfer?: boolean
  expectedDate: string | null
  lines: LineRow[]
}

interface BatchState {
  key: string
  units: string                      // text input
  lot_number: string
  expiry_date: string                // ISO yyyy-mm-dd, '' when unset
  coa_file_path: string | null
  coa_file_name: string | null
  coa_uploading: boolean
  coa_error: string | null
}

interface RowState {
  short_closed: boolean
  received_date: string
  invoice_unit_cost: number | null
  note: string
  received: number                   // transfers only (single qty)
  batches: BatchState[]              // purchases (≥1)
}

const EXPIRY_WARN_DAYS = 90
let batchSeq = 0
const newKey = () => `b${batchSeq++}`
const num = (v: string | number | null | undefined) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0 }

function daysUntil(iso: string): number | null {
  if (!iso) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function initBatches(l: LineRow): BatchState[] {
  const blank = (b?: SavedBatch): BatchState => ({
    key: newKey(),
    units: String(b?.units ?? ''),
    lot_number: b?.lot_number ?? '',
    expiry_date: b?.expiry_date ?? '',
    coa_file_path: b?.coa_file_path ?? null,
    coa_file_name: b?.coa_file_name ?? null,
    coa_uploading: false,
    coa_error: null,
  })
  if (l.saved_batches.length) return l.saved_batches.map((b) => blank(b))
  // Fresh line → one batch pre-filled to the full ordered (or current received) qty.
  const b = blank()
  b.units = String(l.quantity_received > 0 ? l.quantity_received : l.quantity_ordered)
  return [b]
}

/** Stable signature of what would be saved, to detect which lines changed. */
function savedBatchSig(b: SavedBatch[]): string {
  return b.map((x) => `${num(x.units)}:${x.lot_number ?? ''}:${x.expiry_date ?? ''}:${x.coa_file_path ?? ''}`).join(';')
}
function stateBatchSig(b: BatchState[]): string {
  return b.filter((x) => num(x.units) > 0).map((x) => `${num(x.units)}:${x.lot_number.trim()}:${x.expiry_date.trim()}:${x.coa_file_path ?? ''}`).join(';')
}

export function ReceiveForm({ poId, poNumber, supplierName, isTransfer = false, expectedDate, lines }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [receivedDate, setReceivedDate] = useState<string>(today)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [state, setState] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {}
    for (const l of lines) {
      out[l.id] = {
        short_closed:      l.saved_short_closed,
        received_date:     l.saved_received_date ?? today,
        invoice_unit_cost: l.unit_cost,
        note:              '',
        received:          l.quantity_received > 0 ? l.quantity_received : l.quantity_ordered,
        batches:           isTransfer ? [] : initBatches(l),
      }
    }
    return out
  })

  function updateRow(id: string, patch: Partial<RowState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }
  function updateBatch(lineId: string, key: string, patch: Partial<BatchState>) {
    setState((prev) => ({ ...prev, [lineId]: { ...prev[lineId], batches: prev[lineId].batches.map((b) => (b.key === key ? { ...b, ...patch } : b)) } }))
  }
  function addBatch(lineId: string) {
    setState((prev) => ({ ...prev, [lineId]: { ...prev[lineId], batches: [...prev[lineId].batches, { key: newKey(), units: '', lot_number: '', expiry_date: '', coa_file_path: null, coa_file_name: null, coa_uploading: false, coa_error: null }] } }))
  }
  function removeBatch(lineId: string, key: string) {
    setState((prev) => {
      const batches = prev[lineId].batches.filter((b) => b.key !== key)
      return { ...prev, [lineId]: { ...prev[lineId], batches: batches.length ? batches : prev[lineId].batches } }
    })
  }

  const received = (l: LineRow) => (isTransfer ? (state[l.id]?.received ?? 0) : state[l.id].batches.reduce((s, b) => s + num(b.units), 0))

  async function onCoaPick(lineId: string, key: string, file: File | null) {
    if (!file) return
    updateBatch(lineId, key, { coa_uploading: true, coa_error: null })
    const fd = new FormData(); fd.set('line_id', lineId); fd.set('file', file)
    const res = await uploadReceiptCoa(fd)
    if (!res.ok) { updateBatch(lineId, key, { coa_uploading: false, coa_error: res.error ?? 'Upload failed' }); return }
    updateBatch(lineId, key, { coa_uploading: false, coa_file_path: res.file_path ?? null, coa_file_name: res.file_name ?? null })
  }
  async function onCoaRemove(lineId: string, key: string) {
    const path = state[lineId]?.batches.find((b) => b.key === key)?.coa_file_path
    updateBatch(lineId, key, { coa_file_path: null, coa_file_name: null, coa_error: null })
    const ref = fileInputs.current[`${lineId}:${key}`]; if (ref) ref.value = ''
    if (path) await removeReceiptCoa(path)
  }

  const willBePartial = useMemo(() => lines.some((l) => received(l) < l.quantity_ordered && !state[l.id]?.short_closed), [lines, state]) // eslint-disable-line react-hooks/exhaustive-deps

  function closeAllShort() {
    setState((prev) => {
      const out = { ...prev }
      for (const l of lines) if (received(l) < l.quantity_ordered) out[l.id] = { ...out[l.id], short_closed: true }
      return out
    })
  }

  function onSave() {
    setError(null)
    if (!isTransfer && lines.some((l) => state[l.id].batches.some((b) => b.coa_uploading))) {
      setError('A COA is still uploading — wait for it to finish.'); return
    }

    const receipts = lines
      .filter((l) => {
        const s = state[l.id]
        const dateChanged = (s?.received_date ?? '') !== (l.saved_received_date ?? today)
        const shortChanged = (s?.short_closed ?? false) !== l.saved_short_closed
        if (isTransfer) return received(l) !== l.quantity_received || !!s?.note.trim() || shortChanged || dateChanged
        return received(l) !== l.quantity_received || shortChanged || dateChanged
          || stateBatchSig(s.batches) !== savedBatchSig(l.saved_batches)
          || !!s.note.trim()
      })
      .map((l) => {
        const s = state[l.id]
        const base = {
          line_id: l.id,
          received: received(l),
          short_closed: s.short_closed,
          received_date: s.received_date,
          invoice_unit_cost: s.invoice_unit_cost,
          note: s.note,
        }
        if (isTransfer) return base
        return {
          ...base,
          batches: s.batches
            .filter((b) => num(b.units) > 0)
            .map((b) => ({ units: num(b.units), lot_number: b.lot_number.trim() || null, expiry_date: b.expiry_date.trim() || null, coa_file_path: b.coa_file_path, coa_file_name: b.coa_file_name })),
        }
      })

    if (receipts.length === 0) { setError('No changes to save — edit a Received quantity first.'); return }
    if (receipts.some((r) => !r.received_date)) { setError('Set a Date received on every line you’re changing.'); return }

    start(async () => {
      const res = isTransfer
        ? await receiveTransferLines({ po_id: poId, receipts })
        : await receivePoLines({ po_id: poId, receipts })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      router.push(`/purchase-orders/${poId}`); router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/purchase-orders/${poId}`} className="text-xs text-gray-500 hover:underline">← Back to PO</Link>
          <div>
            <h1 className="text-base font-semibold">{isTransfer ? 'Receive transfer' : 'Receive'} — {poNumber}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{supplierName}{expectedDate ? ` · expected ${expectedDate}` : ''}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
          Set all dates
          <input type="date" value={receivedDate} max={today}
            onChange={(e) => { const v = e.target.value; setReceivedDate(v); setState((prev) => Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, received_date: v }]))) }}
            className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-900" />
        </label>
      </div>

      {error && <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Item</th>
              <th className="text-right px-3 py-2 font-medium">Ordered</th>
              <th className="text-right px-3 py-2 font-medium">Received</th>
              <th className="text-left px-3 py-2 font-medium">Date received</th>
              {!isTransfer && (<>
                <th className="text-right px-3 py-2 font-medium">PO price</th>
                <th className="text-right px-3 py-2 font-medium">Invoice price</th>
                <th className="text-left px-3 py-2 font-medium">Batches — qty · lot # · expiry · COA</th>
              </>)}
              <th className="text-left px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const s = state[l.id]
              const rec = received(l)
              const isShort = rec < l.quantity_ordered
              const qtyOver = rec > l.quantity_ordered
              const priceDrift = l.unit_cost != null && s.invoice_unit_cost != null && Math.abs(s.invoice_unit_cost - l.unit_cost) > 0.001
              const priceDelta = (priceDrift && l.unit_cost != null && s.invoice_unit_cost != null) ? s.invoice_unit_cost - l.unit_cost : 0
              const changed = rec !== l.quantity_received || (!isTransfer && stateBatchSig(s.batches) !== savedBatchSig(l.saved_batches))
              const flagged = qtyOver || priceDrift
              return (
                <tr key={l.id} className={`border-t border-gray-100 align-top ${flagged ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{l.label}</div>
                    {l.sku && <div className="text-[10px] text-gray-500 font-mono">{l.sku}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity_ordered.toLocaleString()} {l.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right">
                    {isTransfer ? (
                      <input type="number" step="any" min={0} value={s.received}
                        onChange={(e) => updateRow(l.id, { received: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) })}
                        className={`w-24 text-right text-xs border rounded px-1.5 py-1 tabular-nums ${changed ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`} />
                    ) : (
                      <div className={`font-semibold tabular-nums ${changed ? 'text-amber-800' : ''}`}>{rec.toLocaleString()} <span className="font-normal text-gray-400">{l.unit_of_measure}</span>
                        {s.batches.length > 1 && <div className="text-[9px] font-normal text-gray-400">sum of {s.batches.length} batches</div>}
                      </div>
                    )}
                    {l.quantity_received > 0 && <div className="text-[10px] text-gray-400 mt-0.5">was {l.quantity_received.toLocaleString()}</div>}
                    {qtyOver && <div className="text-[10px] text-amber-800 mt-0.5">⚠ over order by {(rec - l.quantity_ordered).toLocaleString()}</div>}
                    {isShort && !isTransfer && (s.short_closed ? (
                      <div className="mt-1 text-[10px] text-emerald-800">✓ shortfall {(l.quantity_ordered - rec).toLocaleString()} closed off
                        <button type="button" onClick={() => updateRow(l.id, { short_closed: false })} className="ml-1 underline text-emerald-700 hover:text-emerald-900">reopen</button>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <div className="text-[10px] text-amber-800">⚠ {(l.quantity_ordered - rec).toLocaleString()} short of order</div>
                        <div className="inline-flex mt-0.5 border border-gray-300 rounded overflow-hidden text-[10px]">
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-medium">Still to come</span>
                          <button type="button" onClick={() => updateRow(l.id, { short_closed: true })} className="px-1.5 py-0.5 border-l border-gray-300 text-gray-600 hover:bg-emerald-50 hover:text-emerald-800" title="Nothing more coming — write off the shortfall and close this line">Close short</button>
                        </div>
                      </div>
                    ))}
                    {isShort && isTransfer && <div className="text-[10px] text-amber-800 mt-0.5">⚠ {(l.quantity_ordered - rec).toLocaleString()} short of order</div>}
                  </td>
                  <td className="px-3 py-2">
                    <input type="date" value={s.received_date} max={today} onChange={(e) => updateRow(l.id, { received_date: e.target.value })}
                      className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900" />
                  </td>
                  {!isTransfer && (<>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{l.unit_cost != null ? `$${l.unit_cost.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" step="any" min={0} value={s.invoice_unit_cost ?? ''} onChange={(e) => updateRow(l.id, { invoice_unit_cost: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder={l.unit_cost?.toString() ?? '0.00'} title="Per-unit price from the supplier invoice"
                        className={`w-24 text-right text-xs rounded px-1.5 py-1 tabular-nums ${priceDrift ? 'border border-amber-300 bg-amber-50' : 'border border-gray-200'}`} />
                      {priceDrift && <div className="text-[10px] text-amber-800 mt-0.5">⚠ {priceDelta > 0 ? '+' : ''}${priceDelta.toFixed(2)} vs PO</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1.5">
                        {s.batches.map((b, bi) => {
                          const expDays = daysUntil(b.expiry_date)
                          const expirySoon = expDays != null && expDays <= EXPIRY_WARN_DAYS
                          const expiryPast = expDays != null && expDays < 0
                          const fkey = `${l.id}:${b.key}`
                          return (
                            <div key={b.key} className="flex items-start gap-1.5">
                              {s.batches.length > 1 && <span className="text-[9px] text-gray-400 w-3 pt-1.5">{bi + 1}</span>}
                              <input type="number" step="any" min={0} value={b.units} onChange={(e) => updateBatch(l.id, b.key, { units: e.target.value })}
                                placeholder="qty" className="w-20 text-right text-xs border border-gray-300 rounded px-1.5 py-1 tabular-nums" />
                              <input value={b.lot_number} onChange={(e) => updateBatch(l.id, b.key, { lot_number: e.target.value })}
                                placeholder="Lot #" className="w-28 text-xs border border-gray-200 rounded px-1.5 py-1 font-mono" />
                              <div>
                                <input type="date" value={b.expiry_date} onChange={(e) => updateBatch(l.id, b.key, { expiry_date: e.target.value })}
                                  className={`text-xs rounded px-1.5 py-1 ${expirySoon ? 'border border-amber-300 bg-amber-50' : 'border border-gray-200'}`} />
                                {expiryPast ? <div className="text-[10px] text-red-700 mt-0.5">⚠ expired</div>
                                  : expirySoon && <div className="text-[10px] text-amber-800 mt-0.5">⚠ ~{Math.max(0, Math.round((expDays ?? 0) / 7))} wks</div>}
                              </div>
                              <input ref={(el) => { fileInputs.current[fkey] = el }} type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" className="hidden" onChange={(e) => onCoaPick(l.id, b.key, e.target.files?.[0] ?? null)} />
                              {b.coa_uploading ? <span className="text-[11px] text-gray-500 pt-1.5">Uploading…</span>
                                : b.coa_file_path ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded px-1.5 py-1 max-w-[150px]">
                                    <span>📄</span><span className="truncate" title={b.coa_file_name ?? ''}>{b.coa_file_name}</span>
                                    <button type="button" onClick={() => onCoaRemove(l.id, b.key)} className="text-emerald-700/60 hover:text-emerald-900 ml-0.5" title="Remove COA">✕</button>
                                  </span>
                                ) : <button type="button" onClick={() => fileInputs.current[fkey]?.click()} className="inline-flex items-center gap-1 text-[11px] border border-gray-300 rounded px-2 py-1 text-gray-600 hover:bg-gray-50">⤓ COA</button>}
                              {s.batches.length > 1 && <button type="button" onClick={() => removeBatch(l.id, b.key)} className="text-gray-300 hover:text-red-600 pt-1" title="Remove batch">✕</button>}
                              {b.coa_error && <span className="text-[10px] text-red-700 pt-1.5">{b.coa_error}</span>}
                            </div>
                          )
                        })}
                        <button type="button" onClick={() => addBatch(l.id)} className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 hover:bg-emerald-100">＋ Add batch</button>
                      </div>
                    </td>
                  </>)}
                  <td className="px-3 py-2">
                    <input value={s.note} onChange={(e) => updateRow(l.id, { note: e.target.value })} placeholder="QA note · backorder" className="w-full min-w-[120px] text-xs border border-gray-200 rounded px-1.5 py-1" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
        <div className="text-xs text-gray-600">
          {willBePartial ? <>Status will move to <span className="font-semibold text-amber-800">Partial</span>.</> : <>Status will move to <span className="font-semibold text-emerald-700">Received</span>.</>}
          {isTransfer
            ? <>{' '}Confirms what arrived at the destination site. Logistics record only — Stock on Hand isn&apos;t changed by transfers.</>
            : <>{' '}On confirm, received qty moves into <b>Stock on Hand</b> at <b>Main Warehouse</b>; each batch&apos;s Lot&nbsp;#, Expiry and COA are saved against its own receipt and shown in the PO&apos;s receipt history.</>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href={`/purchase-orders/${poId}`} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</Link>
          {!isTransfer && willBePartial && (
            <button type="button" onClick={closeAllShort} className="px-3 py-1.5 text-xs border border-emerald-700 text-emerald-800 rounded-md hover:bg-emerald-50 font-medium" title="Write off every outstanding shortfall — nothing more is coming">Close PO — nothing more to come</button>
          )}
          <button disabled={pending} onClick={onSave} className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
            {pending ? 'Saving…' : isTransfer ? 'Confirm receipt' : willBePartial ? 'Confirm receipt + update SOH' : 'Confirm & close PO + update SOH'}
          </button>
        </div>
      </div>
    </div>
  )
}
