'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { batchCreatePackagingForProduct, type BatchCreateRow } from '@/app/(dashboard)/packaging/actions'
import { type EntryMode } from '@/lib/packaging-entry'
import { PACKAGING_TYPES, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'

interface ProductOption  { id: string; sku_code: string | null; name: string }
interface SupplierOption { id: string; name: string }
interface ExistingLink {
  packaging_id: string
  quantity_per_unit: number
  include_in_cost: boolean
  packaging: { sku_code: string; name: string; type: string } | null
}

interface Props {
  products:       ProductOption[]
  suppliers:      SupplierOption[]
  defaultProduct: string | null
}

const blankRow = (): BatchCreateRow => ({
  sku_code: '', name: '', type: 'OTHER', unit_of_measure: 'each',
  supplier_id: null, price: null, currency: 'NZD', freight_per_unit_nzd: null,
  entry_mode: 'per_pack', entry_value: 1,
  include_in_cost: true, current_soh: null, original_order_qty: null,
})

const LINK_ONLY = 'Describes how the packaging attaches to a product — pick a product to set it.'

function resolveQty(mode: EntryMode, value: number): number {
  if (!value || value <= 0) return 0
  return mode === 'per_group' ? 1 / value : value
}

export function BatchCreateForm({ products, suppliers, defaultProduct }: Props) {
  const router = useRouter()
  const [productId, setProductId] = useState<string>(defaultProduct ?? '')
  const [originalDate, setOriginalDate] = useState<string>('')
  const [rows, setRows] = useState<BatchCreateRow[]>([blankRow()])
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)

  function update(idx: number, patch: Partial<BatchCreateRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function addRow()    { setRows((prev) => [...prev, blankRow()]) }
  function removeRow(idx: number) { setRows((prev) => prev.filter((_, i) => i !== idx)) }

  // Fetch already-linked packaging when product changes (informational only)
  async function onProductChange(id: string) {
    setProductId(id)
    setExistingLinks([])
    if (!id) return
    setLinksLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('product_packaging')
        .select('packaging_id, quantity_per_unit, include_in_cost, packaging:packaging_id(sku_code, name, type)')
        .eq('product_id', id) as unknown as { data: ExistingLink[] | null }
      setExistingLinks(data ?? [])
    } catch {} // silent — informational only
    setLinksLoading(false)
  }

  // No product picked = standalone items (ecom dispatch boxes, tape, shippers).
  // Qty / mode / include-in-cost describe the product link, so they don't apply.
  const standalone = !productId

  function onSave() {
    setError(null)
    const validRows = rows.filter((r) => r.sku_code.trim() && r.name.trim() && (standalone || r.entry_value > 0))
    if (validRows.length === 0) {
      setError(standalone ? 'Add at least one row with a SKU and name.' : 'Add at least one row with SKU, name and qty.')
      return
    }

    start(async () => {
      const res = await batchCreatePackagingForProduct({
        product_id:          productId || null,
        original_order_date: originalDate || null,
        rows:                validRows,
      })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      router.push(standalone ? '/packaging' : `/products/${productId}/edit`)
      router.refresh()
    })
  }

  const productLabel = products.find((p) => p.id === productId)?.name ?? 'product'

  return (
    <div className="space-y-5">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>}

      {/* Product picker */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">
          Product this packaging is for <span className="normal-case tracking-normal text-gray-400">(optional)</span>
        </label>
        <select
          value={productId}
          onChange={(e) => onProductChange(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">— No product · standalone item —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.sku_code ? ` · ${p.sku_code}` : ''}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 mt-1">
          Each row below creates one packaging item. Pick a product to link them to it as well — leave it on
          &ldquo;no product&rdquo; for shared items like ecom dispatch boxes, shippers or tape. You can link a
          standalone item to products later from the product edit page.
        </p>
      </div>

      {standalone && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
          <span className="font-semibold">Standalone item.</span> It won&rsquo;t appear in any product&rsquo;s unit
          cost — per-unit cost comes from the product link. It shows in the Packaging list under group
          <span className="font-mono bg-white/60 px-1 rounded mx-1">Unassigned</span>, and on Packaging Demand once it
          has stock on hand (with no forecast demand, since that&rsquo;s also derived from product links).
        </div>
      )}

      {productId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-[11px] uppercase tracking-wider text-blue-800 font-semibold mb-1">Already on {productLabel}&rsquo;s BOM</div>
          {linksLoading ? (
            <p className="text-xs text-blue-800">Loading…</p>
          ) : existingLinks.length === 0 ? (
            <p className="text-xs text-blue-800">Nothing yet. Add rows below.</p>
          ) : (
            <ul className="text-xs text-blue-900 space-y-0.5">
              {existingLinks.map((l) => (
                <li key={l.packaging_id}>
                  · {l.packaging?.name ?? '?'} <span className="font-mono text-blue-700">{l.packaging?.sku_code ?? ''}</span> — qty <span className="tabular-nums">{l.quantity_per_unit}</span>{!l.include_in_cost && <span className="ml-1 text-amber-700">(not in cost)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Batch table */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
          {standalone ? 'New standalone packaging items' : 'New packaging items for this product'}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-md overflow-hidden min-w-[1280px]">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-2 py-2 w-[150px]">SKU code</th>
                <th className="text-left px-2 py-2">Name</th>
                <th className="text-left px-2 py-2 w-[110px]">Type</th>
                <th className="text-left px-2 py-2 w-[150px]">Supplier</th>
                <th className="text-right px-2 py-2 w-[80px]">Price</th>
                <th className="text-left px-2 py-2 w-[60px]">Cur</th>
                <th className="text-right px-2 py-2 w-[80px]">Freight</th>
                <th className="text-right px-2 py-2 w-[70px]">Qty</th>
                <th className="text-left px-2 py-2 w-[180px]">Mode</th>
                <th className="text-center px-2 py-2 w-[70px]" title="Include this packaging's cost in the product's BOM cost calculation">In&nbsp;cost?</th>
                <th className="text-right px-2 py-2 w-[80px]">SOH</th>
                <th className="text-right px-2 py-2 w-[100px]">Original PO</th>
                <th className="px-2 py-2 w-[24px]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-t border-gray-100 ${!standalone && !r.include_in_cost ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-2 py-1.5">
                    <input value={r.sku_code} onChange={(e) => update(i, { sku_code: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 font-mono"
                      placeholder="PAK-XYZ" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={r.name} onChange={(e) => update(i, { name: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                      placeholder="Brownie flow wrap" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={r.type} onChange={(e) => update(i, { type: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded px-1 py-1">
                      {PACKAGING_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                      <option value="OTHER">Other</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={r.supplier_id ?? ''} onChange={(e) => update(i, { supplier_id: e.target.value || null })}
                      className="w-full text-xs border border-gray-200 rounded px-1 py-1">
                      <option value="">— None —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="any" min={0} value={r.price ?? ''}
                      onChange={(e) => update(i, { price: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={r.currency} onChange={(e) => update(i, { currency: e.target.value as CurrencyCode })}
                      className="w-full text-xs border border-gray-200 rounded px-1 py-1">
                      {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="any" min={0} value={r.freight_per_unit_nzd ?? ''}
                      onChange={(e) => update(i, { freight_per_unit_nzd: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="any" min={0} value={standalone ? '' : r.entry_value}
                      onChange={(e) => update(i, { entry_value: e.target.value === '' ? 0 : Number(e.target.value) })}
                      disabled={standalone} title={standalone ? LINK_ONLY : undefined}
                      className={`w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums ${standalone ? 'bg-gray-50 text-gray-300' : ''}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={r.entry_mode}
                      onChange={(e) => update(i, { entry_mode: e.target.value as EntryMode })}
                      disabled={standalone} title={standalone ? LINK_ONLY : undefined}
                      className={`w-full text-xs border border-gray-200 rounded px-1.5 py-1 ${standalone ? 'bg-gray-50 text-gray-300' : ''}`}>
                      <option value="per_pack">per product</option>
                      <option value="per_group">products per packaging</option>
                    </select>
                    {!standalone && r.entry_mode === 'per_group' && r.entry_value > 0 && (
                      <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">→ {resolveQty(r.entry_mode, r.entry_value).toFixed(4)} per product</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!standalone && r.include_in_cost}
                      onChange={(e) => update(i, { include_in_cost: e.target.checked })}
                      disabled={standalone} title={standalone ? LINK_ONLY : undefined}
                      className={`rounded border-gray-300 ${standalone ? 'opacity-40' : ''}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="any" min={0} value={r.current_soh ?? ''}
                      onChange={(e) => update(i, { current_soh: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="any" min={0} value={r.original_order_qty ?? ''}
                      onChange={(e) => update(i, { original_order_qty: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => removeRow(i)} disabled={rows.length <= 1}
                      className="text-gray-400 hover:text-red-600 disabled:opacity-30">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-2">
          <button onClick={addRow} className="text-xs text-blue-600 hover:underline">+ Add another packaging item</button>
          <p className="text-[11px] text-gray-500">
            {standalone
              ? 'Qty, Mode and In cost? describe a product link, so they don\u2019t apply to standalone items.'
              : <>Untick <span className="font-medium">In cost?</span> for items linked only for demand (cost excluded from per-unit BOM).</>}
          </p>
        </div>
      </div>

      {/* Original order date (applies to all rows) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Original PO date (applies to all rows)</label>
        <input type="date" value={originalDate} onChange={(e) => setOriginalDate(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <Link href="/packaging" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</Link>
        <button onClick={onSave} disabled={pending}
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50">
          {pending
            ? 'Saving…'
            : `Save ${rows.length} packaging item${rows.length === 1 ? '' : 's'}${standalone ? '' : ` + link to ${productLabel}`}`}
        </button>
      </div>
    </div>
  )
}
