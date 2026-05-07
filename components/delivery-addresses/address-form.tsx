interface Initial {
  id?: string
  label: string
  street: string
  contact_name: string | null
  phone: string | null
  country: 'NZ' | 'AU'
  is_default: boolean
  is_active: boolean
  notes: string | null
}

export function AddressForm({
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
        <Field label="Label" required>
          <input name="label" defaultValue={initial.label} required maxLength={80} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="e.g. Main Warehouse" />
        </Field>
        <Field label="Country" required>
          <select name="country" defaultValue={initial.country} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="NZ">New Zealand</option>
            <option value="AU">Australia</option>
          </select>
        </Field>
      </div>

      <Field label="Street address" required>
        <textarea name="street" defaultValue={initial.street} required rows={2} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="12 Maui Place, Auckland 1010" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact name">
          <input name="contact_name" defaultValue={initial.contact_name ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Atma Okan" />
        </Field>
        <Field label="Contact phone">
          <input name="phone" defaultValue={initial.phone ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="+64 27 275 4329" />
        </Field>
      </div>

      <Field label="Notes (saved with this address)">
        <textarea name="notes" rows={2} defaultValue={initial.notes ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Loading dock at rear · ring 0273 555 0099 on arrival" />
      </Field>

      <div className="flex items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_default" defaultChecked={initial.is_default} className="rounded border-gray-300" />
          <span>Default for this country</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={initial.is_active} className="rounded border-gray-300" />
          <span>Active</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <a href="/delivery-addresses" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</a>
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
