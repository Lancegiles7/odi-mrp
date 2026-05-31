'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  updateIngredientOpeningStock,
  getIngredientOpeningStockHistory,
} from '@/app/(dashboard)/ingredients/demand/actions'
import { demandUnitLabel, monthShortfalls, monthRunningBalances } from '@/lib/ingredient-demand'
import type { IngredientRow as IngredientRowData } from '@/lib/ingredient-demand'
import { OpeningStockHistoryPopover } from '@/components/inventory/opening-stock-popover'

interface Props {
  row: IngredientRowData
  months: string[]
}

function fmt(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 100) return Math.round(n).toLocaleString()
  if (abs >= 10)  return n.toFixed(1)
  return n.toFixed(2)
}

export function IngredientDemandRow({ row, months }: Props) {
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<number | null>(row.ingredient.opening_stock_override)
  const [error, setError] = useState<string | null>(null)

  const opening = override ?? 0
  const shortByMonth   = useMemo(() => monthShortfalls(row, opening, months),   [row, opening, months])
  const balanceByMonth = useMemo(() => monthRunningBalances(row, opening, months), [row, opening, months])

  const ingredientId = row.ingredient.id
  const ingredientName = row.ingredient.name
  const onSave        = useCallback((v: number | null, note: string) => updateIngredientOpeningStock(ingredientId, v, note), [ingredientId])
  const onLoadHistory = useCallback(() => getIngredientOpeningStockHistory(ingredientId), [ingredientId])
  function handleSaved(next: number | null) {
    setOverride(next)
    setError(null)
  }

  const unit = demandUnitLabel(row.ingredient.unit_of_measure)
  const hasArrivals = Array.from(row.arrivingByMonth.values()).some((v) => v > 0)

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
          />
        </td>

        {months.map((m) => {
          const v = row.demandByMonth.get(m) ?? 0
          const short = shortByMonth.get(m)
          const bal   = balanceByMonth.get(m) ?? 0
          const pct   = v > 0 ? Math.round((bal / v) * 100) : null
          const pctCls = pct == null
            ? ''
            : pct < 0     ? 'text-red-600'
            : pct >= 100  ? 'text-emerald-600'
                          : 'text-amber-600'
          return (
            <td
              key={m}
              className={`px-2 py-2 text-right tabular-nums border-l border-gray-100 ${
                short ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-700'
              }`}
            >
              <div>{v === 0 ? <span className="text-gray-300">0</span> : fmt(v)}</div>
              {pct != null && <div className={`text-[9px] font-normal ${pctCls}`}>{pct}%</div>}
            </td>
          )
        })}

        <td className={`px-3 py-2 text-right tabular-nums font-semibold border-l ${
          shortByMonth.get(months[months.length - 1]) ? 'bg-red-100 text-red-800 border-red-200' : 'bg-gray-50 text-gray-900 border-gray-200'
        }`}>
          {fmt(row.totalDemand)}
        </td>
      </tr>

      {/* Arrivals lane: always shown when there's at least one open PO arriving */}
      {hasArrivals && (
        <tr className="border-t border-blue-100 bg-blue-50/30 text-[11px]">
          <td className="px-4 py-1.5 pl-12 text-blue-700 font-medium">Arriving (POs)</td>
          <td className="px-3 py-1.5 text-right text-gray-400 tabular-nums">—</td>
          {months.map((m) => {
            const v = row.arrivingByMonth.get(m) ?? 0
            const pos = row.arrivingPosByMonth.get(m) ?? []
            const title = pos.length ? pos.map((p) => `${p.po_number}: +${fmt(p.qty)}`).join('\n') : ''
            return (
              <td
                key={m}
                title={title}
                className={`px-2 py-1.5 text-right tabular-nums border-l border-blue-100/60 ${
                  v > 0 ? 'text-blue-700 font-semibold' : 'text-gray-300'
                }`}
              >
                {v > 0 ? `+${fmt(v)}` : '—'}
              </td>
            )
          })}
          <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 border-l border-blue-100/60">
            {(() => {
              let s = 0
              for (const v of row.arrivingByMonth.values()) s += v
              return s > 0 ? `+${fmt(s)}` : '—'
            })()}
          </td>
        </tr>
      )}

      {open && row.products.length > 0 && (
        <>
          <tr className="bg-blue-50/30 border-t border-blue-100">
            <td className="px-4 pl-10 py-1.5 text-[10px] uppercase tracking-wider text-blue-700 font-semibold" colSpan={3 + months.length}>
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
            </tr>
          ))}
        </>
      )}
    </>
  )
}
