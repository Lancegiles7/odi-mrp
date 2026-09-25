'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateProductionCell } from '@/app/(dashboard)/production/actions'
import { calcRollingBalance, monthLabel, type ShortfallState } from '@/lib/demand'
import { MANUFACTURER_CHIP_COLOURS } from '@/lib/constants'
import { CellCommentPopover } from '@/components/inventory/cell-comment-popover'
import { TransferChips } from '@/components/stock-movements/transfer-chips'
import type { TransferDetail } from '@/lib/transfer-stock'

interface Props {
  productId: string
  skuCode: string
  productName: string
  manufacturer: string | null
  isActive: boolean
  openingStock: number
  /** Label of the closed month the opening came from (Stock Movements EOM). */
  openingSource?: string | null
  months: string[]
  forecastByMonth: Record<string, number>
  productionByMonth: Record<string, number>
  /** NZ ↔ AU transfer orders per month (signed: + in / − out). Read-only —
   *  raised in Purchase Orders. Counted in the balance, not as production. */
  transfersByMonth?: Record<string, TransferDetail[]>
  commentedCells: Set<string>      // "productId|yyyy-mm-01" keys
  showManufacturerChip?: boolean   // true on the flat "view all" table
  /** Which build this row plans. Production cells write to this market. */
  market?: 'NZ' | 'AU'
  /** Show a small NZ/AU tag (used when a product is dual-made). */
  marketTag?: 'NZ' | 'AU'
  /** Completed months shown in history mode. Display-only: they show what was
   *  forecast/produced, and are left out of the running balance (which still
   *  starts at the current opening stock). */
  lockedMonths?: string[]
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
  openingStock, openingSource, months, forecastByMonth, productionByMonth, transfersByMonth,
  commentedCells, showManufacturerChip,
  market = 'NZ', marketTag, lockedMonths,
}: Props) {
  const locked = useMemo(() => new Set(lockedMonths ?? []), [lockedMonths])
  // The balance chain only ever runs over the live window — a look-back must
  // not shift the balances people plan against.
  const activeMonths = useMemo(() => months.filter((m) => !locked.has(m)), [months, locked])
  const [prod, setProd] = useState<Record<string, number>>(productionByMonth)
  const opening = openingStock
  const [saving, setSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(
    () => calcRollingBalance(
      activeMonths,
      opening,
      (m) => forecastByMonth[m] ?? 0,
      (m) => prod[m] ?? 0,
      (m) => (transfersByMonth?.[m] ?? []).reduce((s, t) => s + t.units, 0),
    ),
    [activeMonths, opening, forecastByMonth, prod, transfersByMonth],
  )

  function commit(month: string, raw: string) {
    const units = raw.trim() === '' ? 0 : Math.max(0, Math.round(Number(raw)))
    if (!Number.isFinite(units)) return
    setProd((p) => ({ ...p, [month]: units }))
    setError(null)
    setSaving(async () => {
      const res = await updateProductionCell(productId, month, units, market)
      if (!res.ok) setError(res.error ?? 'Save failed')
    })
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
          {marketTag && (
            <span className={`ml-2 text-[10px] px-1 py-0.5 rounded ${marketTag === 'AU' ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>
              {marketTag} build
            </span>
          )}
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
        <span
          className="text-xs text-gray-700 tabular-nums"
          title={openingSource
            ? `Closing stock at end of ${openingSource}, from Stock Movements`
            : 'From Stock Movements'}
        >
          {opening ? opening.toLocaleString() : <span className="text-gray-300">—</span>}
        </span>
      </td>

      {/* Completed months — forecast + what was produced, no balance. */}
      {months.filter((m) => locked.has(m)).map((m) => (
        <ClosedMonthCells
          key={m}
          month={m}
          forecast={forecastByMonth[m] ?? 0}
          production={prod[m] ?? 0}
        />
      ))}

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
            transfers={transfersByMonth?.[r.month] ?? []}
            balance={r.balance}
            state={r.state}
            shortAmount={r.shortAmount}
            negCls={negCls}
            balTxt={balTxt}
            hasComment={commentedCells.has(`${productId}|${r.month.slice(0, 10)}`)}
            onCommit={(raw) => commit(r.month, raw)}
          />
        )
      })}

      {/* Total needed — sum of forecast across the rolling year. Lets the
          user see annual demand at a glance: needed − shortfall = covered. */}
      {(() => {
        const totalNeeded = activeMonths.reduce((s, m) => s + (forecastByMonth[m] ?? 0), 0)
        return (
          <td className="px-2 text-right text-xs tabular-nums text-gray-600 bg-gray-50 border-l border-gray-200">
            {totalNeeded > 0 ? totalNeeded.toLocaleString() : <span className="text-gray-300">—</span>}
          </td>
        )
      })()}

      {/* Total shortfall — units of forecast we can't ship across the year
          (= sum of marginal monthly shortAmounts, which is the same as the
           end-of-year ending deficit when production is non-decreasing). */}
      {(() => {
        const total = rows.reduce((s, r) => s + r.shortAmount, 0)
        return (
          <td className={`px-2 text-right text-xs tabular-nums border-l border-gray-200 ${
            total > 0 ? 'text-red-700 font-semibold' : 'text-gray-300'
          }`}>
            {total > 0 ? total.toLocaleString() : '—'}
          </td>
        )
      })()}
    </tr>
  )
}

/** One completed month: read-only forecast + production, no balance. */
function ClosedMonthCells({
  month, forecast, production,
}: {
  month: string
  forecast: number
  production: number
}) {
  const title = `${monthLabel(month)} is a completed month — read-only`
  return (
    <>
      <td className="px-2 text-right text-xs text-gray-500 border-l border-gray-200 tabular-nums bg-gray-50" style={{ height: 36 }} title={title}>
        {forecast ? forecast.toLocaleString() : <span className="text-gray-300">0</span>}
      </td>
      <td className="px-1 text-right text-xs text-gray-500 tabular-nums bg-gray-50" style={{ height: 36 }} title={title}>
        {production ? production.toLocaleString() : <span className="text-gray-300">0</span>}
      </td>
      <td className="px-2 text-right text-xs text-gray-300 tabular-nums bg-gray-50" style={{ height: 36 }} title="Balance is only tracked from the current planning month">
        —
      </td>
    </>
  )
}

function FragmentCells({
  productId, productName, month, forecast, production, transfers, balance, state, shortAmount, negCls, balTxt, hasComment, onCommit,
}: {
  productId: string
  productName: string
  month: string
  forecast: number
  production: number
  transfers: TransferDetail[]
  balance: number
  state: ShortfallState
  shortAmount: number
  negCls: string
  balTxt: string
  hasComment: boolean
  onCommit: (raw: string) => void
}) {
  return (
    <>
      <td className={`px-2 text-right text-xs text-gray-600 border-l border-gray-200 tabular-nums ${negCls}`} style={{ height: 36 }}>
        {forecast ? forecast.toLocaleString() : <span className="text-gray-300">0</span>}
      </td>
      <td className={`px-1 text-right tabular-nums ${negCls}`} style={{ height: 36 }}>
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
          className="w-16 text-right text-[11px] border border-gray-300 rounded px-1 py-0.5 bg-gray-50 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-200 focus:outline-none"
        />
        {transfers.length > 0 && <div className="leading-none"><TransferChips items={transfers} /></div>}
      </td>
      <td className={`relative px-2 text-right tabular-nums ${negCls} ${balTxt}`} style={{ height: 36 }}>
        <div className="text-xs leading-tight">{balance.toLocaleString()}</div>
        {forecast > 0 && (() => {
          // One compact sub-line: short qty (red), nothing for amber
          // (the editable Prod sub-column already shows what's covering),
          // and "+N%" surplus when the row is healthy and has buffer.
          if (state === 'red' && shortAmount > 0) {
            return <div className="text-[10px] font-normal leading-tight text-red-600">{shortAmount.toLocaleString()} short</div>
          }
          if (state === 'ok') {
            const pct = Math.round((balance / forecast) * 100)
            if (pct >= 100 && balance > forecast) {
              return <div className="text-[10px] font-normal leading-tight text-emerald-600">+{pct}%</div>
            }
          }
          return null
        })()}
        {/* No "+X prod" pill on Production — the Prod sub-column to the left already
            shows the value, so the pill would just duplicate it. Comment + button still
            renders below on red / amber cells. */}
        {(state === 'red' || state === 'amber') && (
          <CellCommentPopover
            entityType="product"
            entityId={productId}
            yearMonth={month}
            entityName={productName}
            state={state}
            hasComment={hasComment}
            status={(() => {
              const net = transfers.reduce((s, t) => s + t.units, 0)
              const tr = net ? ` and ${net > 0 ? '+' : '−'}${Math.abs(net).toLocaleString()} transferred` : ''
              return state === 'red'
                ? `Balance ${balance.toLocaleString()} — short even with ${production.toLocaleString()} planned production${tr}.`
                : `Balance ${balance.toLocaleString()} — covered by ${production.toLocaleString()} planned production${tr} this month.`
            })()}
          />
        )}
      </td>
    </>
  )
}
