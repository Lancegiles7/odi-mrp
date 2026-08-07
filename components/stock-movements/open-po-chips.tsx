'use client'

import { useState } from 'react'
import type { OpenPoDetail } from '@/lib/stock-movements'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string | null): string {
  if (!iso || iso.length < 10) return ''
  return `${Number(iso.slice(8, 10))} ${MON3[Number(iso.slice(5, 7)) - 1] ?? ''}`
}

/**
 * Open-PO chip for a Stock Movements cell.
 *   kind="still"    → blue  "N still to receipt" (fully-open PO — COUNTED in the EOM)
 *   kind="partial"  → amber "N partial receipt"  (part-received PO line — flag only)
 * Fixed-position hover tooltip so the scroll container can't clip it.
 */
export function OpenPoChips({ items, kind }: { items: OpenPoDetail[]; kind: 'still' | 'partial' }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  if (!items.length) return null
  const total = items.reduce((s, i) => s + i.remaining, 0)
  const cls = kind === 'partial'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200'
  const label = kind === 'partial' ? `⚠ ${nf(total)} partial receipt` : `⌛ ${nf(total)} still to receipt`

  return (
    <span
      className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 rounded border cursor-help whitespace-nowrap ${cls}`}
      onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right, y: r.bottom }) }}
      onMouseLeave={() => setTip(null)}
    >
      {label}
      {tip && (
        <span
          style={{ position: 'fixed', left: tip.x, top: tip.y + 4, transform: 'translateX(-100%)', zIndex: 60 }}
          className="block w-64 bg-slate-900 text-slate-200 rounded-lg shadow-xl p-2.5 text-left font-normal"
        >
          <span className="block text-[11px] font-bold text-white border-b border-slate-700 pb-1 mb-1">
            {kind === 'partial' ? 'Partial receipt' : 'Still to receipt'} · {nf(total)}
          </span>
          {items.map((r, i) => (
            <span key={i} className="flex justify-between items-center gap-2 text-[11px] py-0.5">
              <span className="text-slate-300">
                <span className="font-mono text-[10px] bg-[#1e3a5f] text-blue-200 px-1.5 py-0.5 rounded">{r.po}</span>
                {r.expected && <span className="ml-1 text-slate-400">due {fmtDate(r.expected)}</span>}
              </span>
              <span className="text-white tabular-nums flex-shrink-0">{nf(r.remaining)}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
