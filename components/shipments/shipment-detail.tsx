'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateShipment, deleteShipment, setTransferShipment } from '@/app/(dashboard)/shipments/actions'
import type { ShipmentDetail as Detail, ShipmentStatus, ShipmentTransfer } from '@/lib/shipments'
import { RouteFlags, StatusPill, DIRECTION_LABEL } from '@/components/shipments/shipment-bits'

const STATUSES: ShipmentStatus[] = ['planned', 'departed', 'arrived', 'cancelled']

export function ShipmentDetail({ shipment, assignable }: { shipment: Detail; assignable: ShipmentTransfer[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [depart, setDepart] = useState(shipment.depart_date ?? '')
  const [arrive, setArrive] = useState(shipment.arrive_date ?? '')
  const [addId, setAddId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = (patch: Parameters<typeof updateShipment>[0]) =>
    start(async () => { const r = await updateShipment(patch); if (!r.ok) setError(r.error ?? 'Save failed'); else { setError(null); router.refresh() } })

  const saveDates = () => {
    if (arrive && depart && arrive < depart) { setError('Arrive date is before depart date.'); return }
    save({ id: shipment.id, depart_date: depart || null, arrive_date: arrive || null })
  }

  const addTransfer = () => {
    if (!addId) return
    start(async () => { await setTransferShipment(addId, shipment.id); setAddId(''); router.refresh() })
  }
  const removeTransfer = (tid: string) =>
    start(async () => { await setTransferShipment(tid, null); router.refresh() })

  const onDelete = () => {
    if (!confirm(`Delete ${shipment.shipment_number}? Transfers on it are kept — they just come off the shipment.`)) return
    start(async () => { const r = await deleteShipment(shipment.id); if (r.ok) router.push('/shipments') })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-emerald-900 text-emerald-50 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xl font-bold">{shipment.shipment_number}</span>
            <RouteFlags direction={shipment.direction} />
            <span className="text-xs text-emerald-200/90">{DIRECTION_LABEL[shipment.direction]}</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={shipment.status} onChange={(e) => save({ id: shipment.id, status: e.target.value as ShipmentStatus })}
              className="text-xs bg-emerald-800 border border-emerald-700 rounded-md px-2 py-1 text-emerald-50">
              {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button onClick={onDelete} className="text-xs border border-emerald-700 rounded-md px-2.5 py-1 hover:bg-emerald-800">Delete</button>
          </div>
        </div>

        <div className="flex items-end gap-4 mt-4 flex-wrap">
          <label className="text-[11px] text-emerald-200/90">Depart date
            <input type="date" value={depart} onChange={(e) => setDepart(e.target.value)} onBlur={saveDates}
              className="block mt-0.5 text-sm bg-emerald-800 border border-emerald-700 rounded-md px-2 py-1 text-white" />
          </label>
          <span className="pb-1.5 text-emerald-300 font-bold">→</span>
          <label className="text-[11px] text-emerald-200/90">Arrive date <span className="text-emerald-300">· stock lands this month</span>
            <input type="date" value={arrive} onChange={(e) => setArrive(e.target.value)} onBlur={saveDates}
              className="block mt-0.5 text-sm bg-emerald-800 border border-emerald-700 rounded-md px-2 py-1 text-white" />
          </label>
          <div className="pb-1 text-xs text-emerald-200/90 ml-auto">
            <span className="font-semibold text-white">{shipment.transfers.length}</span> transfer{shipment.transfers.length === 1 ? '' : 's'} ·
            <span className="font-semibold text-white"> {shipment.total_units.toLocaleString()}</span> units
          </div>
        </div>
        {error && <div className="text-xs text-rose-200 mt-2">{error}</div>}
      </div>

      {/* Transfers on this shipment */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] uppercase font-semibold tracking-wide text-gray-500">Loaded on this shipment</span>
          <div className="flex items-center gap-2">
            <select value={addId} onChange={(e) => setAddId(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 max-w-[320px]">
              <option value="">＋ Add a transfer…</option>
              {assignable.map((t) => (
                <option key={t.id} value={t.id}>{t.po_number} · {t.from_site ?? '?'} → {t.to_site ?? '?'} · {t.units.toLocaleString()} units</option>
              ))}
            </select>
            <button onClick={addTransfer} disabled={!addId || pending}
              className="text-xs bg-emerald-700 text-white rounded px-2.5 py-1 hover:bg-emerald-800 disabled:opacity-40">Add</button>
          </div>
        </div>

        {shipment.transfers.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">Nothing loaded yet. Add a transfer above, or pick this shipment when creating a transfer on Production.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-gray-500 border-b border-gray-100">
                <th className="text-left font-semibold px-4 py-2">Transfer</th>
                <th className="text-left font-semibold px-3 py-2">From → To</th>
                <th className="text-left font-semibold px-3 py-2">Contents</th>
                <th className="text-right font-semibold px-3 py-2">Units</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shipment.transfers.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/purchase-orders/${t.id}`} className="font-semibold text-emerald-800 hover:underline">{t.po_number}</Link>
                    {t.moves_build && <span className="ml-1.5 text-[9px] bg-emerald-100 text-emerald-700 rounded px-1 py-0.5 font-bold" title="Moves stock between builds">⇄ build</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{t.from_site ?? '?'} <span className="text-emerald-700">→</span> {t.to_site ?? '?'}</td>
                  <td className="px-3 py-2 text-gray-600">{t.contents}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{t.units.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => removeTransfer(t.id)} disabled={pending} className="text-xs text-gray-400 hover:text-rose-600">remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-gray-400">Each row is a transfer order (products and/or miscellaneous items). Changing the arrive date above moves every transfer on this shipment to the new month.</p>
    </div>
  )
}
