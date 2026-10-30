'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createTransferFromProduction } from '@/app/(dashboard)/purchase-orders/actions'

export interface CreateTransferLine {
  product_id: string
  name: string
  sku: string | null
  market: 'NZ' | 'AU'
  prodByMonth: Record<string, number>
}

export interface TransferShipmentOption {
  id: string
  label: string   // e.g. "SHP-001 · AU→NZ · arrive 18 Dec 2026"
}

interface Props {
  maker: string
  lines: CreateTransferLine[]
  months: { key: string; label: string }[]
  sites: { id: string; name: string }[]
  shipments: TransferShipmentOption[]
}

type Dir = 'none' | 'AU_TO_NZ' | 'NZ_TO_AU'
const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')

export function CreateTransferButton({ maker, lines, months, sites, shipments }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ po_number: string; id: string } | null>(null)
  const [shipmentId, setShipmentId] = useState('')

  const monthsWithPlan = useMemo(
    () => months.filter((m) => lines.some((l) => (l.prodByMonth[m.key] ?? 0) > 0)),
    [months, lines],
  )
  const [month, setMonth] = useState<string>(monthsWithPlan[0]?.key ?? months[0]?.key ?? '')
  const [fromSite, setFromSite] = useState('')
  const [toSite, setToSite] = useState('')
  const [dir, setDir] = useState<Dir>('none')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // A transfer moves existing stock, so list EVERY product this maker handles —
  // not just the ones with production planned this month. A product this maker
  // makes for BOTH builds (NZ + AU) appears once (merged), so its qty input and
  // key stay unique. Ones being produced this month show a "planned" hint.
  const shownLines = useMemo(() => {
    const byId = new Map<string, CreateTransferLine & { markets: Array<'NZ' | 'AU'> }>()
    for (const l of lines) {
      const e = byId.get(l.product_id)
      if (!e) { byId.set(l.product_id, { ...l, prodByMonth: { ...l.prodByMonth }, markets: [l.market] }) }
      else {
        if (!e.markets.includes(l.market)) e.markets.push(l.market)
        for (const [m, v] of Object.entries(l.prodByMonth)) e.prodByMonth[m] = (e.prodByMonth[m] ?? 0) + (v ?? 0)
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [lines])

  const isIncluded = (pid: string) => !excluded.has(pid)
  const toggle = (pid: string) => setExcluded((prev) => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n })

  // Transfer currency follows the included lines: AU-only → AUD, else NZD.
  const derivedMarket: 'NZ' | 'AU' = useMemo(() => {
    const inc = shownLines.filter((l) => isIncluded(l.product_id) && Number(qty[l.product_id] ?? '') > 0)
    const src = inc.length ? inc : shownLines
    return src.length && src.every((l) => l.markets.length === 1 && l.markets[0] === 'AU') ? 'AU' : 'NZ'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownLines, qty, excluded])

  const readyCount = shownLines.filter((l) => isIncluded(l.product_id) && Number(qty[l.product_id] ?? '') > 0).length

  function onCreate() {
    setError(null)
    const payloadLines = shownLines
      .filter((l) => isIncluded(l.product_id))
      .map((l) => ({ product_id: l.product_id, quantity: Math.round(Number(qty[l.product_id]) || 0) }))
      .filter((l) => l.quantity > 0)
    if (!fromSite || !toSite) { setError('Pick both a From and a To site.'); return }
    if (fromSite === toSite)  { setError('From and To sites must be different.'); return }
    if (!payloadLines.length) { setError('Enter at least one quantity to transfer.'); return }
    start(async () => {
      const res = await createTransferFromProduction({
        from_site_id: fromSite,
        to_site_id: toSite,
        market: derivedMarket,
        stock_move: dir === 'none' ? null : dir,
        shipment_id: shipmentId || null,
        lines: payloadLines,
      })
      if (!res.ok || !res.created) { setError(res.error ?? 'Failed to create the transfer'); return }
      setDone(res.created)
      router.refresh()
    })
  }

  const monthLabel = months.find((m) => m.key === month)?.label ?? month

  return (
    <>
      <button onClick={(e) => { e.preventDefault(); setOpen(true); setDone(null); setError(null); setShipmentId('') }}
        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-800">
        ⇄ Create transfer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-6 overflow-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mt-6" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-emerald-900">Create draft transfer — {maker}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Pick where the stock moves from and to, then enter how many units move on each line. Dates and anything else you set on the transfer after.</p>
            </div>

            {done ? (
              <div className="p-5">
                <div className="text-sm text-emerald-800 font-medium mb-2">✓ Created draft transfer:</div>
                <div>
                  <Link href={`/purchase-orders/${done.id}`} className="text-sm text-blue-700 underline font-medium">{done.po_number}</Link>
                  <span className="text-xs text-gray-500 ml-2">draft — open to add dates & submit</span>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
                  <Link href={`/purchase-orders/${done.id}`} className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800">Open transfer</Link>
                </div>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600">Production month</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className="text-xs border border-gray-300 rounded-md px-2 py-1">
                      {(monthsWithPlan.length ? monthsWithPlan : months).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>

                  {/* From → To */}
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                    <label className="text-[11px] text-gray-600">From site
                      <select value={fromSite} onChange={(e) => setFromSite(e.target.value)}
                        className={`mt-0.5 w-full text-xs border rounded px-2 py-1.5 ${fromSite ? 'border-gray-300' : 'border-amber-300 bg-amber-50'}`}>
                        <option value="">— pick site —</option>
                        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                    <span className="pb-2 text-emerald-700 font-bold">→</span>
                    <label className="text-[11px] text-gray-600">To site
                      <select value={toSite} onChange={(e) => setToSite(e.target.value)}
                        className={`mt-0.5 w-full text-xs border rounded px-2 py-1.5 ${toSite ? 'border-gray-300' : 'border-amber-300 bg-amber-50'}`}>
                        <option value="">— pick site —</option>
                        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  </div>

                  {/* Direction */}
                  <div>
                    <div className="text-[11px] font-medium text-gray-600 mb-1">Moves stock between builds?</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {([['none', 'No — logistics only'], ['AU_TO_NZ', 'AU → NZ build'], ['NZ_TO_AU', 'NZ → AU build']] as Array<[Dir, string]>).map(([val, lbl]) => (
                        <button key={val} onClick={() => setDir(val)}
                          className={`text-[11px] rounded-full px-3 py-1 border ${dir === val ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                          {lbl}
                        </button>
                      ))}
                      <span className="text-[10px] text-gray-400">set a direction to shift stock between the NZ and AU builds (adds the ⇄ leg on Stock Movements)</span>
                    </div>
                  </div>

                  {/* Shipment (optional) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-[11px] font-medium text-gray-600">Goes on shipment</label>
                    <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 max-w-[320px]">
                      <option value="">— none (standalone transfer) —</option>
                      {shipments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    {shipmentId && <span className="text-[10px] text-gray-400">takes the shipment&apos;s depart / arrive dates</span>}
                  </div>

                  {/* Lines */}
                  {shownLines.length === 0 ? (
                    <div className="text-xs text-gray-500 py-4 text-center">This maker has no products.</div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-600 sticky top-0">
                        <span>Products — enter units for the ones moving</span><span>units to transfer</span>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {shownLines.map((l) => {
                            const inc = isIncluded(l.product_id)
                            return (
                              <tr key={l.product_id} className={`border-t border-gray-100 ${!inc ? 'opacity-40' : ''}`}>
                                <td className="px-3 py-1.5">
                                  <div className="font-medium flex items-center gap-1.5">
                                    {l.name}
                                    {l.markets.map((mk) => (
                                      <span key={mk} className={`text-[8px] font-extrabold px-1 rounded ${mk === 'AU' ? 'bg-sky-100 text-sky-800' : 'bg-gray-900 text-white'}`}>{mk === 'AU' ? 'AUS' : 'NZ'}</span>
                                    ))}
                                  </div>
                                  {(l.prodByMonth[month] ?? 0) > 0 && <div className="text-[10px] text-gray-400">planned {monthLabel}: {nf(l.prodByMonth[month] ?? 0)}</div>}
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  <input value={qty[l.product_id] ?? ''} disabled={!inc} inputMode="numeric" placeholder="0"
                                    onChange={(e) => setQty((p) => ({ ...p, [l.product_id]: e.target.value }))}
                                    className="w-20 text-right text-xs border border-gray-300 rounded px-1.5 py-1 tabular-nums disabled:bg-gray-100" />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <input type="checkbox" checked={inc} onChange={() => toggle(l.product_id)} title="Include on the transfer" />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {error && <div className="text-xs text-rose-600">{error}</div>}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400">Creates one draft transfer in {derivedMarket === 'AU' ? 'AUD' : 'NZD'} · editable before you submit</span>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button disabled={pending || readyCount === 0 || !fromSite || !toSite} onClick={onCreate}
                      className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
                      {pending ? 'Creating…' : 'Create draft transfer →'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
