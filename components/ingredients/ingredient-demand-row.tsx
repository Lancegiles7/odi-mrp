'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateIngredientOpeningStock } from '@/app/(dashboard)/ingredients/demand/actions'
import { demandUnitLabel, monthShortfalls } from '@/lib/ingredient-demand'
import type { IngredientRow as IngredientRowData } from '@/lib/ingredient-demand'

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
  const [saving, setSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const opening = override ?? 0
  const shortByMonth = useMemo(
    () => monthShortfalls(row, opening, months),
    [row, opening, months],
  )

  function commitOpening(raw: string) {
    const trimmed = raw.trim()
    const next: number | null = trimmed === '' ? null : Math.max(0, Number(trimmed))
    if (next !== null && !Number.isFinite(next)) return
    if (next === override) return
    setOverride(next)
    setError(null)
    setSaving(async () => {
      const res = await updateIngredientOpeningStock(row.ingredient.id, next)
      if (!res.ok) setError(res.error ?? 'Save failed')
    })
  }

  const unit = demandUnitLabel(row.ingredient.unit_of_measure)
  const colCount = 3 + months.length + 1  // chevron/name + opening + months + total — rough

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
                {saving && <span className="ml-2 text-[10px] text-gray-400">saving…</span>}
              </div>
              {error && <div className="text-[11px] text-red-600 mt-0.5">{error}</div>}
            </div>
          </div>
        </td>

        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <input
            key={`${row.ingredient.id}-opening-${override ?? 'null'}`}
            type="number"
            min={0}
            step="any"
            defaultValue={override ?? ''}
            onBlur={(e) => commitOpening(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="0"
            title={`Opening stock in ${unit} — leave blank to fall back to on-hand inventory`}
            className={`w-20 text-right text-[11px] rounded px-1.5 py-0.5 tabular-nums ${
              override === null
                ? 'border border-dashed border-gray-300 bg-white text-gray-400 placeholder-gray-300 focus:border-gray-400 focus:text-gray-900'
                : 'border border-gray-300 bg-white text-gray-900 font-medium'
            } focus:bg-amber-50 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 focus:outline-none`}
          />
        </td>

        {months.map((m) => {
          const v = row.demandByMonth.get(m) ?? 0
          const short = shortByMonth.get(m)
          return (
            <td
              key={m}
              className={`px-2 py-2 text-right tabular-nums border-l border-gray-100 ${
                short ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-700'
              }`}
            >
              {v === 0 ? <span className="text-gray-300">0</span> : fmt(v)}
            </td>
          )
        })}

        <td className={`px-3 py-2 text-right tabular-nums font-semibold border-l ${
          shortByMonth.get(months[months.length - 1]) ? 'bg-red-100 text-red-800 border-red-200' : 'bg-gray-50 text-gray-900 border-gray-200'
        }`}>
          {fmt(row.totalDemand)}
        </td>
      </tr>

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
