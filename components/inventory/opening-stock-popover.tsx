'use client'

import { useEffect, useState, useTransition } from 'react'
import type {
  OpeningStockHistoryRow,
  UpdateResult,
  HistoryFetchResult,
} from '@/lib/opening-stock-history'

interface Props {
  /** Heading shown at the top of the popover, e.g. "Opening stock · Odi Organic Banana". */
  entityLabel:  string
  /** Current opening-stock override value (null = no override set; falls back to inventory). */
  currentValue: number | null
  /** Hint text shown under the heading — entity-specific copy. */
  description?: string
  /** Server action that writes the new value + appends a history row. */
  onSave:       (value: number | null, note: string) => Promise<UpdateResult>
  /** Server action that fetches the history rows for this entity. */
  onLoadHistory: () => Promise<HistoryFetchResult>
  /** Parent updates its row display when the save succeeds. */
  onSaved:      (next: number | null) => void
  /** Unit suffix shown next to the value (e.g. "g", "kg") — optional. */
  unitLabel?:   string
}

/**
 * Shared popover for editing an opening-stock override with an
 * optional comment and viewing the audit trail. Used on the
 * Production page (products), Ingredient demand and Packaging
 * demand. The popover itself is entity-agnostic — the caller
 * supplies the right server actions and label strings.
 *
 * History is fetched lazily on first open. Reopening reloads.
 */
export function OpeningStockHistoryPopover({
  entityLabel, currentValue, description,
  onSave, onLoadHistory, onSaved, unitLabel,
}: Props) {
  const [open,    setOpen]    = useState(false)
  const [value,   setValue]   = useState<string>(currentValue == null ? '' : String(currentValue))
  const [note,    setNote]    = useState<string>('')
  const [rows,    setRows]    = useState<OpeningStockHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saving,  startSave]  = useTransition()

  useEffect(() => {
    if (!open) return
    setValue(currentValue == null ? '' : String(currentValue))
    setNote('')
    setError(null)
    setRows(null)
    setLoading(true)
    onLoadHistory().then((res) => {
      setRows(res.ok ? res.rows : [])
      if (!res.ok && res.error) setError(`Couldn't load history: ${res.error}`)
      setLoading(false)
    })
  }, [open, currentValue, onLoadHistory])

  function save() {
    const trimmed   = value.trim()
    const nextValue: number | null = trimmed === '' ? null : Math.max(0, Number(trimmed))
    if (nextValue !== null && !Number.isFinite(nextValue)) {
      setError('Enter a number')
      return
    }
    startSave(async () => {
      const res = await onSave(nextValue, note)
      if (!res.ok) {
        setError(res.error ?? 'Save failed')
        return
      }
      onSaved(nextValue)
      setOpen(false)
    })
  }

  const hasHistory = rows != null && rows.length > 0

  return (
    <>
      {/* Trigger — value chip + clock icon button */}
      <div className="inline-flex items-center gap-1">
        <span
          className={`inline-block w-20 text-right text-[11px] rounded px-1.5 py-0.5 tabular-nums border ${
            currentValue == null
              ? 'border-dashed border-gray-300 bg-white text-gray-400'
              : 'border-gray-300 bg-white text-gray-900 font-medium'
          }`}
        >
          {currentValue == null ? '—' : currentValue.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Edit opening stock · view history"
          className="w-5 h-5 rounded border border-gray-300 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 text-gray-500 inline-flex items-center justify-center"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold">{entityLabel}</h3>
              {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
            </div>

            <div className="px-5 py-4 text-sm space-y-3">
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Current</span>
                <span className="text-lg font-semibold tabular-nums">
                  {currentValue == null ? '—' : currentValue.toLocaleString()}
                  {unitLabel && currentValue != null && <span className="text-xs text-gray-500 ml-1">{unitLabel}</span>}
                </span>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  New value{unitLabel && <span className="text-gray-400 ml-1 normal-case tracking-normal">({unitLabel})</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="(blank = clear override)"
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-400"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Comment (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Physical count after stocktake — added 12 units"
                  rows={2}
                  className="w-full text-xs border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-400"
                />
              </div>

              {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Edit history</div>
                {loading ? (
                  <div className="text-xs text-gray-400 py-2">Loading…</div>
                ) : !hasHistory ? (
                  <div className="text-xs text-gray-400 py-2 italic">No edits yet — this would be the first change captured.</div>
                ) : (
                  <ul className="max-h-44 overflow-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
                    {rows!.map((r) => (
                      <li key={r.id} className="px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono tabular-nums text-gray-700">
                            {r.previous_value == null ? '—' : r.previous_value.toLocaleString()}
                            <span className="text-gray-400 mx-1.5">→</span>
                            {r.new_value == null ? '—' : r.new_value.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-500">{formatWhen(r.changed_at)}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {r.changed_by_name ?? 'Unknown user'}
                        </div>
                        {r.note && (
                          <div className="mt-1 text-[11px] text-amber-900 bg-amber-50 border-l-2 border-amber-300 px-2 py-1 rounded-r">
                            {r.note}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-NZ', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
