'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  updatePackagingOpeningStock,
  getPackagingOpeningStockHistory,
} from '@/app/(dashboard)/packaging/demand/actions'
import { monthShortfallStates, monthRunningBalances, monthShortAmounts, type PackagingRow } from '@/lib/packaging-demand'
import { OpeningStockHistoryPopover } from '@/components/inventory/opening-stock-popover'
import { CellCommentPopover } from '@/components/inventory/cell-comment-popover'

interface Props {
  row: PackagingRow
  months: string[]
  commentedCells: Set<string>
}

function fmt(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 100) return Math.round(n).toLocaleString()
  if (abs >= 10)  return n.toFixed(1)
  return n.toFixed(2)
}

export function PackagingDemandRow({ row, months, commentedCells }: Props) {
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<number | null>(row.packaging.opening_stock_override)
  const [error, setError] = useState<string | null>(null)

  const opening = override ?? 0
  const stateByMonth   = useMemo(() => monthShortfallStates(row, opening, months), [row, opening, months])
  const balanceByMonth = useMemo(() => monthRunningBalances(row, opening, months), [row, opening, months])
  const shortByMonth   = useMemo(() => monthShortAmounts(row, opening, months),    [row, opening, months])
  const totalShortfall = useMemo(() => months.reduce((s, m) => s + (shortByMonth.get(m) ?? 0), 0), [shortByMonth, months])
  const lastMonthState = stateByMonth.get(months[months.length - 1]) ?? 'ok'

  const packagingId   = row.packaging.id
  const packagingName = row.packaging.name
  const unit          = row.packaging.unit_of_measure
  const onSave        = useCallback((v: number | null, note: string) => updatePackagingOpeningStock(packagingId, v, note), [packagingId])
  const onLoadHistory = useCallback(() => getPackagingOpeningStockHistory(packagingId), [packagingId])
  function handleSaved(next: number | null) {
    setOverride(next)
    setError(null)
  }

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[10px] w-3">{open ? '▼' : '▶'}</span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-gray-500 truncate">{row.packaging.sku_code}</div>
              <div className="font-medium text-sm truncate">
                <Link href={`/packaging/${row.packaging.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                  {row.packaging.name}
                </Link>
                <span className="ml-2 text-[10px] text-gray-400">({row.packaging.unit_of_measure})</span>
              </div>
              {error && <div className="text-[11px] text-red-600 mt-0.5">{error}</div>}
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <OpeningStockHistoryPopover
            entityLabel={`Opening stock · ${packagingName}`}
            description={`Manual override in ${unit} — leave blank to fall back to on-hand inventory.`}
            currentValue={override}
            unitLabel={unit}
            onSave={onSave}
            onLoadHistory={onLoadHistory}
            onSaved={handleSaved}
          />
        </td>
        {months.map((m) => {
          const v        = row.demandByMonth.get(m) ?? 0
          const state    = stateByMonth.get(m) ?? 'ok'
          const arriving = row.arrivingByMonth.get(m) ?? 0
          const pos      = row.arrivingPosByMonth.get(m) ?? []
          const bal      = balanceByMonth.get(m) ?? 0
          const short    = shortByMonth.get(m) ?? 0
          const poTitle  = pos.length ? pos.map((p) => `${p.po_number}: +${fmt(p.qty)}`).join('\n') : ''
          const cellHasComment = commentedCells.has(`${packagingId}|${m.slice(0, 10)}`)

          const cellBg =
            state === 'red'   ? 'bg-red-50'
            : state === 'amber' ? 'bg-amber-50'
                                : ''
          const numCls =
            state === 'red'   ? 'text-red-700 font-semibold'
            : state === 'amber' ? 'text-amber-900 font-semibold'
                                : 'text-gray-700'
          // One compact sub-line per cell: short qty (red), PO arriving
          // (amber — that's what makes it amber), or "+N%" when surplus.
          let sub: { text: string; cls: string; title?: string } | null = null
          if (v > 0) {
            if (state === 'red') {
              sub = { text: `${fmt(short)} short`, cls: 'text-red-600' }
            } else if (state === 'amber') {
              sub = { text: `+${fmt(arriving)} PO`, cls: 'text-amber-700', title: poTitle }
            } else if (bal > v) {
              sub = { text: `+${Math.round((bal / v) * 100)}%`, cls: 'text-emerald-600' }
            }
          }

          return (
            <td key={m} className={`relative px-2 text-right tabular-nums border-l border-gray-100 ${cellBg}`} style={{ height: 36 }}>
              {v === 0 ? (
                <span className="text-gray-300">0</span>
              ) : (
                <>
                  <div className={`text-xs leading-tight ${numCls}`}>{fmt(v)}</div>
                  {sub && (
                    <div title={sub.title} className={`text-[10px] font-normal leading-tight ${sub.cls}`}>
                      {sub.text}
                    </div>
                  )}
                </>
              )}
              {(state === 'red' || state === 'amber') && (
                <span onClick={(e) => e.stopPropagation()}>
                  <CellCommentPopover
                    entityType="packaging"
                    entityId={packagingId}
                    yearMonth={m}
                    entityName={packagingName}
                    state={state}
                    hasComment={cellHasComment}
                    status={state === 'red'
                      ? `Demand ${fmt(v)} ${unit} — short ${arriving > 0 ? `even with +${fmt(arriving)} PO` : '(no PO arriving)'}.`
                      : `Demand ${fmt(v)} ${unit} — covered by +${fmt(arriving)} PO this month.`}
                  />
                </span>
              )}
            </td>
          )
        })}
        <td className={`px-2 text-right text-xs tabular-nums border-l border-gray-200 ${
          lastMonthState === 'red' ? 'text-red-700 font-medium bg-red-50/40' : 'text-gray-600 bg-gray-50'
        }`}>
          {fmt(row.totalDemand)}
        </td>
        <td className={`px-2 text-right text-xs tabular-nums border-l border-gray-200 ${
          totalShortfall > 0 ? 'text-red-700 font-semibold' : 'text-gray-300'
        }`}>
          {totalShortfall > 0 ? fmt(totalShortfall) : '—'}
        </td>
      </tr>

      {open && row.products.length > 0 && (
        <>
          <tr className="bg-blue-50/30 border-t border-blue-100">
            <td className="px-4 pl-10 py-1.5 text-[10px] uppercase tracking-wider text-blue-700 font-semibold" colSpan={4 + months.length}>
              Driven by {row.products.length} product{row.products.length === 1 ? '' : 's'}
            </td>
          </tr>
          {row.products.map((p) => (
            <tr key={p.id} className="bg-blue-50/30 hover:bg-blue-50/50 text-[11px]">
              <td className="px-4 pl-12 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-400">└</span>
                  <Link href={`/products/${p.id}`} className="text-gray-700 hover:underline truncate">{p.name}</Link>
                  <span className="text-gray-400 text-[10px] flex-shrink-0">· {p.quantityPerUnit}/unit</span>
                </div>
              </td>
              <td className="px-3 py-1.5 text-right text-gray-400 tabular-nums">—</td>
              {months.map((m) => {
                const v = p.demandByMonth.get(m) ?? 0
                return (
                  <td key={m} className="px-2 py-1.5 text-right tabular-nums text-gray-600 border-l border-blue-100/60">
                    {v === 0 ? <span className="text-gray-300">—</span> : fmt(v)}
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600 border-l border-blue-100/60">{fmt(p.totalDemand)}</td>
              <td className="px-3 py-1.5 border-l border-blue-100/60" />
            </tr>
          ))}
        </>
      )}
    </>
  )
}
