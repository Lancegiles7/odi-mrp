'use client'

import { useState } from 'react'
import { PAYMENT_TERMS, isKnownPaymentTermsCode } from '@/lib/constants'

interface Initial {
  id?: string
  code: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  payment_terms: string | null
  lead_time_days: number | null
  notes: string | null
  is_active: boolean
  site_type?: 'manufacturer' | 'dc' | null
}

export function SupplierForm({
  action, initial, savedAt, error,
}: {
  action: (formData: FormData) => void
  initial: Initial
  savedAt?: boolean
  error?: string | null
}) {
  // Local state so the "Other" custom-text input toggles visibly
  const initialIsKnown = isKnownPaymentTermsCode(initial.payment_terms)
  const initialIsEmpty = !initial.payment_terms
  const [termsCode, setTermsCode] = useState<string>(
    initialIsEmpty ? '' : initialIsKnown ? initial.payment_terms! : 'OTHER',
  )
  const [termsOther, setTermsOther] = useState<string>(
    !initialIsEmpty && !initialIsKnown ? (initial.payment_terms ?? '') : '',
  )
  // Resolve the actual value submitted with the form
  const resolvedTerms = termsCode === '' ? '' : termsCode === 'OTHER' ? termsOther : termsCode

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="payment_terms" value={resolvedTerms} />

      {savedAt && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">
          Saved.
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Code" required>
          <input name="code" defaultValue={initial.code} required maxLength={20} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono" placeholder="e.g. FOR" />
        </Field>
        <Field label="Name" required>
          <input name="name" defaultValue={initial.name} required className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Contact name">
          <input name="contact_name" defaultValue={initial.contact_name ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={initial.email ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={initial.phone ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Address">
          <input name="address" defaultValue={initial.address ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Multi-line allowed (use newlines)" />
        </Field>
        <Field label="Payment terms">
          <select
            value={termsCode}
            onChange={(e) => setTermsCode(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">— Select —</option>
            {PAYMENT_TERMS.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
            <option value="OTHER">Other (specify)</option>
          </select>
          {termsCode === 'OTHER' && (
            <input
              value={termsOther}
              onChange={(e) => setTermsOther(e.target.value)}
              placeholder="e.g. 50% deposit, balance on delivery"
              className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
            />
          )}
        </Field>
        <Field label="Lead time (days)">
          <input name="lead_time_days" type="number" min={0} step={1} defaultValue={initial.lead_time_days ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Transfer site">
          <select name="site_type" defaultValue={initial.site_type ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Not a transfer site</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="dc">Distribution centre (DC)</option>
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={initial.notes ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial.is_active} className="rounded border-gray-300" />
        <span>Active</span>
      </label>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <a href="/suppliers" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</a>
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
