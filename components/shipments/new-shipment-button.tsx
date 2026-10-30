'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createShipment } from '@/app/(dashboard)/shipments/actions'
import type { ShipmentDirection } from '@/lib/shipments'

export function NewShipmentButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<ShipmentDirection>('AU_TO_NZ')
  const [depart, setDepart] = useState('')
  const [arrive, setArrive] = useState('')
  const [notes, setNotes] = useState('')

  function reset() { setDirection('AU_TO_NZ'); setDepart(''); setArrive(''); setNotes(''); setError(null) }

  function onCreate() {
    setError(null)
    if (arrive && depart && arrive < depart) { setError('Arrive date is before depart date.'); return }
    start(async () => {
      const res = await createShipment({ direction, depart_date: depart || null, arrive_date: arrive || null, notes: notes || null })
      if (!res.ok || !res.id) { setError(res.error ?? 'Failed to create shipment'); return }
      setOpen(false); reset()
      router.push(`/shipments/${res.id}`)
    })
  }

  const dirBtn = (val: ShipmentDirection, label: string) => (
    <button type="button" onClick={() => setDirection(val)}
      className={`text-xs rounded-md px-3 py-2 border font-medium ${direction === val ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
      {label}
    </button>
  )

  return (
    <>
      <button onClick={() => { setOpen(true); reset() }}
        className="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap">
        ＋ New shipment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-6" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mt-10" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-emerald-900">New shipment</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">One freight movement. You can set or change the dates later; transfers loaded on it inherit them.</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {dirBtn('AU_TO_NZ', 'Australia → New Zealand')}
                  {dirBtn('NZ_TO_AU', 'New Zealand → Australia')}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depart date</label>
                  <input type="date" value={depart} onChange={(e) => setDepart(e.target.value)} className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Arrive date</label>
                  <input type="date" value={arrive} onChange={(e) => setArrive(e.target.value)} className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300}
                  placeholder="e.g. 40ft container, forwarder ref…" className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5" />
              </div>
              {error && <div className="text-xs text-rose-600">{error}</div>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
              <button disabled={pending} onClick={onCreate}
                className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
                {pending ? 'Creating…' : 'Create shipment →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
