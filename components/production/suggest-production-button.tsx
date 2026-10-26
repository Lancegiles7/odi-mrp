'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { methodologyFor, methodologyLabel, suggestProduction } from '@/lib/production-methodology'
import { applySuggestedProduction } from '@/app/(dashboard)/production/actions'

export interface SuggestLine {
  product_id: string
  name: string
  sku: string | null
  market: 'NZ' | 'AU'
  opening: number
  forecast: Record<string, number>
  existingPlan: Record<string, number>
  firmPo: Record<string, number>
  transfers: Record<string, number>
}

interface Props {
  maker: string
  lines: SuggestLine[]
  months: { key: string; label: string }[]
  fromMonth: string
}

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')

export function SuggestProductionButton({ maker, lines, months, fromMonth }: Props) {
  const router = useRouter()
  const method = methodologyFor(maker)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [ovr, setOvr] = useState<Record<string, string>>({})

  const allMonths = useMemo(() => months.map((m) => m.key), [months])
  const showMonths = useMemo(() => months.filter((m) => m.key >= fromMonth), [months, fromMonth])

  // Base suggestion per product (recomputed only when dialog opens / inputs change).
  const base = useMemo(() => {
    if (!method) return {}
    const out: Record<string, ReturnType<typeof suggestProduction>> = {}
    for (const l of lines) out[`${l.product_id}:${l.market}`] = suggestProduction(method, {
      opening: l.opening, months: allMonths, forecast: l.forecast, existingPlan: l.existingPlan,
      firmPo: l.firmPo, transfers: l.transfers, fromMonth,
    })
    return out
  }, [method, lines, allMonths, fromMonth])

  if (!method) return null

  // Key by product_id + market: NZ and AU share one product_id (market is a
  // separate column), so keying by product_id alone collides the two markets.
  const lid = (l: SuggestLine) => `${l.product_id}:${l.market}`
  const key = (l: SuggestLine, m: string) => `${lid(l)}:${m}`
  const prodOf = (l: SuggestLine, m: string): number => {
    if (m < fromMonth) return l.existingPlan[m] ?? 0
    const k = key(l, m)
    if (k in ovr) return Math.max(0, Math.round(Number(ovr[k]) || 0))
    return base[lid(l)]?.[m]?.suggested ?? 0
  }
  // Live forward balance for a product using current (edited) production.
  const sim = (l: SuggestLine) => {
    let bal = l.opening
    const cells: Record<string, { closing: number }> = {}
    for (const m of allMonths) { bal = bal + prodOf(l, m) + (l.transfers[m] ?? 0) - (l.forecast[m] ?? 0); cells[m] = { closing: Math.round(bal) } }
    return cells
  }

  const byMarket = useMemo(() => {
    const g: Record<'NZ' | 'AU', SuggestLine[]> = { NZ: [], AU: [] }
    for (const l of lines) g[l.market].push(l)
    return g
  }, [lines])
  const marketsPresent = (['NZ', 'AU'] as const).filter((m) => byMarket[m].length > 0)

  const grandTotal = lines.reduce((s, l) => s + showMonths.reduce((a, m) => a + prodOf(l, m.key), 0), 0)

  function onApply() {
    setError(null)
    const rows: Array<{ product_id: string; year_month: string; market: 'NZ' | 'AU'; units_planned: number; source: 'manual' | 'suggested'; suggested_units: number | null }> = []
    for (const l of lines) for (const m of showMonths) {
      if ((l.firmPo[m.key] ?? 0) > 0) continue   // already ordered — leave as is
      // A cell the user edited in the dialog lands as 'manual'; the rest are the
      // model's draft. Either way we keep the model's figure in suggested_units.
      const model = base[lid(l)]?.[m.key]?.suggested ?? 0
      const edited = key(l, m.key) in ovr
      rows.push({
        product_id: l.product_id, year_month: m.key, market: l.market,
        units_planned: prodOf(l, m.key),
        source: edited ? 'manual' : 'suggested',
        suggested_units: model,
      })
    }
    if (!rows.length) { setError('Nothing to apply.'); return }
    start(async () => {
      const res = await applySuggestedProduction({ rows })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setDone(res.applied ?? rows.length)
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={(e) => { e.preventDefault(); setOpen(true); setDone(null); setError(null) }}
        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-50">
        ✨ Suggest production
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-4 overflow-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mt-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-emerald-900">Suggested production — {maker}</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">{methodologyLabel(method)} · from {showMonths[0]?.label ?? '—'} · nets off POs already placed · earlier months untouched.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
            </div>

            {done != null ? (
              <div className="p-6 text-center">
                <div className="text-sm text-emerald-800 font-medium">✓ Applied {done} month‑values to the production plan.</div>
                <p className="text-xs text-gray-500 mt-1">The numbers now show on the schedule — create POs from them when ready.</p>
                <button onClick={() => setOpen(false)} className="mt-4 px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800">Done</button>
              </div>
            ) : (
              <>
                <div className="p-4 overflow-x-auto max-h-[70vh]">
                  <table className="text-[11px] tabular-nums border-separate border-spacing-0 whitespace-nowrap">
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-20 bg-gray-100 text-left px-3 py-1.5 min-w-[200px]">Product</th>
                        {showMonths.map((m) => <th key={m.key} className="bg-gray-100 text-right px-2 py-1.5 border-l border-gray-200 min-w-[72px]">{m.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {marketsPresent.map((mk) => (
                        <Fragment key={mk}>
                          <tr><td colSpan={showMonths.length + 1} className="sticky left-0 bg-gray-50 text-[9.5px] font-extrabold uppercase tracking-wider text-gray-500 px-3 py-1 border-y border-gray-200">{mk === 'AU' ? 'Australia' : 'New Zealand'}</td></tr>
                          {byMarket[mk].map((l) => {
                            const cells = sim(l)
                            return (
                              <tr key={l.product_id} className="border-t border-gray-100">
                                <td className="sticky left-0 bg-white px-3 py-1.5"><div className="font-medium">{l.name}</div><div className="text-[9px] text-gray-400 font-mono">{l.sku}</div></td>
                                {showMonths.map((m) => {
                                  const locked = (l.firmPo[m.key] ?? 0) > 0
                                  const closing = cells[m.key].closing
                                  return (
                                    <td key={m.key} className={`align-top text-right px-2 py-1 border-l border-gray-100 ${closing < 0 ? 'bg-rose-50' : ''}`}>
                                      {locked ? (
                                        <span className="block text-gray-500" title="Already has a PO this month — left as is">🔒 {nf(prodOf(l, m.key))}</span>
                                      ) : (
                                        <input value={prodOf(l, m.key) === 0 ? '' : String(prodOf(l, m.key))} placeholder="0" inputMode="numeric"
                                          onChange={(e) => setOvr((p) => ({ ...p, [key(l, m.key)]: e.target.value }))}
                                          className="w-[60px] text-right text-[11px] border border-gray-300 rounded px-1 py-0.5 tabular-nums font-semibold text-emerald-800" />
                                      )}
                                      <span className="block text-[8.5px] text-gray-400">fc {nf(l.forecast[m.key] ?? 0)}</span>
                                      <span className={`block text-[8.5px] ${closing < 0 ? 'text-rose-700 font-bold' : 'text-gray-400'}`}>→ {nf(closing)}</span>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-700">{nf(grandTotal)}</span> units suggested · <span className="text-gray-400">fc = forecast · → = projected closing · 🔒 already on a PO</span>
                  </div>
                  <div className="flex gap-2">
                    {error && <span className="text-xs text-rose-600 self-center">{error}</span>}
                    <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button disabled={pending} onClick={onApply} className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50">
                      {pending ? 'Applying…' : 'Apply to production plan'}
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
