'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPosFromProductionPlan } from '@/app/(dashboard)/purchase-orders/actions'

export interface CreatePoLine {
  product_id: string
  name: string
  sku: string | null
  market: 'NZ' | 'AU'
  prodByMonth: Record<string, number>
  poByMonth: Record<string, boolean>   // already has a PO (firm or draft) that month
  lastPrice: number | null
}

interface Props {
  maker: string
  lines: CreatePoLine[]
  months: { key: string; label: string }[]
  suppliers: { id: string; name: string }[]
  defaultSupplierId: string | null
}

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MK: Array<'NZ' | 'AU'> = ['NZ', 'AU']

export function CreatePoButton({ maker, lines, months, suppliers, defaultSupplierId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Array<{ po_number: string; id: string; market: 'NZ' | 'AU' }> | null>(null)

  const monthsWithPlan = useMemo(
    () => months.filter((m) => lines.some((l) => (l.prodByMonth[m.key] ?? 0) > 0)),
    [months, lines],
  )
  const [month, setMonth] = useState<string>(monthsWithPlan[0]?.key ?? months[0]?.key ?? '')
  const [supplier, setSupplier] = useState<Record<'NZ' | 'AU', string>>({ NZ: defaultSupplierId ?? '', AU: defaultSupplierId ?? '' })
  const [qty, setQty] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // Lines to order this month, grouped by market.
  const byMarket = useMemo(() => {
    const out: Record<'NZ' | 'AU', CreatePoLine[]> = { NZ: [], AU: [] }
    for (const l of lines) if ((l.prodByMonth[month] ?? 0) > 0) out[l.market].push(l)
    return out
  }, [lines, month])
  const marketsPresent = MK.filter((m) => byMarket[m].length > 0)

  const key = (m: string, pid: string) => `${m}:${pid}`
  const getQty = (l: CreatePoLine) => qty[key(l.market, l.product_id)] ?? String(l.prodByMonth[month] ?? 0)
  const isIncluded = (l: CreatePoLine) => !excluded.has(key(l.market, l.product_id))
  const toggle = (l: CreatePoLine) => setExcluded((prev) => { const n = new Set(prev); const k = key(l.market, l.product_id); n.has(k) ? n.delete(k) : n.add(k); return n })

  const poCount = marketsPresent.filter((m) => byMarket[m].some(isIncluded)).length

  function onCreate() {
    setError(null)
    const pos = marketsPresent.map((m) => ({
      market: m,
      supplier_id: supplier[m],
      lines: byMarket[m].filter(isIncluded).map((l) => ({
        product_id: l.product_id,
        quantity_ordered: Math.round(Number(getQty(l)) || 0),
        unit_cost: l.lastPrice,
      })).filter((x) => x.quantity_ordered > 0),
    })).filter((p) => p.lines.length > 0)
    if (!pos.length) { setError('Nothing selected to order.'); return }
    if (pos.some((p) => !p.supplier_id)) { setError('Pick a supplier for each order.'); return }
    start(async () => {
      const res = await createPosFromProductionPlan({ pos })
      if (!res.ok) { setError(res.error ?? 'Failed to create'); return }
      setDone(res.created ?? [])
      router.refresh()
    })
  }

  const monthLabel = months.find((m) => m.key === month)?.label ?? month

  return (
    <>
      <button onClick={(e) => { e.preventDefault(); setOpen(true); setDone(null); setError(null) }}
        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-800">
        ＋ Create PO
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-6 overflow-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mt-6" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-emerald-900">Create draft PO — {maker}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Pre‑filled from the production plan. Quantities and supplier are editable; delivery date and anything else you add on the PO after.</p>
            </div>

            {done ? (
              <div className="p-5">
                <div className="text-sm text-emerald-800 font-medium mb-2">✓ Created {done.length} draft PO{done.length === 1 ? '' : 's'}:</div>
                <ul className="space-y-1.5">
                  {done.map((d) => (
                    <li key={d.id}>
                      <Link href={`/purchase-orders/${d.id}`} className="text-sm text-blue-700 underline font-medium">{d.po_number}</Link>
                      <span className="text-xs text-gray-500 ml-2">{d.market} · draft — open to add delivery date & submit</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
                  <Link href="/purchase-orders" className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800">Go to Purchase Orders</Link>
                </div>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600">Month</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className="text-xs border border-gray-300 rounded-md px-2 py-1">
                      {(monthsWithPlan.length ? monthsWithPlan : months).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    {marketsPresent.length > 1 && <span className="text-[11px] text-gray-500">2 markets planned → 2 draft POs</span>}
                  </div>

                  {marketsPresent.length === 0 && <div className="text-xs text-gray-500 py-4 text-center">No production planned for {monthLabel}.</div>}

                  {marketsPresent.map((m) => {
                    const items = byMarket[m]
                    const total = items.filter(isIncluded).reduce((s, l) => s + (Math.round(Number(getQty(l)) || 0)), 0)
                    return (
                      <div key={m} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-extrabold px-1.5 rounded ${m === 'AU' ? 'bg-sky-100 text-sky-800' : 'bg-gray-900 text-white'}`}>{m === 'AU' ? 'AUS' : 'NZ'}</span>
                            <span className="text-xs font-semibold">{m} draft PO · {nf(total)} units</span>
                          </div>
                          <label className="text-[11px] text-gray-600 flex items-center gap-1">Supplier
                            <select value={supplier[m]} onChange={(e) => setSupplier((p) => ({ ...p, [m]: e.target.value }))}
                              className={`text-[11px] border rounded px-1.5 py-1 max-w-[220px] ${supplier[m] ? 'border-gray-300' : 'border-rose-300 bg-rose-50'}`}>
                              <option value="">— pick supplier —</option>
                              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </label>
                        </div>
                        <table className="w-full text-xs">
                          <thead><tr className="text-[9.5px] uppercase tracking-wide text-gray-400"><th className="text-left px-3 py-1.5 font-medium">Product</th><th className="text-right px-3 py-1.5 font-medium">Qty</th><th className="px-2 py-1.5"></th></tr></thead>
                          <tbody>
                            {items.map((l) => {
                              const inc = isIncluded(l)
                              const hasPo = l.poByMonth[month] === true
                              return (
                                <tr key={l.product_id} className={`border-t border-gray-100 ${!inc ? 'opacity-40' : ''} ${hasPo && inc ? 'bg-amber-50/50' : ''}`}>
                                  <td className="px-3 py-1.5">
                                    <div className="font-medium">{l.name}</div>
                                    {hasPo && <div className="text-[10px] text-amber-700">⚠ already has a PO this month</div>}
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
                                    <input value={getQty(l)} disabled={!inc} inputMode="numeric"
                                      onChange={(e) => setQty((p) => ({ ...p, [key(l.market, l.product_id)]: e.target.value }))}
                                      className="w-20 text-right text-xs border border-gray-300 rounded px-1.5 py-1 tabular-nums disabled:bg-gray-100" />
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <input type="checkbox" checked={inc} onChange={() => toggle(l)} title="Include on the PO" />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}

                  {error && <div className="text-xs text-rose-600">{error}</div>}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  <button disabled={pending || poCount === 0} onClick={onCreate}
                    className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
                    {pending ? 'Creating…' : `Create ${poCount || ''} draft PO${poCount === 1 ? '' : 's'} →`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
