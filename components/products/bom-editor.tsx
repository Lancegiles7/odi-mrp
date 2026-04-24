'use client'

import { useState, useTransition } from 'react'
import type { BomItemWithIngredient, Ingredient } from '@/lib/types/database.types'
import { calcBomLineValues } from '@/lib/costing'
import { saveBomItems } from '@/app/(dashboard)/products/actions'
import { formatCurrency } from '@/lib/utils'

interface EditorRow {
  key: string
  ingredient_id: string
  ingredient_name: string
  ingredient_sku: string
  quantity_g: number | ''
  price_override: number | '' | null
  notes: string
  sort_order: number
  is_organic: boolean
  total_loaded_cost: number | null
}

interface BomEditorProps {
  bomId: string
  initialItems: BomItemWithIngredient[]
  ingredients: Pick<Ingredient, 'id' | 'name' | 'sku_code' | 'unit_of_measure' | 'total_loaded_cost' | 'is_organic'>[]
  sizeG: number
  servingSize: number
}

let keyCounter = 0
function nextKey() { return `row-${++keyCounter}` }

function makeRow(item?: BomItemWithIngredient, idx?: number): EditorRow {
  if (item) {
    return {
      key: nextKey(),
      ingredient_id: item.ingredient_id,
      ingredient_name: item.ingredients.name,
      ingredient_sku: item.ingredients.sku_code,
      quantity_g: item.quantity_g,
      price_override: item.price_override ?? '',
      notes: item.notes ?? '',
      sort_order: item.sort_order,
      is_organic: item.ingredients.is_organic,
      total_loaded_cost: item.ingredients.total_loaded_cost,
    }
  }
  return {
    key: nextKey(),
    ingredient_id: '',
    ingredient_name: '',
    ingredient_sku: '',
    quantity_g: '',
    price_override: '',
    notes: '',
    sort_order: idx ?? 0,
    is_organic: true,
    total_loaded_cost: null,
  }
}

function calcRow(row: EditorRow, sizeG: number, servingSize: number) {
  if (!row.ingredient_id || row.quantity_g === '') return null
  const pricePerKg = (row.price_override !== '' && row.price_override !== null)
    ? Number(row.price_override)
    : (row.total_loaded_cost ?? 0)
  const qty = Number(row.quantity_g)
  return calcBomLineValues(
    {
      ingredient_id: row.ingredient_id,
      quantity_g: qty,
      price_override: (row.price_override !== '' && row.price_override !== null) ? Number(row.price_override) : null,
      ingredients: {
        id: row.ingredient_id,
        name: row.ingredient_name,
        sku_code: row.ingredient_sku,
        unit_of_measure: 'g',
        total_loaded_cost: row.total_loaded_cost,
        is_organic: row.is_organic,
      },
    } as BomItemWithIngredient,
    sizeG,
    servingSize,
  )
}

export function BomEditor({ bomId, initialItems, ingredients, sizeG, servingSize }: BomEditorProps) {
  const [rows, setRows] = useState<EditorRow[]>(() => {
    const initial = initialItems.map((item) => makeRow(item))
    return initial.length > 0 ? initial : [makeRow(undefined, 0)]
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]))

  function updateRow(key: string, changes: Partial<EditorRow>) {
    setSaved(false)
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, ...changes } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow(undefined, prev.length)])
    setSaved(false)
  }

  function removeRow(key: string) {
    setRows((prev) => prev.length > 1 ? prev.filter((r) => r.key !== key) : prev)
    setSaved(false)
  }

  function handleIngredientSelect(key: string, ingredientId: string) {
    const ing = ingredientMap.get(ingredientId)
    if (!ing) {
      updateRow(key, { ingredient_id: '', ingredient_name: '', ingredient_sku: '', is_organic: true, total_loaded_cost: null })
      return
    }
    updateRow(key, {
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      ingredient_sku: ing.sku_code,
      is_organic: ing.is_organic,
      total_loaded_cost: ing.total_loaded_cost,
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const items = rows
        .filter((r) => r.ingredient_id && r.quantity_g !== '' && Number(r.quantity_g) > 0)
        .map((r, i) => ({
          ingredient_id: r.ingredient_id,
          quantity_g: Number(r.quantity_g),
          price_override: (r.price_override !== '' && r.price_override !== null) ? Number(r.price_override) : null,
          notes: r.notes || null,
          sort_order: i,
        }))

      const result = await saveBomItems(bomId, items)
      if (result.success) {
        setSaved(true)
      } else {
        setError(result.error ?? 'Failed to save')
      }
    })
  }

  const totalIngredientCost = rows.reduce((sum, row) => {
    const calc = calcRow(row, sizeG, servingSize)
    return sum + (calc?.price_per_unit ?? 0)
  }, 0)

  const totalQtyG = rows.reduce((sum, row) => {
    return sum + (row.quantity_g === '' ? 0 : Number(row.quantity_g))
  }, 0)

  const totalPct = sizeG > 0 ? totalQtyG / sizeG : 0

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs">
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[260px]">Ingredient</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Qty (g)</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">%</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">$/kg</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Override</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">$/unit</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const calc = calcRow(row, sizeG, servingSize)
              return (
                <tr key={row.key} className="group">
                  {/* Ingredient select */}
                  <td className="px-2 py-1.5">
                    <select
                      value={row.ingredient_id}
                      onChange={(e) => handleIngredientSelect(row.key, e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
                    >
                      <option value="">— select ingredient —</option>
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name}{!ing.is_organic ? ' (Non-Organic)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Qty (g) */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.quantity_g}
                      onChange={(e) => updateRow(row.key, { quantity_g: e.target.value === '' ? '' : Number(e.target.value) })}
                      placeholder="0"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </td>

                  {/* % of pack */}
                  <td className="px-3 py-1.5 text-right text-gray-600 tabular-nums">
                    {calc ? `${(calc.percentage * 100).toFixed(1)}%` : <span className="text-gray-300">—</span>}
                  </td>

                  {/* $/kg from ingredient */}
                  <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                    {row.total_loaded_cost != null
                      ? formatCurrency(row.total_loaded_cost)
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Price override */}
                  <td className="px-2 py-1.5">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.price_override ?? ''}
                        onChange={(e) => updateRow(row.key, { price_override: e.target.value === '' ? '' : Number(e.target.value) })}
                        placeholder="—"
                        className="w-full pl-5 pr-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </div>
                  </td>

                  {/* $/unit calculated */}
                  <td className="px-3 py-1.5 text-right font-medium text-gray-900 tabular-nums">
                    {calc ? formatCurrency(calc.price_per_unit) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Notes */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                      placeholder="Optional note"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </td>

                  {/* Remove */}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-3 py-2 text-xs text-gray-500 font-medium text-right">
                Totals
              </td>
              <td className="px-3 py-2 text-right font-semibold text-gray-900 tabular-nums text-sm">
                {totalQtyG > 0 ? totalQtyG.toFixed(2) : '—'}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-gray-900 tabular-nums text-sm">
                {sizeG > 0 ? `${(totalPct * 100).toFixed(1)}%` : '—'}
              </td>
              <td colSpan={2} />
              <td className="px-3 py-2 text-right font-semibold text-gray-900 tabular-nums text-sm">
                {formatCurrency(Math.round(totalIngredientCost * 100) / 100)}
              </td>
              <td colSpan={2} />
            </tr>
            {sizeG > 0 && Math.abs(totalQtyG - sizeG) > 0.01 && (
              <tr>
                <td colSpan={8} className="px-3 py-1 text-[11px] text-amber-700 bg-amber-50">
                  Total weight {totalQtyG.toFixed(2)} g doesn&apos;t match product size {sizeG} g
                  {totalQtyG < sizeG ? ` (${(sizeG - totalQtyG).toFixed(2)} g under)` : ` (${(totalQtyG - sizeG).toFixed(2)} g over)`}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={addRow}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          + Add ingredient
        </button>

        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium">Saved</span>
          )}
          {error && (
            <span className="text-sm text-red-600">{error}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save BOM'}
          </button>
        </div>
      </div>
    </div>
  )
}
