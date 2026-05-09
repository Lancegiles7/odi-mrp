'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setProductPackagingBom } from '@/app/(dashboard)/packaging/actions'
import { packagingTypeLabel, PACKAGING_TYPE_COLOURS } from '@/lib/constants'

interface PackagingOption {
  id: string
  sku_code: string
  name: string
  type: string
  unit_of_measure: string
  total_loaded_cost_nzd: number | null
}

interface BomRow {
  packaging_id: string
  quantity_per_unit: number
  include_in_cost: boolean
  notes: string | null
}

interface Props {
  productId: string
  productName: string
  initialRows: BomRow[]
  packaging: PackagingOption[]
}

export function ProductPackagingBom({ productId, productName, initialRows, packaging }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<BomRow[]>(initialRows)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const packById = new Map(packaging.map((p) => [p.id, p]))

  function update(idx: number, patch: Partial<BomRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, { packaging_id: '', quantity_per_unit: 1, include_in_cost: true, notes: null }])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function onSave() {
    setError(null)
    start(async () => {
      const filtered = rows.filter((r) => r.packaging_id && r.quantity_per_unit > 0)
      const res = await setProductPackagingBom({ product_id: productId, rows: filtered })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  const totalCost = rows.reduce((s, r) => {
    if (!r.include_in_cost) return s
    const p = packById.get(r.packaging_id)
    if (!p) return s
    return s + (Number(p.total_loaded_cost_nzd) || 0) * (Number(r.quantity_per_unit) || 0)
  }, 0)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Packaging BOM</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Per-unit packaging consumed when {productName} is manufactured. Untick <span className="font-medium">In cost?</span> to link a packaging item for demand only (cost excluded from per-unit BOM).
          </p>
        </div>
        <Link
          href={`/packaging/new?return_to=${encodeURIComponent(`/products/${productId}/edit`)}&product_id=${productId}`}
          className="text-sm px-2.5 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          + New packaging item
        </Link>
      </div>

      {savedAt && <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">Saved.</div>}
      {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <table className="w-full text-xs border border-gray-200 rounded-md overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-3 py-2">Packaging item</th>
            <th className="text-left px-3 py-2 w-[120px]">Type</th>
            <th className="text-right px-3 py-2 w-[140px]">Qty per product unit</th>
            <th className="text-center px-3 py-2 w-[80px]" title="Include this packaging's cost in the product's BOM cost calculation">In&nbsp;cost?</th>
            <th className="text-right px-3 py-2 w-[110px]">Loaded NZD</th>
            <th className="text-right px-3 py-2 w-[120px]">Cost contribution</th>
            <th className="px-3 py-2 w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const p = packById.get(r.packaging_id)
            const cost = (Number(p?.total_loaded_cost_nzd) || 0) * (Number(r.quantity_per_unit) || 0)
            const excluded = !r.include_in_cost
            return (
              <tr key={i} className={`border-t border-gray-100 ${excluded ? 'bg-amber-50/40' : ''}`}>
                <td className="px-3 py-1.5">
                  <select
                    value={r.packaging_id}
                    onChange={(e) => update(i, { packaging_id: e.target.value })}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                  >
                    <option value="">— Pick packaging —</option>
                    {packaging.map((pk) => (
                      <option key={pk.id} value={pk.id}>{pk.name} · {pk.sku_code}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  {p ? <span className={`text-[10px] px-1.5 py-0.5 rounded ${PACKAGING_TYPE_COLOURS[p.type] ?? PACKAGING_TYPE_COLOURS['OTHER']}`}>{packagingTypeLabel(p.type)}</span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number" step="any" min={0}
                    value={r.quantity_per_unit}
                    onChange={(e) => update(i, { quantity_per_unit: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={r.include_in_cost}
                    onChange={(e) => update(i, { include_in_cost: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                  {p?.total_loaded_cost_nzd != null ? `$${Number(p.total_loaded_cost_nzd).toFixed(4)}` : '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                  {excluded ? <span className="text-gray-400 italic">excluded</span> : (cost > 0 ? `$${cost.toFixed(4)}` : '—')}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-600">×</button>
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm">
            <td colSpan={5} className="px-3 py-2 text-right font-medium text-gray-700">Packaging cost per {productName} unit</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">${totalCost.toFixed(4)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
        <button onClick={addRow} className="text-xs text-blue-600 hover:underline">+ Add packaging</button>
        <button
          disabled={pending}
          onClick={onSave}
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save Packaging BOM'}
        </button>
      </div>
    </div>
  )
}
