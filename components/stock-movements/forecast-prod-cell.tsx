'use client'

import { useState } from 'react'
import type { PoFulfilment, ReceiptDetail, OpenPoDetail } from '@/lib/stock-movements'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string | null): string {
  if (!iso || iso.length < 10) return ''
  const d = Number(iso.slice(8, 10)), m = Number(iso.slice(5, 7))
  return `${d} ${MON3[m - 1] ?? ''}`
}

/**
 * Forecast-month SUPPLY number with a hover breakdown of what makes it up:
 *   • Received  — stock already booked in this month (PO + date), always counts
 *   • Still to receive — open POs due this month (+ any make-to-plan with no PO)
 * The two sum to the supply figure. Fixed-position tooltip so the scroll box
 * can't clip it.
 */
export function ForecastProdCell({
  value, received = 0, receipts = [], stillToReceipt = [],
}: {
  value: number
  received?: number
  receipts?: ReceiptDetail[]
  stillToReceipt?: OpenPoDetail[]
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)

  const openPoTotal = stillToReceipt.reduce((s, o) => s + o.remaining, 0)
  const stillToCome = Math.max(0, value - received)
  const plannedExtra = Math.max(0, stillToCome - openPoTotal)   // make-to-plan with no PO
  const hasBreakdown = value > 0 && (receipts.length > 0 || stillToReceipt.length > 0 || plannedExtra > 0)

  if (!value) return <span className="text-gray-300">—</span>
  if (!hasBreakdown) return <>{nf(value)}</>

  return (
    <span
      className="cursor-help underline decoration-dotted decoration-amber-400 underline-offset-2"
      onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right, y: r.bottom }) }}
      onMouseLeave={() => setTip(null)}
    >
      {nf(value)}
      {tip && (
        <div
          style={{ position: 'fixed', left: tip.x, top: tip.y + 4, transform: 'translateX(-100%)', zIndex: 60 }}
          className="w-72 bg-slate-900 text-slate-200 rounded-lg shadow-xl p-3 text-left pointer-events-none"
        >
          <div className="flex justify-between text-[11px] font-bold text-white border-b border-slate-700 pb-1.5 mb-1.5">
            <span>Supply</span><span className="tabular-nums">{nf(value)}</span>
          </div>

          {received > 0 && (
            <div className="mb-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-emerald-300">
                <span>Received</span><span className="tabular-nums">{nf(received)}</span>
              </div>
              {receipts.map((r, i) => {
                const ordered = r.ordered ?? null
                const shortfall = ordered != null && ordered > r.units ? ordered - r.units : 0
                return (
                  <div key={i} className="pl-1 py-0.5 text-[11px]">
                    <div className="flex justify-between items-center gap-2">
                      <span className="flex items-center gap-1.5 min-w-0 text-slate-300">
                        {r.po
                          ? <span className="font-mono text-[10px] bg-[#1e3a5f] text-blue-200 px-1.5 py-0.5 rounded whitespace-nowrap">{r.po}</span>
                          : <span className="text-[9px] uppercase tracking-wide bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">sheet</span>}
                        {r.date && <span className="text-slate-400">{fmtDate(r.date)}</span>}
                      </span>
                      <span className="text-white tabular-nums flex-shrink-0">{nf(r.units)}</span>
                    </div>
                    {shortfall > 0 && (
                      <div className="pl-1 mt-0.5 text-[10px] text-slate-400">{nf(shortfall)} short{r.shortClosed ? ' · closed off' : ' · still to come'}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {(stillToReceipt.length > 0 || plannedExtra > 0) && (
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-amber-300">
                <span>Still to receive</span><span className="tabular-nums">{nf(stillToCome)}</span>
              </div>
              {stillToReceipt.map((o, i) => (
                <div key={i} className="flex justify-between items-center gap-2 pl-1 py-0.5 text-[11px]">
                  <span className="flex items-center gap-1.5 min-w-0 text-slate-300">
                    <span className="font-mono text-[10px] bg-[#4a3a1e] text-amber-200 px-1.5 py-0.5 rounded whitespace-nowrap">{o.po}</span>
                    {o.expected && <span className="text-slate-400">due {fmtDate(o.expected)}</span>}
                  </span>
                  <span className="text-white tabular-nums flex-shrink-0">{nf(o.remaining)}</span>
                </div>
              ))}
              {plannedExtra > 0 && (
                <div className="flex justify-between items-center gap-2 pl-1 py-0.5 text-[11px]">
                  <span className="text-slate-400">Planned production · no PO</span>
                  <span className="text-white tabular-nums flex-shrink-0">{nf(plannedExtra)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
