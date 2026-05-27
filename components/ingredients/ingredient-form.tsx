'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Ingredient, Supplier } from '@/lib/types/database.types'
import { UNITS_OF_MEASURE, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/constants'
import { SupplierPicker } from './supplier-picker'
import { OriginalOrderSection } from '@/components/shared/original-order-section'
import type { FxRatesJson } from '@/lib/settings'

type SupplierOption = Pick<
  Supplier,
  | 'id'
  | 'code'
  | 'name'
  | 'contact_name'
  | 'email'
  | 'phone'
  | 'country_of_origin'
  | 'country_of_purchase'
  | 'currency'
>

interface IngredientFormProps {
  ingredient?: Ingredient | null
  suppliers: SupplierOption[]
  action: (formData: FormData) => void
  errorMessage?: string | null
  /** When set, form Cancel / Save redirects use this path. Used for the
   *  "+ Create new ingredient" flow from the product BOM editor. */
  returnTo?: string | null
  /** Loaded-cost FX rates from app_settings (NZD = 1, AUD/USD/EUR/GBP set in /settings) */
  fxRates: FxRatesJson
}

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending',   label: 'Pending' },
  { value: 'inactive',  label: 'Inactive' },
]

export function IngredientForm({
  ingredient,
  suppliers,
  action,
  errorMessage,
  returnTo,
  fxRates,
}: IngredientFormProps) {
  const isEdit = !!ingredient

  const [price, setPrice] = useState(ingredient?.price?.toString() ?? '')
  const [freight, setFreight] = useState(ingredient?.freight?.toString() ?? '')
  const [currency, setCurrency] = useState<CurrencyCode>(
    (((ingredient as unknown as { currency?: string })?.currency as CurrencyCode) ?? 'NZD'),
  )
  const [fxOverride, setFxOverride] = useState<string>(
    (ingredient as unknown as { fx_rate_override?: number | null })?.fx_rate_override?.toString() ?? '',
  )
  const [totalLoaded, setTotalLoaded] = useState(ingredient?.total_loaded_cost?.toString() ?? '')

  const fxFromTable = fxRates[currency] ?? 1
  const effectiveFx = fxOverride.trim() === '' ? fxFromTable : (Number(fxOverride) || fxFromTable)

  useEffect(() => {
    const p = parseFloat(price)
    const f = parseFloat(freight)
    const loaded = (isNaN(p) ? 0 : p * effectiveFx) + (isNaN(f) ? 0 : f)
    if (!isNaN(p) || !isNaN(f)) setTotalLoaded(loaded.toFixed(2))
  }, [price, freight, effectiveFx])

  const cancelHref = returnTo ? returnTo : '/ingredients'

  return (
    <form action={action} className="space-y-6">
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {returnTo && (
        <input type="hidden" name="return_to" value={returnTo} />
      )}

      {/* Identity */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sku_code" className="block text-sm font-medium text-gray-700 mb-1.5">
              SKU Code <span className="text-red-500">*</span>
            </label>
            <input
              id="sku_code"
              name="sku_code"
              type="text"
              required
              defaultValue={ingredient?.sku_code ?? ''}
              placeholder="ING-ORG-CHIA-POW"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase"
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1.5">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              id="status"
              name="status"
              required
              defaultValue={ingredient?.status ?? 'confirmed'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <p className="block text-sm font-medium text-gray-700 mb-2">Organic status</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="is_organic"
                  value="true"
                  defaultChecked={ingredient?.is_organic !== false}
                  className="accent-gray-900"
                />
                <span className="text-sm text-gray-700">
                  Organic <span className="ml-1 text-xs text-gray-400">(default)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="is_organic"
                  value="false"
                  defaultChecked={ingredient?.is_organic === false}
                  className="accent-gray-900"
                />
                <span className="text-sm text-gray-700">Non-Organic</span>
              </label>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Ingredient Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={ingredient?.name ?? ''}
              placeholder="Chia Instant Powder"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label htmlFor="unit_of_measure" className="block text-sm font-medium text-gray-700 mb-1.5">
              Unit of Measure
            </label>
            <select
              id="unit_of_measure"
              name="unit_of_measure"
              defaultValue={ingredient?.unit_of_measure ?? ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="">— select —</option>
              {UNITS_OF_MEASURE.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <input
              id="description"
              name="description"
              type="text"
              defaultValue={ingredient?.description ?? ''}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label htmlFor="lead_time" className="block text-sm font-medium text-gray-700 mb-1.5">
              Lead Time
            </label>
            <input
              id="lead_time"
              name="lead_time"
              type="text"
              defaultValue={ingredient?.lead_time ?? ''}
              placeholder="e.g. 2 weeks"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
      </div>

      {/* Supplier */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Supplier</h2>
        <SupplierPicker
          suppliers={suppliers}
          defaultSupplierId={ingredient?.supplier_id ?? null}
          defaultSupplierName={ingredient?.confirmed_supplier ?? null}
        />
        <div>
          <label htmlFor="supplier_sku_code" className="block text-sm font-medium text-gray-700 mb-1.5">
            Supplier SKU code
            <span className="ml-1 text-xs text-gray-400">(the supplier&apos;s own SKU for this ingredient)</span>
          </label>
          <input
            id="supplier_sku_code"
            name="supplier_sku_code"
            type="text"
            defaultValue={(ingredient as unknown as { supplier_sku_code?: string | null })?.supplier_sku_code ?? ''}
            placeholder="e.g. ORG-BEET-AD-25"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">Pre-fills on new PO lines for this ingredient.</p>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing</h2>

        {/* Currency + FX override */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1.5">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Rate {currency} → NZD: <span className="font-mono">{fxFromTable.toFixed(4)}</span> (from Settings).</p>
          </div>
          <div>
            <label htmlFor="fx_rate_override" className="block text-sm font-medium text-gray-700 mb-1.5">
              FX rate override <span className="ml-1 text-xs text-gray-400">(optional)</span>
            </label>
            <input
              id="fx_rate_override"
              name="fx_rate_override"
              type="number"
              step="0.0001"
              min="0"
              value={fxOverride}
              onChange={(e) => setFxOverride(e.target.value)}
              placeholder={String(fxFromTable)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">Override the settings rate for this ingredient only.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">Price <span className="ml-1 text-xs text-gray-400">({currency})</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
              <input
                id="price"
                name="price"
                type="number"
                step="0.0001"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="freight" className="block text-sm font-medium text-gray-700 mb-1.5">Freight <span className="ml-1 text-xs text-gray-400">(NZD)</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
              <input
                id="freight"
                name="freight"
                type="number"
                step="0.0001"
                min="0"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="total_loaded_cost" className="block text-sm font-medium text-gray-700 mb-1.5">
              Total Loaded Cost <span className="ml-1 text-xs text-gray-400">(NZD · price × FX + freight)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
              <input
                id="total_loaded_cost"
                name="total_loaded_cost"
                type="number"
                step="0.0001"
                min="0"
                value={totalLoaded}
                onChange={(e) => setTotalLoaded(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Override if needed</p>
          </div>
        </div>
        {isEdit && (
          <p className="mt-3 text-xs text-gray-500">
            A price change is recorded in the history ledger on save (any change to Price, Freight, or Total Loaded Cost).
          </p>
        )}
      </div>

      {/* Original Order baseline */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <OriginalOrderSection
          initialOriginalQty={(ingredient as unknown as { original_order_qty?: number | null })?.original_order_qty ?? null}
          initialOriginalDate={(ingredient as unknown as { original_order_date?: string | null })?.original_order_date ?? null}
          initialOriginalNotes={(ingredient as unknown as { original_order_notes?: string | null })?.original_order_notes ?? null}
          initialCurrentSoh={(ingredient as unknown as { current_soh?: number | null })?.current_soh ?? null}
          initialCurrentSohDate={(ingredient as unknown as { current_soh_as_of?: string | null })?.current_soh_as_of ?? null}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link
          href={cancelHref}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
        >
          {isEdit ? 'Save changes' : 'Add ingredient'}
        </button>
      </div>
    </form>
  )
}
