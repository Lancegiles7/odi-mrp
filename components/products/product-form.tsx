'use client'

import Link from 'next/link'
import type { Product } from '@/lib/types/database.types'

interface ProductFormProps {
  product?: Product | null
  action: (formData: FormData) => void
  errorMessage?: string | null
}

const PRODUCT_TYPES = ['Sachet', 'Tub', 'Pouch', "Snack 4 B's", 'Puff']

function Field({
  id, label, required, children
}: {
  id: string; label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function NumberInput({ id, name, defaultValue, placeholder, prefix }: {
  id: string; name: string; defaultValue?: number | null; placeholder?: string; prefix?: string
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-2 text-sm text-gray-400 pointer-events-none">{prefix}</span>
      )}
      <input
        id={id}
        name={name}
        type="number"
        step="0.01"
        min="0"
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder ?? '0.00'}
        className={`w-full ${prefix ? 'pl-7' : 'pl-3'} pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900`}
      />
    </div>
  )
}

export function ProductForm({ product, action, errorMessage }: ProductFormProps) {
  const isEdit = !!product

  return (
    <form action={action} className="space-y-5">
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Identity */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="sku_code" label="SKU Code" required>
            <input
              id="sku_code"
              name="sku_code"
              type="text"
              required
              defaultValue={product?.sku_code ?? ''}
              placeholder="ODI-BROC-SACHET-20G"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase"
              style={{ textTransform: 'uppercase' }}
            />
          </Field>

          <Field id="product_type" label="Product Type">
            <select
              id="product_type"
              name="product_type"
              defaultValue={product?.product_type ?? ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="">— select —</option>
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          <Field id="name" label="Product Name" required>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={product?.name ?? ''}
              placeholder="Odi Baby Puree Powder Organic Broccoli"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>

          <Field id="hero_call_out" label="Hero Call Out">
            <input
              id="hero_call_out"
              name="hero_call_out"
              type="text"
              defaultValue={product?.hero_call_out ?? ''}
              placeholder="e.g. Iodine for Growth"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>

          <Field id="back_of_pack" label="Back of Pack">
            <input
              id="back_of_pack"
              name="back_of_pack"
              type="text"
              defaultValue={product?.back_of_pack ?? ''}
              placeholder="e.g. Iodine, Iron, Vit C"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>

          <Field id="description" label="Description">
            <input
              id="description"
              name="description"
              type="text"
              defaultValue={product?.description ?? ''}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>
        </div>
      </div>

      {/* Sizing + Pricing */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Sizing &amp; Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="size_g" label="Pack Size (g)">
            <NumberInput id="size_g" name="size_g" defaultValue={product?.size_g} placeholder="20" />
          </Field>
          <Field id="serving_size" label="Serving Size (g)">
            <NumberInput id="serving_size" name="serving_size" defaultValue={product?.serving_size} placeholder="20" />
          </Field>
          <Field id="rrp" label="RRP (NZD)">
            <NumberInput id="rrp" name="rrp" defaultValue={product?.rrp} prefix="$" placeholder="4.50" />
          </Field>
        </div>
      </div>

      {/* Cost Inputs */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Cost Inputs</h2>
        <p className="text-xs text-gray-400 mb-4">
          These are added to the BOM ingredient total to calculate the grand total and margins.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field id="packaging" label="Packaging">
            <NumberInput id="packaging" name="packaging" defaultValue={product?.packaging} prefix="$" />
          </Field>
          <Field id="toll" label="Toll">
            <NumberInput id="toll" name="toll" defaultValue={product?.toll} prefix="$" />
          </Field>
          <Field id="margin" label="Margin">
            <NumberInput id="margin" name="margin" defaultValue={product?.margin} prefix="$" />
          </Field>
          <Field id="other" label="Other (Non-Organic Task)">
            <NumberInput id="other" name="other" defaultValue={product?.other} prefix="$" />
          </Field>
          <Field id="currency_exchange" label="Currency Exchange">
            <NumberInput id="currency_exchange" name="currency_exchange" defaultValue={product?.currency_exchange} prefix="$" />
          </Field>
          <Field id="freight" label="Freight">
            <NumberInput id="freight" name="freight" defaultValue={product?.freight} prefix="$" />
          </Field>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link
          href={isEdit ? `/products/${product?.id}` : '/products'}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
        >
          {isEdit ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  )
}
