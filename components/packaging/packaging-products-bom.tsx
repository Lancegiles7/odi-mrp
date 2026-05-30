'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setPackagingProducts } from '@/app/(dashboard)/packaging/actions'
import { type EntryMode } from '@/lib/packaging-entry'

interface ProductOption {
  id: string
  sku_code: string | null
  name: string
}

interface BomRow {
  product_id: string
  entry_mode: EntryMode
  entry_value: number
  include_in_cost: boolean
  notes: string | null
}

interface Props {
  packagingId: string
  packagingName: string
  loadedCostNzd: number | null  // packaging.total_loaded_cost_nzd — used to show the per-product cost beside each link
  initialRows: BomRow[]
  products: ProductOption[]
}

function resolveQty(mode: EntryMode, value: number): number {
  if (!value || value <= 0) return 0
  return mode === 'per_group' ? 1 / value : value
}

export function PackagingProductsBom({ packagingId, packagingName, loadedCostNzd, initialRows, products }: Props) {
  const unitCost = Number(loadedCostNzd) || 0
  const fmtCost  = (n: number) => `$${n.toFixed(4)}`
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
    setRows((prev) => [...prev, { product_id: '', entry_mode: 'per_pack', entry_value: 1, include_in_cost: true, notes: null }])
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
      const filtered = rows.filter((r) => r.product_id && r.entry_value > 0)
      const res = await setPackagingProducts({
        packaging_id: packagingId,
        rows: filtered.map((r) => ({
          product_id:      r.product_id,
          entry_mode:      r.entry_mode,
          entry_value:     r.entry_value,
          include_in_cost: r.include_in_cost,
          notes:           r.notes,
        })),
      })
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
            Products that consume {packagingName}. Pick the natural direction per row: <span className="font-medium">per product</span> (e.g. flow wrap × 4) or <span className="font-medium">products per packaging</span> (e.g. 5 brownies per SRT).
          </p>
        </div>
      </div>

      {savedAt && <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">Saved.</div>}
      {error   && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <table className="w-full text-xs border border-gray-200 rounded-md overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-3 py-2">Product</th>
            <th className="text-right px-3 py-2 w-[80px]">Qty</th>
            <th className="text-left px-3 py-2 w-[180px]">Mode</th>
            <th className="text-center px-3 py-2 w-[80px]" title="Include this packaging in the product's BOM cost calculation">In&nbsp;cost?</th>
            <th className="px-3 py-2 w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-xs text-gray-400">
                Not on any product&rsquo;s BOM yet. Click &ldquo;Add product&rdquo; to link one.
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const p = productById.get(r.product_id)
            const excluded = !r.include_in_cost
            const qty = resolveQty(r.entry_mode, r.entry_value)
            return (
              <tr key={i} className={`border-t border-gray-100 ${excluded ? 'bg-amber-50/40' : ''}`}>
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
                    value={r.entry_value}
                    onChange={(e) => update(i, { entry_value: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={r.entry_mode}
                    onChange={(e) => update(i, { entry_mode: e.target.value as EntryMode })}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                  >
                    <option value="per_pack">per product</option>
                    <option value="per_group">products per packaging</option>
                  </select>
                  {qty > 0 && (
                    <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                      {r.entry_mode === 'per_group' && <>→ {qty.toFixed(4)} per product</>}
                      {unitCost > 0 && (
                        <>
                          {r.entry_mode === 'per_group' ? ' · ' : '→ '}
                          <span className={excluded ? '' : 'text-gray-600'}>{fmtCost(qty * unitCost)} per pack</span>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={r.include_in_cost}
                    onChange={(e) => update(i, { include_in_cost: e.target.checked })}
                    className="rounded border-gray-300"
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
