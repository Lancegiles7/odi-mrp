'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  updateIngredientOpeningStock,
  getIngredientOpeningStockHistory,
} from '@/app/(dashboard)/ingredients/demand/actions'
import { demandUnitLabel, monthShortfallStates, monthRunningBalances, monthShortAmounts } from '@/lib/ingredient-demand'
import type { IngredientRow as IngredientRowData } from '@/lib/ingredient-demand'
import { OpeningStockHistoryPopover } from '@/components/inventory/opening-stock-popover'
import { CellCommentPopover } from '@/components/inventory/cell-comment-popover'

interface Props {
  row: IngredientRowData
  months: string[]
  /** Set of "ingredientId|yyyy-mm-01" keys that already have at least one comment. */
  commentedCells: Set<string>
  /** Bulk-fetched opening-stock summary: drives the clock-button render. */
  openingHistory?: { hasHistory: boolean; hasComment: boolean }
}

function fmt(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 100) return Math.round(n).toLocaleString()
  if (abs >= 10)  return n.toFixed(1)
  return n.toFixed(2)
}

export function IngredientDemandRow({ row, months, commentedCells, openingHistory }: Props) {
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<number | null>(row.ingredient.opening_stock_override)
  const [error, setError] = useState<string | null>(null)

  const opening = override ?? 0
  const stateByMonth   = useMemo(() => monthShortfallStates(row, opening, months), [row, opening, months])
  const balanceByMonth = useMemo(() => monthRunningBalances(row, opening, months), [row, opening, months])
  const shortByMonth   = useMemo(() => monthShortAmounts(row, opening, months),    [row, opening, months])
  const totalShortfall = useMemo(() => months.reduce((s, m) => s + (shortByMonth.get(m) ?? 0), 0), [shortByMonth, months])

  const ingredientId = row.ingredient.id
  const ingredientName = row.ingredient.name
  const onSave        = useCallback((v: number | null, note: string) => updateIngredientOpeningStock(ingredientId, v, note), [ingredientId])
  const onLoadHistory = useCallback(() => getIngredientOpeningStockHistory(ingredientId), [ingredientId])
  function handleSaved(next: number | null) {
    setOverride(next)
    setError(null)
  }

  const unit = demandUnitLabel(row.ingredient.unit_of_measure)
  const lastMonthState = stateByMonth.get(months[months.length - 1]) ?? 'ok'

  return (
    <>
      <tr
        className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[10px] w-3">{open ? '▼' : '▶'}</span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-gray-500 truncate">{row.ingredient.sku_code}</div>
              <div className="font-medium text-sm truncate">
                <Link
                  href={`/ingredients/${row.ingredient.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline"
                >
                  {row.ingredient.name}
                </Link>
                <span className="ml-2 text-[10px] text-gray-400">({unit})</span>
              </div>
              {error && <div className="text-[11px] text-red-600 mt-0.5">{error}</div>}
            </div>
          </div>
        </td>

        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <OpeningStockHistoryPopover
            entityLabel={`Opening stock · ${ingredientName}`}
            description={`Manual override in ${unit} — leave blank to fall back to on-hand inventory.`}
            currentValue={override}
            unitLabel={unit}
            onSave={onSave}
            onLoadHistory={onLoadHistory}
            onSaved={handleSaved}
            hasHistory={openingHistory?.hasHistory}
            hasComment={openingHistory?.hasComment}
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
          const cellHasComment = commentedCells.has(`${ingredientId}|${m.slice(0, 10)}`)

          // Cell background:
          //  red    = shortfall — short even after counting placed POs
          //  amber  = covered, but only because a placed (not-yet-received) PO
          //           makes up the difference — real on-hand stock alone wouldn't.
          //           Flips amber → green once the PO is received (lifts opening).
          //  green  = demand fully covered by real on-hand stock alone, no PO.
          //  blank  = no demand this month
          const cellBg =
            state === 'red'   ? 'bg-red-50'
            : state === 'amber' ? 'bg-amber-50'
            : v > 0           ? 'bg-emerald-50'
                                : ''
          const numCls =
            state === 'red'   ? 'text-red-700 font-semibold'
            : state === 'amber' ? 'text-amber-900 font-semibold'
            : v > 0           ? 'text-emerald-800 font-semibold'
                                : 'text-gray-700'
          let sub: { text: string; cls: string; title?: string } | null = null
          if (v > 0) {
            if (state === 'red') {
              sub = { text: `${fmt(short)} short`, cls: 'text-red-600' }
            } else if (state === 'amber') {
              // A PO landing this month shows its inbound qty; a month living off
              // a PO that arrived earlier just notes that it's PO-covered.
              sub = arriving > 0
                ? { text: `+${fmt(arriving)} PO`, cls: 'text-amber-700', title: poTitle }
                : { text: 'covered by PO', cls: 'text-amber-700' }
            } else if (bal > v) {
              sub = { text: `+${Math.round((bal / v) * 100)}%`, cls: 'text-emerald-700' }
            }
          }

          return (
            <td
              key={m}
              className={`relative px-2 text-right tabular-nums border-l border-gray-100 ${cellBg}`}
              style={{ height: 36 }}
            >
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
                    entityType="ingredient"
                    entityId={ingredientId}
                    yearMonth={m}
                    entityName={ingredientName}
                    state={state}
                    hasComment={cellHasComment}
                    status={state === 'red'
                      ? `Demand ${fmt(v)} ${unit} — short ${arriving > 0 ? `even with +${fmt(arriving)} PO` : '(no PO arriving)'}.`
                      : arriving > 0
                        ? `Demand ${fmt(v)} ${unit} — covered by +${fmt(arriving)} PO arriving this month (not yet received).`
                        : `Demand ${fmt(v)} ${unit} — covered by a placed PO (not yet received).`}
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
                  <Link href={`/products/${p.id}`} className="text-gray-700 hover:underline truncate">
                    {p.name}
                  </Link>
                  <span className="text-gray-400 text-[10px] flex-shrink-0">· {p.gramsPerUnit} g/unit</span>
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
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600 border-l border-blue-100/60">
                {fmt(p.totalDemand)}
              </td>
              <td className="px-3 py-1.5 border-l border-blue-100/60" />
            </tr>
          ))}
        </>
      )}
    </>
  )
}
