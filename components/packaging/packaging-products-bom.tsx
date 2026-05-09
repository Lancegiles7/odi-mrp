'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setPackagingProducts } from '@/app/(dashboard)/packaging/actions'

interface ProductOption {
  id: string
  sku_code: string | null
  name: string
}

interface BomRow {
  product_id: string
  quantity_per_unit: number
  notes: string | null
}

interface Props {
  packagingId: string
  packagingName: string
  initialRows: BomRow[]
  products: ProductOption[]
}

export function PackagingProductsBom({ packagingId, packagingName, initialRows, products }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<BomRow[]>(initialRows)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const productById = new Map(products.map((p) => [p.id, p]))

  function update(idx: number, patch: Partial<BomRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, { product_id: '', quantity_per_unit: 1, notes: null }])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function onSave() {
    setError(null)
    const seen = new Set<string>()
    for (const r of rows) {
      if (!r.product_id) continue
      if (seen.has(r.product_id)) {
        setError('Each product can only appear once. Combine the rows.')
        return
      }
      seen.add(r.product_id)
    }
    start(async () => {
      const filtered = rows.filter((r) => r.product_id && r.quantity_per_unit > 0)
      const res = await setPackagingProducts({ packaging_id: packagingId, rows: filtered })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Used in (products)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Products that consume {packagingName}. Set the quantity used per product unit (e.g. flow wrap × 4 for a 4-pack).
          </p>
        </div>
      </div>

      {savedAt && <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">Saved.</div>}
      {error   && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <table className="w-full text-xs border border-gray-200 rounded-md overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-3 py-2">Product</th>
            <th className="text-right px-3 py-2 w-[160px]">Qty per product unit</th>
            <th className="px-3 py-2 w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-xs text-gray-400">
                Not on any product&rsquo;s BOM yet. Click &ldquo;Add product&rdquo; to link one.
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const p = productById.get(r.product_id)
            return (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <select
                    value={r.product_id}
                    onChange={(e) => update(i, { product_id: e.target.value })}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                  >
                    <option value="">— Pick product —</option>
                    {products.map((pp) => (
                      <option key={pp.id} value={pp.id}>
                        {pp.name}{pp.sku_code ? ` · ${pp.sku_code}` : ''}
                      </option>
                    ))}
                  </select>
                  {p && (
                    <Link href={`/products/${p.id}`} className="text-[10px] text-blue-600 hover:underline mt-0.5 inline-block">
                      Open product →
                    </Link>
                  )}
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
                  <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-600">×</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
        <button onClick={addRow} className="text-xs text-blue-600 hover:underline">+ Add product</button>
        <button
          disabled={pending}
          onClick={onSave}
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save links'}
        </button>
      </div>
    </div>
  )
}
