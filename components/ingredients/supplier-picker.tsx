'use client'

import { useState, useMemo } from 'react'
import type { Supplier } from '@/lib/types/database.types'

/**
 * Supplier picker used in the ingredient form. Combines:
 *   - an existing-supplier dropdown (populated by the server page)
 *   - an inline "add new supplier" panel that submits with the form
 *
 * Form submission semantics:
 *   - supplier_id       → selected existing supplier UUID (or empty)
 *   - new_supplier_name → non-empty when the user is creating a new one
 *     (name + code/contact/country/currency fields also submitted)
 * The server action decides: if supplier_id present → use it,
 * else if new_supplier_name present → insert supplier then link.
 */

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

interface SupplierPickerProps {
  suppliers: SupplierOption[]
  defaultSupplierId: string | null
  defaultSupplierName?: string | null   // legacy confirmed_supplier fallback
}

const CURRENCIES = ['NZD', 'AUD', 'USD', 'EUR', 'GBP', 'CAD', 'CNY', 'JPY']

export function SupplierPicker({
  suppliers,
  defaultSupplierId,
  defaultSupplierName,
}: SupplierPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(defaultSupplierId ?? '')
  const [showNew, setShowNew]       = useState<boolean>(false)

  const selected = useMemo(
    () => suppliers.find((s) => s.id === selectedId) ?? null,
    [suppliers, selectedId],
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Supplier
          </label>
          <select
            name="supplier_id"
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setShowNew(false) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            <option value="">— no supplier linked —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.country_of_purchase ? ` · ${s.country_of_purchase}` : ''}
              </option>
            ))}
          </select>
          {!selectedId && defaultSupplierName && (
            <p className="mt-1 text-xs text-amber-700">
              Previous text value: <span className="font-medium">{defaultSupplierName}</span> — pick an existing supplier above or add a new one.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setSelectedId(''); setShowNew((v) => !v) }}
          className="px-3 py-2 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-50 whitespace-nowrap"
        >
          {showNew ? 'Cancel new' : '+ Add new supplier'}
        </button>
      </div>

      {/* Existing supplier read-only summary */}
      {selected && (
        <div className="grid grid-cols-3 gap-3 text-xs bg-gray-50 rounded p-3">
          <Field label="Country of origin" value={selected.country_of_origin} />
          <Field label="Country of purchase" value={selected.country_of_purchase} />
          <Field label="Currency" value={selected.currency} />
          <Field label="Contact" value={selected.contact_name} />
          <Field label="Phone" value={selected.phone} />
          <Field label="Email" value={selected.email} />
        </div>
      )}

      {/* New supplier inline form */}
      {showNew && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">
            New supplier (created when you save the ingredient)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input name="new_supplier_name"   label="Supplier name"       required />
            <Input name="new_supplier_code"   label="Code" placeholder="auto-generated if blank" />
            <Input name="new_supplier_country_of_origin"   label="Country of origin" />
            <Input name="new_supplier_country_of_purchase" label="Country of purchase" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
              <select name="new_supplier_currency"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white">
                <option value="">— select —</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input name="new_supplier_contact_name" label="Contact name" />
            <Input name="new_supplier_phone"        label="Phone" />
            <Input name="new_supplier_email"        label="Email" type="email" />
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  )
}

function Input({
  name, label, required, placeholder, type = 'text',
}: {
  name: string; label: string; required?: boolean; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  )
}
