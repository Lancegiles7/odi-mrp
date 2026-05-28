interface Initial {
  id?: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  is_default: boolean
  is_active: boolean
  notes: string | null
}

export function IssuerForm({
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
        <Field label="Name" required>
          <input name="name" defaultValue={initial.name} required maxLength={80} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Atma Okan" />
        </Field>
        <Field label="Title">
          <input name="title" defaultValue={initial.title ?? ''} maxLength={80} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="Operations Manager" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <input name="phone" defaultValue={initial.phone ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="+64 27 275 4329" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={initial.email ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="orders@odinutrition.com" />
        </Field>
      </div>

      <Field label="Notes (internal)">
        <textarea name="notes" rows={2} defaultValue={initial.notes ?? ''} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="e.g. handles all NZ-based supplier POs" />
      </Field>

      <div className="flex items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_default" defaultChecked={initial.is_default} className="rounded border-gray-300" />
          <span>Default issuer</span>
          <span className="text-xs text-gray-400">(used on new POs; only one row at a time)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={initial.is_active} className="rounded border-gray-300" />
          <span>Active</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <a href="/settings/issuers" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</a>
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
