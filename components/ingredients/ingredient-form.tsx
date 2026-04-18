'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Ingredient } from '@/lib/types/database.types'
import { UNITS_OF_MEASURE } from '@/lib/constants'

interface IngredientFormProps {
  ingredient?: Ingredient | null
  action: (formData: FormData) => void
  errorMessage?: string | null
}

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending',   label: 'Pending' },
  { value: 'inactive',  label: 'Inactive' },
]

export function IngredientForm({ ingredient, action, errorMessage }: IngredientFormProps) {
  const isEdit = !!ingredient

  const [price, setPrice] = useState(ingredient?.price?.toString() ?? '')
  const [freight, setFreight] = useState(ingredient?.freight?.toString() ?? '')
  const [totalLoaded, setTotalLoaded] = useState(ingredient?.total_loaded_cost?.toString() ?? '')

  // Auto-compute total loaded cost when price or freight changes
  useEffect(() => {
    const p = parseFloat(price)
    const f = parseFloat(freight)
    if (!isNaN(p) && !isNaN(f)) {
      setTotalLoaded((p + f).toFixed(2))
    } else if (!isNaN(p)) {
      setTotalLoaded(p.toFixed(2))
    } else if (!isNaN(f)) {
      setTotalLoaded(f.toFixed(2))
    }
  }, [price, freight])

  return (
    <form action={action} className="space-y-6">
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Core identity */}
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
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Organic / Non-Organic toggle */}
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
                  Organic
                  <span className="ml-1 text-xs text-gray-400">(default)</span>
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
            <p className="text-xs text-gray-400 mt-1">
              Ingredients not listed on a BOM are assumed organic by default.
            </p>
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
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
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
        </div>
      </div>

      {/* Procurement */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Procurement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="confirmed_supplier" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirmed Supplier
            </label>
            <input
              id="confirmed_supplier"
              name="confirmed_supplier"
              type="text"
              defaultValue={ingredient?.confirmed_supplier ?? ''}
              placeholder="Supplier name"
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

      {/* Pricing */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">
              Price
            </label>
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
            <label htmlFor="freight" className="block text-sm font-medium text-gray-700 mb-1.5">
              Freight
            </label>
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
              Total Loaded Cost
              <span className="ml-1 text-xs text-gray-400">(auto-calculated)</span>
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
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link
          href="/ingredients"
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
