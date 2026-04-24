'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateProductionCell, updateOpeningStockOverride } from '@/app/(dashboard)/production/actions'
import { calcRollingBalance, monthLabel } from '@/lib/demand'
import { MANUFACTURER_CHIP_COLOURS } from '@/lib/constants'

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
  showManufacturerChip,
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

  function commitOpening(raw: string) {
    const trimmed = raw.trim()
    const nextOverride: number | null = trimmed === ''
      ? null
      : Math.max(0, Math.round(Number(trimmed)))
    if (nextOverride !== null && !Number.isFinite(nextOverride)) return
    if (nextOverride === override) return
    setOverride(nextOverride)
    setOpening(nextOverride ?? 0)
    setError(null)
    setSaving(async () => {
      const res = await updateOpeningStockOverride(productId, nextOverride)
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
        <input
          key={`${productId}-opening-${override ?? 'null'}`}
          type="number"
          min={0}
          defaultValue={override ?? ''}
          onBlur={(e) => commitOpening(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="0"
          title="Opening stock override — leave blank to use inventory on hand"
          className={`w-20 text-right text-[11px] rounded px-1.5 py-0.5 tabular-nums ${
            override === null
              ? 'border border-dashed border-gray-300 bg-white text-gray-400 placeholder-gray-300 focus:border-gray-400 focus:text-gray-900'
              : 'border border-gray-300 bg-white text-gray-900 font-medium'
          } focus:bg-amber-50 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 focus:outline-none`}
        />
      </td>

      {rows.map((r) => {
        const negCls = r.balance < 0 ? 'bg-red-50' : ''
        const balTxt = r.balance < 0 ? 'text-red-700 font-semibold' : 'text-gray-700'
        return (
          <FragmentCells
            key={r.month}
            month={r.month}
            forecast={r.forecast}
            production={prod[r.month] ?? 0}
            balance={r.balance}
            negCls={negCls}
            balTxt={balTxt}
            onCommit={(raw) => commit(r.month, raw)}
          />
        )
      })}
    </tr>
  )
}

function FragmentCells({
  month, forecast, production, balance, negCls, balTxt, onCommit,
}: {
  month: string
  forecast: number
  production: number
  balance: number
  negCls: string
  balTxt: string
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
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="0"
          title={`Production for ${monthLabel(month)}`}
          className="w-20 text-right text-[11px] border border-gray-300 rounded px-1.5 py-0.5 bg-gray-50 focus:bg-white"
        />
      </td>
      <td className={`px-2 py-2 text-right tabular-nums ${negCls} ${balTxt}`}>
        {balance.toLocaleString()}
      </td>
    </>
  )
}
