'use client'

import { useMemo, useState } from 'react'
import {
  PACKAGING_TYPES, packagingTypeLabel, SUPPORTED_CURRENCIES, type CurrencyCode,
} from '@/lib/constants'
import { computeLoadedNzd, type FxRates } from '@/lib/packaging-cost'

interface SupplierOption {
  id: string
  name: string
}

interface Initial {
  id?: string
  sku_code: string
  name: string
  type: string
  unit_of_measure: string
  description: string | null
  supplier_id: string | null
  supplier_sku_code: string | null
  supplier_pack_size: number | null
  supplier_pack_unit: string | null
  price: number | null
  currency: string | null
  fx_rate_override: number | null
  freight_per_unit_nzd: number | null
  opening_stock_override: number | null
  reorder_point: number | null
  is_active: boolean
  notes: string | null
}

export function PackagingForm({
  action, initial, suppliers, fxRates, savedAt, error,
}: {
  action: (formData: FormData) => void
  initial: Initial
  suppliers: SupplierOption[]
  fxRates: FxRates
  savedAt?: boolean
  error?: string | null
}) {
  const [type, setType]         = useState(initial.type ?? 'OTHER')
  const [price, setPrice]       = useState<string>(initial.price?.toString() ?? '')
  const [currency, setCurrency] = useState<CurrencyCode>(((initial.currency as CurrencyCode) ?? 'NZD'))
  const [fxOverride, setFxOverride] = useState<string>(initial.fx_rate_override?.toString() ?? '')
  const [freight, setFreight]   = useState<string>(initial.freight_per_unit_nzd?.toString() ?? '')

  const fxFromTable = fxRates[currency] ?? 1
  const fxRate = fxOverride.trim() === '' ? fxFromTable : (Number(fxOverride) || fxFromTable)

  const loaded = useMemo(() => computeLoadedNzd({
    price: price === '' ? null : Number(price),
    currency,
    fx_rate_override: fxOverride === '' ? null : Number(fxOverride),
    freight_per_unit_nzd: freight === '' ? null : Number(freight),
  }, fxRates), [price, currency, fxOverride, freight, fxRates])

  const priceInNzd = (Number(price) || 0) * fxRate

  return (
    <form action={action} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {savedAt && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">Saved.</div>}
      {error    && <div className="p-3 bg-red-50    border border-red-200    rounded-md text-sm text-red-700">{error}</div>}

      {/* IDENTITY */}
      <div className="space-y-4">
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500">Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU code" required>
            <input name="sku_code" defaultValue={initial.sku_code} required maxLength={40} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono" placeholder="e.g. PAK-BRW-FW" />
          </Field>
          <Field label="Type">
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              {PACKAGING_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
              <option value="OTHER">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Name" required>
          <input name="name" defaultValue={initial.name} required className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="e.g. Brownie flow wrap (30 g)" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unit of measure">
            <input name="unit_of_measure" defaultValue={initial.unit_of_measure ?? 'each'} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Description (optional)">
            <input name="description" defaultValue={initial.description ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </Field>
        </div>
      </div>

      {/* SUPPLIER */}
      <div className="space-y-4">
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500">Supplier</h3>
        <Field label="Supplier">
          <select name="supplier_id" defaultValue={initial.supplier_id ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">— No supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Supplier SKU code">
            <input name="supplier_sku_code" defaultValue={initial.supplier_sku_code ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Supplier pack size">
            <input name="supplier_pack_size" type="number" step="any" min={0} defaultValue={initial.supplier_pack_size ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm tabular-nums" />
          </Field>
          <Field label="Pack unit">
            <input name="supplier_pack_unit" defaultValue={initial.supplier_pack_unit ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="each" />
          </Field>
        </div>
      </div>

      {/* LOADED COST */}
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500">Loaded cost (per unit)</h3>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Supplier price">
            <input name="price" type="number" step="any" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
          </Field>
          <Field label="Currency">
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label={`FX → NZD ${fxOverride === '' ? '(from settings)' : '(overridden)'}`}>
            <input name="fx_rate_override" type="number" step="any" min={0} value={fxOverride} onChange={(e) => setFxOverride(e.target.value)} placeholder={String(fxFromTable)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
          </Field>
        </div>
        <Field label="Freight per unit (NZD)">
          <input name="freight_per_unit_nzd" type="number" step="any" min={0} value={freight} onChange={(e) => setFreight(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
        </Field>

        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Fully loaded cost (NZD)</div>
              <div className="text-[10px] text-emerald-700">price × FX + freight</div>
            </div>
            <div className="text-2xl font-semibold text-emerald-900 tabular-nums">${loaded.toFixed(4)}</div>
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-200 grid grid-cols-3 gap-2 text-[10px] text-emerald-800">
            <div><div className="text-emerald-700">In NZD</div><div className="font-medium tabular-nums">{Number(price || 0).toFixed(3)} × {fxRate.toFixed(4)} = ${priceInNzd.toFixed(3)}</div></div>
            <div><div className="text-emerald-700">+ Freight</div><div className="font-medium tabular-nums">${(Number(freight) || 0).toFixed(3)}</div></div>
            <div><div className="text-emerald-700">= Loaded</div><div className="font-medium tabular-nums">${loaded.toFixed(4)}</div></div>
          </div>
        </div>
        <p className="text-[11px] text-gray-500">FX rates are managed in <a href="/settings" className="underline">Settings → Currency</a>. Override per-item only when needed.</p>
      </div>

      {/* INVENTORY */}
      <div className="space-y-4">
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500">Inventory</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Opening SOH override">
            <input name="opening_stock_override" type="number" step="any" min={0} defaultValue={initial.opening_stock_override ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
          </Field>
          <Field label="Reorder point">
            <input name="reorder_point" type="number" step="any" min={0} defaultValue={initial.reorder_point ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
          </Field>
        </div>
      </div>

      <Field label="Notes">
        <textarea name="notes" rows={2} defaultValue={initial.notes ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial.is_active} className="rounded border-gray-300" />
        <span>Active</span>
      </label>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <a href="/packaging" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</a>
        <button type="submit" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800">Save</button>
      </div>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}

// Avoid linter warning for unused export
export type { Initial as PackagingInitial }
export const __packagingTypeLabel = packagingTypeLabel
