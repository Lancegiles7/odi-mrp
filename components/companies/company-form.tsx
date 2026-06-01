interface Initial {
  id?:                     string
  legal_name:              string
  country:                 string | null
  business_number_label:   string | null
  business_number:         string | null
  tax_number_label:        string | null
  tax_number:              string | null
  address:                 string | null
  website:                 string | null
  email:                   string | null
  phone:                   string | null
  logo_path:               string | null
  brand_colour:            string | null
  is_default:              boolean
  is_active:               boolean
  notes:                   string | null
}

/**
 * Server-friendly form for creating / editing a PO company (the legal
 * entity that drives the PDF letterhead). Mirrors IssuerForm so the
 * two settings screens feel like siblings.
 *
 * Country isn't validated against an enum — free-form so non-NZ/AU
 * additions later don't need a migration. Business / tax number labels
 * are user-editable for the same reason ("NZBN" / "ABN" / "Company no.").
 */
export function CompanyForm({
  action, initial, savedAt, error,
}: {
  action: (formData: FormData) => void
  initial: Initial
  savedAt?: boolean
  error?: string | null
}) {
  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {savedAt && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">Saved.</div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Legal name" required>
          <input name="legal_name" defaultValue={initial.legal_name} required maxLength={120} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Odi Nutrition Ltd" />
        </Field>
        <Field label="Country">
          <select name="country" defaultValue={initial.country ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="">— Select country —</option>
            <option value="NZ">New Zealand</option>
            <option value="AU">Australia</option>
            <option value="Other">Other</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Business number label" hint="e.g. NZBN, ABN, Company number">
          <input name="business_number_label" defaultValue={initial.business_number_label ?? ''} maxLength={40} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="NZBN" />
        </Field>
        <Field label="Business number">
          <input name="business_number" defaultValue={initial.business_number ?? ''} maxLength={40} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm tabular-nums" placeholder="9429046884123" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Tax number label" hint="usually GST">
          <input name="tax_number_label" defaultValue={initial.tax_number_label ?? ''} maxLength={40} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="GST" />
        </Field>
        <Field label="Tax number">
          <input name="tax_number" defaultValue={initial.tax_number ?? ''} maxLength={40} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm tabular-nums" placeholder="123-456-789" />
        </Field>
      </div>

      <Field label="Address">
        <textarea name="address" rows={2} defaultValue={initial.address ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Street, City, Postcode, Country" />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Phone">
          <input name="phone" defaultValue={initial.phone ?? ''} maxLength={40} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="(07) 3448 6216" />
        </Field>
        <Field label="Website">
          <input name="website" defaultValue={initial.website ?? ''} maxLength={120} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="www.odinutrition.com" />
        </Field>
        <Field label="Contact email">
          <input name="email" type="email" defaultValue={initial.email ?? ''} maxLength={120} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="orders@…" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Logo path" hint="public asset under /public, e.g. /vmc-logo.png. Blank = text-only header.">
          <input name="logo_path" defaultValue={initial.logo_path ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono" placeholder="/odi-logo@2x.png" />
        </Field>
        <Field label="Brand colour" hint="Hex colour used for the title bar. e.g. #5a8a3a">
          <div className="flex items-center gap-2">
            <input name="brand_colour" defaultValue={initial.brand_colour ?? ''} className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono" placeholder="#5a8a3a" />
            {initial.brand_colour && (
              <span className="w-6 h-6 rounded border border-gray-300" style={{ background: initial.brand_colour }} />
            )}
          </div>
        </Field>
      </div>

      <Field label="Notes (internal)">
        <textarea name="notes" rows={2} defaultValue={initial.notes ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="e.g. used for AU Pty Ltd purchases" />
      </Field>

      <div className="flex items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_default" defaultChecked={initial.is_default} className="rounded border-gray-300" />
          <span>Default company</span>
          <span className="text-xs text-gray-400">(used on new POs; only one row at a time)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={initial.is_active} className="rounded border-gray-300" />
          <span>Active</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <a href="/settings/companies" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</a>
        <button type="submit" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800">Save</button>
      </div>
    </form>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
        {hint && <span className="ml-1 normal-case tracking-normal text-gray-400 font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}
