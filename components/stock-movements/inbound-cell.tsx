'use client'

import { useState } from 'react'
import type { ReceiptDetail, OpenPoDetail } from '@/lib/stock-movements'
import { OpenPoChips } from '@/components/stock-movements/open-po-chips'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string | null): string {
  if (!iso || iso.length < 10) return ''
  const d = Number(iso.slice(8, 10)), m = Number(iso.slice(5, 7))
  return `${d} ${MON3[m - 1] ?? ''}`
}

/**
 * Inbound (stock-in) cell for the Stock Movements grid. Shows the monthly total
 * and, when receipts are known, a hover tooltip listing each one with its PO ref.
 * Fixed-position tooltip so the scroll container can't clip it.
 */
export function InboundCell({ value, receipts, stillToReceipt = [], partialReceipt = [] }: { value: number; receipts: ReceiptDetail[]; stillToReceipt?: OpenPoDetail[]; partialReceipt?: OpenPoDetail[] }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const has = receipts.length > 0

  return (
    <td className="px-1.5 py-2 text-right text-emerald-700 border-l border-gray-100">
      <span
        onMouseEnter={has ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right, y: r.bottom }) } : undefined}
        onMouseLeave={has ? () => setTip(null) : undefined}
      >
      {value
        ? (has
            ? <span className="cursor-help underline decoration-dotted decoration-emerald-300 underline-offset-2">{nf(value)}</span>
            : nf(value))
        : <span className="text-gray-300">—</span>}
      </span>
      {stillToReceipt.length > 0 && <div><OpenPoChips items={stillToReceipt} kind="still" /></div>}
      {partialReceipt.length > 0 && <div><OpenPoChips items={partialReceipt} kind="partial" /></div>}

      {tip && has && (
        <div
          style={{ position: 'fixed', left: tip.x, top: tip.y + 4, transform: 'translateX(-100%)', zIndex: 60 }}
          className="w-72 bg-slate-900 text-slate-200 rounded-lg shadow-xl p-3 text-left pointer-events-none"
        >
          <div className="flex justify-between text-[11px] font-bold text-white border-b border-slate-700 pb-1.5 mb-1.5">
            <span>Receipts this month</span><span className="tabular-nums">{nf(value)}</span>
          </div>
          {receipts.map((r, i) => (
            <div key={i} className="flex justify-between items-center gap-2 text-[11px] py-0.5">
              <span className="text-slate-300 flex items-center gap-1.5 min-w-0">
                {r.po
                  ? <span className="font-mono text-[10px] bg-[#1e3a5f] text-blue-200 px-1.5 py-0.5 rounded whitespace-nowrap">{r.po}</span>
                  : <span className="text-[9px] uppercase tracking-wide bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">sheet</span>}
                {r.date && <span className="text-slate-400">{fmtDate(r.date)}</span>}
                {r.batch && <span className="text-slate-500 truncate">· {r.batch}</span>}
              </span>
              <span className="text-white tabular-nums flex-shrink-0">{nf(r.units)}</span>
            </div>
          ))}
        </div>
      )}
    </td>
  )
}
