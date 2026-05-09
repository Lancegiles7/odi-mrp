'use client'

import { useState } from 'react'

interface Props {
  initialOriginalQty:    number | null
  initialOriginalDate:   string | null   // ISO date YYYY-MM-DD
  initialOriginalNotes:  string | null
  initialCurrentSoh:     number | null
  initialCurrentSohDate: string | null
  /** Hide the "feeds stock movements" hint (e.g. on products which aren't ledger-tracked) */
  hideStockMovementHint?: boolean
}

/**
 * Reused on packaging / ingredient / product edit forms.
 * Inputs are plain HTML form fields with the names below — the parent
 * <form action={...}> server action picks them up directly.
 *
 * Field names: original_order_qty, original_order_date, original_order_notes,
 *              current_soh, current_soh_as_of
 */
export function OriginalOrderSection(props: Props) {
  const [origQty, setOrigQty]   = useState<string>(props.initialOriginalQty?.toString() ?? '')
  const [origDate, setOrigDate] = useState<string>(props.initialOriginalDate ?? '')
  const [soh, setSoh]           = useState<string>(props.initialCurrentSoh?.toString() ?? '')
  const [sohDate, setSohDate]   = useState<string>(props.initialCurrentSohDate ?? '')

  const origQtyNum = Number(origQty) || 0
  const sohNum     = Number(soh)     || 0
  const consumed   = origQty !== '' && soh !== '' ? origQtyNum - sohNum : null

  // Days since launch (only when both dates set)
  let daysSince: number | null = null
  if (origDate && sohDate) {
    const a = new Date(origDate).getTime()
    const b = new Date(sohDate).getTime()
    if (!Number.isNaN(a) && !Number.isNaN(b)) daysSince = Math.round((b - a) / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500">Original Order (launch baseline)</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">Capture the first PO at launch and today&apos;s SOH so consumption since launch is visible at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Original order qty">
          <input name="original_order_qty" type="number" step="any" min={0} value={origQty}
            onChange={(e) => setOrigQty(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
        </Field>
        <Field label="Original order date">
          <input name="original_order_date" type="date" value={origDate}
            onChange={(e) => setOrigDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
      </div>

      <Field label="Original order notes (optional)">
        <input name="original_order_notes" defaultValue={props.initialOriginalNotes ?? ''}
          placeholder="e.g. PO #1042 with FlexiPack"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Current SOH (today)">
          <input name="current_soh" type="number" step="any" min={0} value={soh}
            onChange={(e) => setSoh(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right tabular-nums" />
        </Field>
        <Field label="SOH as of date">
          <input name="current_soh_as_of" type="date" value={sohDate}
            onChange={(e) => setSohDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </Field>
      </div>

      {consumed !== null && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md">
          <div className="grid grid-cols-3 gap-4 items-end">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Original</div>
              <div className="text-2xl font-semibold text-emerald-900 tabular-nums">{origQtyNum.toLocaleString()}</div>
              {origDate && <div className="text-[10px] text-emerald-700">{origDate}</div>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">− Current SOH</div>
              <div className="text-2xl font-semibold text-emerald-900 tabular-nums">{sohNum.toLocaleString()}</div>
              {sohDate && <div className="text-[10px] text-emerald-700">{sohDate}</div>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                {consumed >= 0 ? '= Consumed since launch' : '= Net received since launch'}
              </div>
              <div className={`text-2xl font-semibold tabular-nums ${consumed >= 0 ? 'text-emerald-900' : 'text-blue-900'}`}>
                {Math.abs(consumed).toLocaleString()}
              </div>
              {daysSince !== null && <div className="text-[10px] text-emerald-700">{daysSince} day{daysSince === 1 ? '' : 's'}</div>}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-emerald-200 text-[11px] text-emerald-800">
            Stored on the item for reference. The <strong>Stock Movements</strong> ledger continues to track
            operational events (PO receipts, production, manual adjustments) — Original Order is a baseline
            display only, kept separately so it doesn&apos;t double-count with later transactions.
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
