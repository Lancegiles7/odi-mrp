'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  addDemandCellComment,
  getDemandCellComments,
  type CellComment,
  type EntityType,
} from '@/app/(dashboard)/_actions/cell-comments'
import { monthLabel } from '@/lib/demand'

interface Props {
  entityType:  EntityType
  entityId:    string
  yearMonth:   string                  // 'yyyy-mm-01'
  /** Label of the row (product / ingredient / packaging name). */
  entityName:  string
  /** Short description of what's wrong with the cell (e.g. "short by 25,000"). */
  status?:     string
  /** Did the page bulk-fetch detect at least one comment on this cell? */
  hasComment:  boolean
  /** Cell colour state — controls the trigger button styling. */
  state:       'red' | 'amber'
}

/**
 * Click-to-open popover for adding a comment to a single (entity, month)
 * cell. Only rendered on cells that are flagged red or amber — the
 * comment table is sparse so we keep the UI quiet on healthy cells.
 *
 * Existing comments load lazily on open. Filled cells advertise
 * themselves via a small dot indicator on the trigger.
 */
export function CellCommentPopover({
  entityType, entityId, yearMonth, entityName, status, hasComment, state,
}: Props) {
  const [open,    setOpen]    = useState(false)
  const [text,    setText]    = useState('')
  const [rows,    setRows]    = useState<CellComment[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saving,  startSave]  = useTransition()
  const [present, setPresent] = useState(hasComment)

  useEffect(() => { setPresent(hasComment) }, [hasComment])

  useEffect(() => {
    if (!open) return
    setText('')
    setError(null)
    setRows(null)
    setLoading(true)
    getDemandCellComments(entityType, entityId, yearMonth).then((res) => {
      setRows(res.ok ? res.rows : [])
      if (!res.ok && res.error) setError(`Couldn't load comments: ${res.error}`)
      setLoading(false)
    })
  }, [open, entityType, entityId, yearMonth])

  function save() {
    const trimmed = text.trim()
    if (!trimmed) { setError('Type a comment before saving.'); return }
    startSave(async () => {
      const res = await addDemandCellComment(entityType, entityId, yearMonth, trimmed)
      if (!res.ok) {
        setError(res.error ?? 'Save failed')
        return
      }
      setText('')
      setPresent(true)
      // Re-fetch so the new comment shows up in the thread immediately.
      const refreshed = await getDemandCellComments(entityType, entityId, yearMonth)
      if (refreshed.ok) setRows(refreshed.rows)
    })
  }

  // Trigger button — small "+" in the corner of the cell. Coloured by state.
  const triggerCls = present
    ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
    : state === 'red'
      ? 'bg-white text-red-500 border-red-200 hover:bg-red-50'
      : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        title={present ? 'View / add comments' : 'Add a comment'}
        className={`absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded border text-[10px] leading-none inline-flex items-center justify-center ${triggerCls}`}
      >
        {present ? '●' : '+'}
      </button>

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
              <h3 className="text-sm font-semibold">Comment · {entityName} · {monthLabel(yearMonth)}</h3>
              {status && <p className="text-[11px] text-gray-500 mt-0.5">{status}</p>}
            </div>

            <div className="px-5 py-4 text-sm space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">New comment</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. Quoted with Logo's — expecting PO confirmation Friday."
                  rows={3}
                  className="w-full text-xs border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-400"
                />
              </div>

              {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Previous</div>
                {loading ? (
                  <div className="text-xs text-gray-400 py-2">Loading…</div>
                ) : !rows || rows.length === 0 ? (
                  <div className="text-xs text-gray-400 py-2 italic">No comments yet on this cell.</div>
                ) : (
                  <ul className="max-h-44 overflow-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
                    {rows.map((r) => (
                      <li key={r.id} className="px-3 py-2 text-xs">
                        <div className="text-[10px] text-gray-500">
                          {r.changed_by_name ?? 'Unknown'} · {formatWhen(r.changed_at)}
                        </div>
                        <div className="mt-1 text-gray-800 whitespace-pre-wrap">{r.comment}</div>
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
                Close
              </button>
              <button
                type="button"
                disabled={saving || !text.trim()}
                onClick={save}
                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Add comment'}
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
