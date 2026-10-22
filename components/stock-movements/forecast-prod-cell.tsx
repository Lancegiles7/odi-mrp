'use client'

import { useState } from 'react'
import type { PoFulfilment } from '@/lib/stock-movements'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')

/**
 * Forecast PROD number. When the month's supply came from a PO that was received
 * short and closed off, the number carries a dotted amber underline and a hover
 * tooltip ("partially fulfilled · closed — 999 of 4,000") instead of a block of
 * inline copy under the cell. Fixed-position tooltip so the scroll box can't clip it.
 */
export function ForecastProdCell({ value, fulfilments }: { value: number; fulfilments: PoFulfilment[] }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const has = fulfilments.length > 0
  if (!has) return value ? <>{nf(value)}</> : <span className="text-gray-300">—</span>

  return (
    <span
      className="cursor-help underline decoration-dotted decoration-amber-400 underline-offset-2"
      onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right, y: r.bottom }) }}
      onMouseLeave={() => setTip(null)}
    >
      {value ? nf(value) : '0'}
      {tip && (
        <div
          style={{ position: 'fixed', left: tip.x, top: tip.y + 4, transform: 'translateX(-100%)', zIndex: 60 }}
          className="w-64 bg-slate-900 text-slate-200 rounded-lg shadow-xl p-3 text-left pointer-events-none"
        >
          <div className="text-[11px] font-bold text-white border-b border-slate-700 pb-1.5 mb-1.5">
            Partially fulfilled · closed
          </div>
          {fulfilments.map((f) => (
            <div key={f.po} className="text-[11px] py-0.5 flex items-center gap-1.5">
              <span className="font-mono text-[10px] bg-[#1e3a5f] text-blue-200 px-1.5 py-0.5 rounded whitespace-nowrap">{f.po}</span>
              <span className="text-slate-300">{nf(f.received)} of {nf(f.ordered)} received, closed short</span>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
