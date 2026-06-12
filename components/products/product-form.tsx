'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Product } from '@/lib/types/database.types'
import { PRODUCT_GROUPS, MANUFACTURERS } from '@/lib/constants'
import { OriginalOrderSection } from '@/components/shared/original-order-section'

interface ProductFormProps {
  product?: Product | null
  action: (formData: FormData) => void
  errorMessage?: string | null
  fxRate: number
}

function Field({
  id, label, required, children, className,
}: {
  id?: string; label: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function NumberInput({
  id, name, defaultValue, placeholder, prefix, suffix, step = 'any', allowNegative = false,
}: {
  id?: string; name: string; defaultValue?: number | null; placeholder?: string
  prefix?: string; suffix?: string; step?: string; allowNegative?: boolean
}) {
  // Default step is 'any' so cost inputs accept the same 4-decimal
  // precision used everywhere else (loaded packaging cost, ingredient
  // loaded cost, FX, etc.). Fields that genuinely want whole numbers
  // (size_g override etc.) pass step explicitly.
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-2 text-sm text-gray-400 pointer-events-none">{prefix}</span>}
      <input
        id={id}
        name={name}
        type="number"
        step={step}
        {...(allowNegative ? {} : { min: '0' })}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder ?? '0.00'}
        className={`w-full ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'} py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900`}
      />
      {suffix && <span className="absolute right-3 top-2 text-sm text-gray-400 pointer-events-none">{suffix}</span>}
    </div>
  )
}

// Money input paired with an AUD/NZD currency selector. Submits two fields:
// `name` (the amount) and `currencyName` (AUD|NZD).
function MoneyInput({
  id, name, currencyName, defaultValue, defaultCurrency = 'AUD', allowNegative = false,
}: {
  id?: string; name: string; currencyName: string
  defaultValue?: number | null; defaultCurrency?: string | null; allowNegative?: boolean
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <span className="absolute left-3 top-2 text-sm text-gray-400 pointer-events-none">$</span>
        <input
          id={id}
          name={name}
          type="number"
          step="any"
          {...(allowNegative ? {} : { min: '0' })}
          defaultValue={defaultValue ?? ''}
          placeholder="0.00"
          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <select
        name={currencyName}
        defaultValue={defaultCurrency ?? 'AUD'}
        aria-label={`${name} currency`}
        className="w-[4.5rem] px-2 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        <option value="AUD">AUD</option>
        <option value="NZD">NZD</option>
      </select>
    </div>
  )
}

export function ProductForm({ product, action, errorMessage, fxRate }: ProductFormProps) {
  const isEdit = !!product
  // apply_fx is retained on the row but no longer affects costing — the
  // form no longer renders a toggle (NZD is always the base, AU always
  // derived). We submit `true` so the column stays populated for the
  // few legacy reports that still join on it.

  // Wastage is stored as a fraction (0.03) but edited as a percent (3)
  const wastageDisplay =
    product?.wastage_pct != null ? (Number(product.wastage_pct) * 100).toFixed(2) : ''

  return (
    <form action={action} className="space-y-5">
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Product details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field id="product_type" label="Product type">
              <select
                id="product_type"
                name="product_type"
                defaultValue={product?.product_type ?? ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="">— select —</option>
                {PRODUCT_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </Field>

            <Field id="sku_code" label="SKU code" required>
              <input
                id="sku_code"
                name="sku_code"
                type="text"
                required
                defaultValue={product?.sku_code ?? ''}
                placeholder="ODI-P-CHIA-250"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase"
                style={{ textTransform: 'uppercase' }}
              />
            </Field>

            <Field id="name" label="Product name" required className="col-span-2">
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={product?.name ?? ''}
                placeholder="Organic Chia Pouch"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </Field>

            <Field id="size_g" label="Size (g)">
              <NumberInput id="size_g" name="size_g" defaultValue={product?.size_g} placeholder="250" />
            </Field>
            <Field id="serving_size" label="Serving size (g)">
              <NumberInput id="serving_size" name="serving_size" defaultValue={product?.serving_size} placeholder="30" />
            </Field>
            {/* Freeze-dried wet input is now per-ingredient (Wet g column in the BOM editor),
                not a single product-level weight. */}
            <Field id="rrp" label="RRP — NZ (inc GST)">
              <NumberInput id="rrp" name="rrp" defaultValue={product?.rrp} prefix="$" placeholder="14.99" />
            </Field>
            <Field id="rrp_au" label="RRP — AU (inc GST)">
              <NumberInput id="rrp_au" name="rrp_au" defaultValue={product?.rrp_au ?? product?.rrp} prefix="A$" placeholder="14.99" />
            </Field>

            <Field id="hero_call_out" label="Hero callout" className="col-span-2">
              <input
                id="hero_call_out"
                name="hero_call_out"
                type="text"
                defaultValue={product?.hero_call_out ?? ''}
                placeholder="e.g. High Omega-3 Superfood"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </Field>
            <Field id="back_of_pack" label="Back of pack" className="col-span-2">
              <textarea
                id="back_of_pack"
                name="back_of_pack"
                rows={3}
                defaultValue={product?.back_of_pack ?? ''}
                placeholder="Ingredient source, certifications, marketing blurb…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </Field>
            <Field id="description" label="Description" className="col-span-2">
              <input
                id="description"
                name="description"
                type="text"
                defaultValue={product?.description ?? ''}
                placeholder="Internal description (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </Field>

            <Field id="manufacturer" label="Manufacturer — NZ">
              <input
                id="manufacturer"
                name="manufacturer"
                type="text"
                list="manufacturer-options"
                defaultValue={product?.manufacturer ?? ''}
                placeholder="e.g. Brand Nation"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <datalist id="manufacturer-options">
                {MANUFACTURERS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </Field>

            <Field id="manufacturer_au" label="Manufacturer — AU (optional)">
              <input
                id="manufacturer_au"
                name="manufacturer_au"
                type="text"
                list="manufacturer-options"
                defaultValue={product?.manufacturer_au ?? ''}
                placeholder="e.g. VMC — leave blank if made in NZ"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Set only when Australia is made separately (e.g. VMC). The AU cost then uses its own toll + AU ingredient costs instead of converting the NZ build.
              </p>
            </Field>

            <Field id="opening_stock_override" label="Opening stock override (units)">
              <NumberInput
                id="opening_stock_override"
                name="opening_stock_override"
                defaultValue={product?.opening_stock_override}
                placeholder="Leave blank to use inventory balance"
                step="1"
              />
            </Field>
          </div>
        </div>

        {/* Cost inputs */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Cost inputs</h2>
          <p className="text-xs text-gray-400 mb-4">
            Per-unit amounts. Added to the ingredient total (after wastage) to form base cost.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field id="packaging" label="Packaging ($)">
              <NumberInput id="packaging" name="packaging" defaultValue={product?.packaging} prefix="$" />
            </Field>
            <Field id="toll" label="Toll — NZ">
              <MoneyInput id="toll" name="toll" currencyName="toll_currency" defaultValue={product?.toll} defaultCurrency={product?.toll_currency ?? 'AUD'} />
            </Field>
            <Field id="toll_au" label="Toll — AU (VMC, A$)">
              <NumberInput id="toll_au" name="toll_au" defaultValue={product?.toll_au ?? product?.toll} prefix="A$" />
            </Field>
            <Field id="margin" label="Margin">
              <MoneyInput id="margin" name="margin" currencyName="margin_currency" defaultValue={product?.margin} defaultCurrency={product?.margin_currency ?? 'AUD'} />
            </Field>
            <Field id="other" label="Task / other">
              <MoneyInput id="other" name="other" currencyName="other_currency" defaultValue={product?.other} defaultCurrency={product?.other_currency ?? 'AUD'} allowNegative />
            </Field>
            <Field id="freight_nz" label="Freight — NZ">
              <MoneyInput id="freight_nz" name="freight_nz" currencyName="freight_nz_currency" defaultValue={product?.freight_nz ?? product?.freight} defaultCurrency={product?.freight_nz_currency ?? 'NZD'} />
            </Field>
            <Field id="freight_au" label="Freight — AU">
              <MoneyInput id="freight_au" name="freight_au" currencyName="freight_au_currency" defaultValue={product?.freight_au ?? product?.freight} defaultCurrency={product?.freight_au_currency ?? 'NZD'} />
            </Field>
            <Field id="wastage_pct_input" label="Contingency / wastage (%)">
              <NumberInput
                id="wastage_pct_input"
                name="wastage_pct_input"
                defaultValue={wastageDisplay === '' ? null : Number(wastageDisplay)}
                suffix="%"
                step="0.01"
                placeholder="0.00"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Applied to every ingredient — lifts each $/unit and the quantity ordered (procurement demand). Not a separate cost line.
              </p>
            </Field>

            {/* Currency model — informational. Base cost is NZD; AU is always derived. */}
            <div className="col-span-2 mt-2 p-3 rounded-md border border-gray-200 bg-gray-50">
              <div className="text-sm font-medium">Costing base · NZD</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Base cost is always NZD. AU total is derived as <span className="font-mono">base ÷ FX</span>, shown alongside everywhere.
                AUD-priced inputs (ingredients, packaging) are auto-converted to NZD via the per-item currency / FX rate.
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span>Current FX (AUD → NZD):</span>
                <span className="font-mono font-semibold text-gray-900">{fxRate.toFixed(4)}</span>
                <Link href="/settings" className="underline">Edit in Settings →</Link>
              </div>
              {/* Keep apply_fx submitted as true for back-compat; costing no longer reads it. */}
              <input type="hidden" name="apply_fx" value="true" />
            </div>
          </div>
        </div>
      </div>

      {/* Original Order baseline */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <OriginalOrderSection
          initialOriginalQty={(product as unknown as { original_order_qty?: number | null })?.original_order_qty ?? null}
          initialOriginalDate={(product as unknown as { original_order_date?: string | null })?.original_order_date ?? null}
          initialOriginalNotes={(product as unknown as { original_order_notes?: string | null })?.original_order_notes ?? null}
          initialCurrentSoh={(product as unknown as { current_soh?: number | null })?.current_soh ?? null}
          initialCurrentSohDate={(product as unknown as { current_soh_as_of?: string | null })?.current_soh_as_of ?? null}
          hideStockMovementHint
        />
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
