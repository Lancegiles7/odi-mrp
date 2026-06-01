'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  updateProductionCell,
  updateOpeningStockOverride,
  getOpeningStockHistory,
} from '@/app/(dashboard)/production/actions'
import { calcRollingBalance, monthLabel, type ShortfallState } from '@/lib/demand'
import { MANUFACTURER_CHIP_COLOURS } from '@/lib/constants'
import { OpeningStockHistoryPopover } from '@/components/inventory/opening-stock-popover'
import { CellCommentPopover } from '@/components/inventory/cell-comment-popover'

interface Props {
  productId: string
  skuCode: string
  productName: string
  manufacturer: string | null
  isActive: boolean
  openingStock: number
  openingStockOverride: number | null
  months: string[]
  forecastByMonth: Record<string, number>
  productionByMonth: Record<string, number>
  commentedCells: Set<string>      // "productId|yyyy-mm-01" keys
  showManufacturerChip?: boolean   // true on the flat "view all" table
}

/**
 * One product row for the Production schedule. Renders:
 *   - sticky-left product cell
 *   - opening stock
 *   - per-month Forecast / editable Production / Balance
 * The Balance is computed live from edits; negative balances highlight red.
 */
export function ProductionRow({
  productId, skuCode, productName, manufacturer, isActive,
  openingStock, openingStockOverride, months, forecastByMonth, productionByMonth,
  commentedCells, showManufacturerChip,
}: Props) {
  const [prod, setProd] = useState<Record<string, number>>(productionByMonth)
  const [opening, setOpening] = useState<number>(openingStock)
  const [override, setOverride] = useState<number | null>(openingStockOverride)
  const [saving, setSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(
    () => calcRollingBalance(
      months,
      opening,
      (m) => forecastByMonth[m] ?? 0,
      (m) => prod[m] ?? 0,
    ),
    [months, opening, forecastByMonth, prod],
  )

  function commit(month: string, raw: string) {
    const units = raw.trim() === '' ? 0 : Math.max(0, Math.round(Number(raw)))
    if (!Number.isFinite(units)) return
    setProd((p) => ({ ...p, [month]: units }))
    setError(null)
    setSaving(async () => {
      const res = await updateProductionCell(productId, month, units)
      if (!res.ok) setError(res.error ?? 'Save failed')
    })
  }

  function handleOpeningSaved(next: number | null) {
    setOverride(next)
    setOpening(next ?? 0)
    setError(null)
  }

  const manufacturerChip = manufacturer
    ? (MANUFACTURER_CHIP_COLOURS[manufacturer] ?? 'bg-gray-100 text-gray-700')
    : null

  return (
    <tr className="hover:bg-gray-50/50 border-t border-gray-100">
      <td className="px-4 py-2 sticky left-0 bg-white z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.04)] w-[320px] min-w-[320px] max-w-[320px]">
        <div className="font-mono text-[11px] text-gray-500 truncate" title={skuCode}>{skuCode}</div>
        <div className="font-medium text-sm leading-snug line-clamp-2" title={productName}>
          <Link href={`/products/${productId}`} className="hover:underline">{productName}</Link>
          {!isActive && <span className="ml-2 text-[10px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>}
          {saving && <span className="ml-2 text-[10px] text-gray-400">saving…</span>}
        </div>
        {error && <div className="text-[11px] text-red-600 mt-0.5">{error}</div>}
      </td>

      {showManufacturerChip && (
        <td className="px-3 py-2">
          {manufacturer
            ? <span className={`px-1.5 py-0.5 rounded text-[10px] ${manufacturerChip}`}>{manufacturer}</span>
            : <span className="text-gray-400 text-[10px]">Not set</span>}
        </td>
      )}

      <td className="px-3 py-2 text-right">
        <OpeningStockHistoryPopover
          entityLabel={`Opening stock · ${productName}`}
          description="Manual override · leave blank to fall back to inventory on hand."
          currentValue={override}
          onSave={useCallback((v, note) => updateOpeningStockOverride(productId, v, note), [productId])}
          onLoadHistory={useCallback(() => getOpeningStockHistory(productId), [productId])}
          onSaved={handleOpeningSaved}
        />
      </td>

      {rows.map((r) => {
        const negCls =
          r.state === 'red'   ? 'bg-red-50'
          : r.state === 'amber' ? 'bg-amber-50'
                                : ''
        const balTxt =
          r.state === 'red'   ? 'text-red-700 font-semibold'
          : r.state === 'amber' ? 'text-amber-900 font-medium'
                                : 'text-gray-700'
        return (
          <FragmentCells
            key={r.month}
            productId={productId}
            productName={productName}
            month={r.month}
            forecast={r.forecast}
            production={prod[r.month] ?? 0}
            balance={r.balance}
            state={r.state}
            negCls={negCls}
            balTxt={balTxt}
            hasComment={commentedCells.has(`${productId}|${r.month.slice(0, 10)}`)}
            onCommit={(raw) => commit(r.month, raw)}
          />
        )
      })}
    </tr>
  )
}

function FragmentCells({
  productId, productName, month, forecast, production, balance, state, negCls, balTxt, hasComment, onCommit,
}: {
  productId: string
  productName: string
  month: string
  forecast: number
  production: number
  balance: number
  state: ShortfallState
  negCls: string
  balTxt: string
  hasComment: boolean
  onCommit: (raw: string) => void
}) {
  return (
    <>
      <td className={`px-2 py-2 text-right text-gray-600 border-l border-gray-200 tabular-nums ${negCls}`}>
        {forecast ? forecast.toLocaleString() : <span className="text-gray-300">0</span>}
      </td>
      <td className={`px-1 py-2 text-right tabular-nums ${negCls}`}>
        <input
          type="number"
          min={0}
          defaultValue={production || ''}
          data-prod-month={month}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const input = e.target as HTMLInputElement
            input.blur()                           // triggers save via onBlur
            // Jump to the same-month Prod input on the next row
            const all = Array.from(document.querySelectorAll<HTMLInputElement>(
              `input[data-prod-month="${month}"]`,
            ))
            const idx = all.indexOf(input)
            const next = idx >= 0 ? all[idx + 1] : null
            if (next) {
              next.focus()
              next.select()
            }
          }}
          placeholder="0"
          title={`Production for ${monthLabel(month)} — Enter to save and move down`}
          className="w-20 text-right text-[11px] border border-gray-300 rounded px-1.5 py-0.5 bg-gray-50 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-200 focus:outline-none"
        />
      </td>
      <td className={`relative px-2 py-2 text-right tabular-nums ${negCls} ${balTxt}`}>
        <div>{balance.toLocaleString()}</div>
        {forecast > 0 && (() => {
          const pct = Math.round((balance / forecast) * 100)
          const cls =
            state === 'red'   ? 'text-red-600'
            : state === 'amber' ? 'text-amber-600'
            : pct >= 100      ? 'text-emerald-600'
                              : 'text-amber-600'
          return <div className={`text-[9px] font-normal ${cls}`}>{pct}%</div>
        })()}
        {production > 0 && (state === 'red' || state === 'amber') && (
          <div
            title={`Planned production ${production.toLocaleString()} this month`}
            className={`inline-block mt-0.5 text-[8px] px-1 py-px rounded font-medium ${
              state === 'amber' ? 'bg-amber-200 text-amber-900' : 'bg-red-100 text-red-800'
            }`}
          >
            +{production.toLocaleString()} prod
          </div>
        )}
        {(state === 'red' || state === 'amber') && (
          <CellCommentPopover
            entityType="product"
            entityId={productId}
            yearMonth={month}
            entityName={productName}
            state={state}
            hasComment={hasComment}
            status={state === 'red'
              ? `Balance ${balance.toLocaleString()} — short even with ${production.toLocaleString()} planned production.`
              : `Balance ${balance.toLocaleString()} — covered by ${production.toLocaleString()} planned production this month.`}
          />
        )}
      </td>
    </>
  )
}
