'use client'

import { useState } from 'react'
import type { TransferDetail } from '@/lib/transfer-stock'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string | null): string {
  if (!iso || iso.length < 10) return ''
  return `${Number(iso.slice(8, 10))} ${MON3[Number(iso.slice(5, 7)) - 1] ?? ''}`
}

/**
 * NZ ↔ AU transfer chip — "⇄ +2,100" (arriving) or "⇄ −2,100" (leaving)
 * for a Stock Movements / Production cell. Counted in the EOM / balance.
 * Hover lists each transfer order behind it. Fixed-position tooltip so the
 * scroll container can't clip it.
 */
export function TransferChips({ items }: { items: TransferDetail[] }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  if (!items.length) return null
  const net = items.reduce((s, i) => s + i.units, 0)
  const cls = net < 0
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-teal-50 text-teal-700 border-teal-200'

  return (
    <span
      className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 rounded border cursor-help whitespace-nowrap ${cls}`}
      onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right, y: r.bottom }) }}
      onMouseLeave={() => setTip(null)}
    >
      ⇄ {net > 0 ? '+' : net < 0 ? '−' : ''}{nf(Math.abs(net))}
      {tip && (
        <span
          style={{ position: 'fixed', left: tip.x, top: tip.y + 4, transform: 'translateX(-100%)', zIndex: 60 }}
          className="block w-72 bg-slate-900 text-slate-200 rounded-lg shadow-xl p-2.5 text-left font-normal"
        >
          <span className="block text-[11px] font-bold text-white border-b border-slate-700 pb-1 mb-1">
            Transfers · {net > 0 ? '+' : net < 0 ? '−' : ''}{nf(Math.abs(net))}
          </span>
          {items.map((t, i) => (
            <span key={i} className="flex justify-between items-center gap-2 text-[11px] py-0.5">
              <span className="text-slate-300 min-w-0">
                <span className="font-mono text-[10px] bg-[#1e3a5f] text-blue-200 px-1.5 py-0.5 rounded">{t.po}</span>
                <span className="ml-1 text-slate-400">{t.units < 0 ? `to ${t.to}` : `from ${t.from}`}</span>
                {t.date && <span className="ml-1 text-slate-500">{t.planned ? 'due ' : ''}{fmtDate(t.date)}</span>}
              </span>
              <span className="text-white tabular-nums flex-shrink-0">{t.units > 0 ? '+' : '−'}{nf(Math.abs(t.units))}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
