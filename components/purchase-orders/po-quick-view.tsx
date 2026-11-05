'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

export interface QuickViewLine {
  name: string
  qty: number
  uom?: string | null
  unitCost?: number | null
}

interface Props {
  poNumber: string
  subtitle?: string | null
  /** Transfers only: a short "arrives …" / pick-up line. */
  legs?: string | null
  lines: QuickViewLine[]
  totalUnits: number
  totalCost: number
  /** Supplier name, or "From → To" for a transfer. */
  footerLeft?: string | null
  href: string
  isTransfer: boolean
}

const POP_WIDTH = 320

// A tiny eye button beside the PO number that pops up the line items. All data
// is already on the list page, so opening is instant — no fetch. The panel is
// rendered in a portal with fixed positioning so the table's overflow-hidden
// (rounded corners) can't clip it.
export function POQuickView({
  poNumber, subtitle, legs, lines, totalUnits, totalCost, footerLeft, href, isTransfer,
}: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(r.left, window.innerWidth - POP_WIDTH - 12)
    setCoords({ top: r.bottom + 6, left: Math.max(12, left) })
  }, [])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const nf = (n: number) => n.toLocaleString()

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        title="Quick view contents"
        aria-label="Quick view contents"
        className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[13px] w-[13px]">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && coords != null && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: POP_WIDTH }}
          className="z-50 rounded-lg border border-gray-200 bg-white font-sans shadow-xl"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
            <span className="text-xs font-bold text-gray-900">{poNumber}</span>
            {subtitle && <span className="text-[10.5px] text-gray-500">{subtitle}</span>}
          </div>

          {legs && <div className="px-3 pb-0.5 pt-1.5 text-[10px] text-gray-500">{legs}</div>}

          <div className="max-h-[230px] overflow-auto">
            {lines.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400">No line items.</div>
            ) : (
              lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-2.5 border-t border-gray-50 px-3 py-1.5 text-xs first:border-t-0">
                  <span className="truncate text-gray-700">{l.name}</span>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900">
                    {nf(l.qty)}{l.uom ? ` ${l.uom}` : ''}
                    {l.unitCost != null && l.unitCost > 0 && (
                      <span className="font-normal text-gray-400"> × ${l.unitCost}</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-between border-t border-gray-100 bg-gray-50 px-3 py-2 text-[11.5px]">
            <span className="text-gray-500">{nf(totalUnits)} units · {lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
            {totalCost > 0 && (
              <span className="font-bold text-gray-900">
                ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 rounded-b-lg border-t border-gray-100 px-3 py-2 text-[11.5px]">
            {footerLeft ? <span className="truncate text-gray-500">{footerLeft}</span> : <span />}
            <Link href={href} className="whitespace-nowrap font-semibold text-emerald-700 hover:underline">
              Open full {isTransfer ? 'transfer' : 'PO'} →
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
