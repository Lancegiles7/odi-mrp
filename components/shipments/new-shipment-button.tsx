'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createShipment } from '@/app/(dashboard)/shipments/actions'
import type { ShipmentDirection, ContainerType, CostBasis, FreightCurrency } from '@/lib/shipments'

const CONTAINERS: Array<{ v: ContainerType; label: string }> = [
  { v: '40ft', label: '40ft container' },
  { v: '20ft', label: '20ft container' },
  { v: 'lcl', label: 'LCL / part container' },
  { v: 'air', label: 'Air freight' },
  { v: 'other', label: 'Other' },
]

export function NewShipmentButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [direction, setDirection] = useState<ShipmentDirection>('AU_TO_NZ')
  const [booked, setBooked] = useState('')
  const [depart, setDepart] = useState('')
  const [arrive, setArrive] = useState('')
  const [container, setContainer] = useState<ContainerType | ''>('')
  const [cost, setCost] = useState('')
  const [currency, setCurrency] = useState<FreightCurrency>('NZD')
  const [basis, setBasis] = useState<CostBasis | ''>('')
  const [carrier, setCarrier] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setDirection('AU_TO_NZ'); setBooked(''); setDepart(''); setArrive('')
    setContainer(''); setCost(''); setCurrency('NZD'); setBasis(''); setCarrier(''); setReference(''); setNotes(''); setError(null)
  }

  function onCreate() {
    setError(null)
    if (arrive && depart && arrive < depart) { setError('Arrive date is before depart date.'); return }
    start(async () => {
      const res = await createShipment({
        direction, depart_date: depart || null, arrive_date: arrive || null, notes: notes || null,
        container_type: container || null,
        freight_cost: cost ? Number(cost) : null,
        freight_currency: currency,
        cost_basis: basis || null,
        carrier: carrier || null,
        reference: reference || null,
        booked_date: booked || null,
      })
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
  const lbl = 'block text-[11px] font-medium text-gray-600 mb-1'
  const inp = 'w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400'

  return (
    <>
      <button onClick={() => { setOpen(true); reset() }}
        className="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap">
        ＋ New shipment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-6 overflow-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-emerald-900">New shipment</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">One freight movement. Everything except direction is optional and can be filled in as the booking firms up.</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={lbl}>Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {dirBtn('AU_TO_NZ', 'Australia → New Zealand')}
                  {dirBtn('NZ_TO_AU', 'New Zealand → Australia')}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Booked date</label><input type="date" value={booked} onChange={(e) => setBooked(e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Depart date</label><input type="date" value={depart} onChange={(e) => setDepart(e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Arrive date</label><input type="date" value={arrive} onChange={(e) => setArrive(e.target.value)} className={inp} /></div>
              </div>

              <div>
                <label className={lbl}>Container / freight type</label>
                <select value={container} onChange={(e) => setContainer(e.target.value as ContainerType | '')} className={inp}>
                  <option value="">— not set —</option>
                  {CONTAINERS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl}>Freight cost</label>
                <div className="flex gap-2">
                  <select value={currency} onChange={(e) => setCurrency(e.target.value as FreightCurrency)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5">
                    <option value="NZD">NZD</option><option value="AUD">AUD</option>
                  </select>
                  <input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className={`${inp} flex-1`} />
                  <select value={basis} onChange={(e) => setBasis(e.target.value as CostBasis | '')} className="text-sm border border-gray-300 rounded-md px-2 py-1.5">
                    <option value="">basis…</option>
                    <option value="quoted">Quoted</option>
                    <option value="estimated">Estimated</option>
                    <option value="actual">Actual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Carrier / forwarder</label><input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={120} placeholder="e.g. Mainfreight" className={inp} /></div>
                <div><label className={lbl}>Booking / reference no.</label><input type="text" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="BOL / container no." className={inp} /></div>
              </div>

              <div>
                <label className={lbl}>Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="special handling, split container, etc." className={inp} />
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
