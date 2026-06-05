'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INGREDIENT_DOC_TYPES } from '@/lib/constants'
import {
  uploadIngredientDocument,
  deleteIngredientDocument,
  getDocumentDownloadUrl,
  type UploadedDoc,
} from '@/app/(dashboard)/ingredients/[id]/documents/actions'

interface Props {
  ingredientId:    string
  ingredientName:  string
  initialDocs:     UploadedDoc[]
}

const TYPE_BY_VALUE = new Map(INGREDIENT_DOC_TYPES.map((t) => [t.value, t]))

function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isExpired(expires: string | null): boolean {
  if (!expires) return false
  // Compare just the date portion — both expires_at and "today" treated in UTC.
  const today = new Date().toISOString().slice(0, 10)
  return expires < today
}

/**
 * Documents section for the ingredient detail page. Lists files, opens an
 * upload modal, downloads via short-lived signed URLs (the bucket is
 * private — no public URLs are exposed).
 */
export function IngredientDocuments({ ingredientId, ingredientName, initialDocs }: Props) {
  const router = useRouter()
  const [docs, setDocs] = useState<UploadedDoc[]>(initialDocs)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [listError,   setListError]   = useState<string | null>(null)

  function onUpload(formData: FormData) {
    setUploadError(null)
    start(async () => {
      const res = await uploadIngredientDocument(formData)
      if (!res.ok) { setUploadError(res.error ?? 'Upload failed'); return }
      setOpen(false)
      // Refresh so the new row + count appear without a hard reload.
      router.refresh()
    })
  }

  function onDelete(doc: UploadedDoc) {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return
    setListError(null)
    start(async () => {
      const res = await deleteIngredientDocument(doc.id)
      if (!res.ok) { setListError(res.error ?? 'Delete failed'); return }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      router.refresh()
    })
  }

  async function onDownload(doc: UploadedDoc) {
    setListError(null)
    const res = await getDocumentDownloadUrl(doc.id)
    if (!res.ok || !res.url) { setListError(res.error ?? 'Could not get download link'); return }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div id="documents" className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Documents</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {docs.length === 0 ? 'No files attached yet' : `${docs.length} file${docs.length === 1 ? '' : 's'} on file`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setUploadError(null); setOpen(true) }}
          className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
        >
          + Upload document
        </button>
      </div>

      {listError && (
        <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{listError}</div>
      )}

      {docs.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          Upload COAs, spec sheets, allergen statements, certification certificates, etc.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left py-2 px-5 font-medium">Filename</th>
              <th className="text-left py-2 px-3 font-medium w-[140px]">Type</th>
              <th className="text-left py-2 px-3 font-medium w-[80px]">Size</th>
              <th className="text-left py-2 px-3 font-medium w-[120px]">Expires</th>
              <th className="text-left py-2 px-3 font-medium w-[170px]">Uploaded</th>
              <th className="w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {docs.map((d) => {
              const type = TYPE_BY_VALUE.get(d.doc_type)
              const expired = isExpired(d.expires_at)
              return (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5 px-5">
                    <button
                      type="button"
                      onClick={() => onDownload(d)}
                      className="text-gray-900 hover:underline text-left flex items-center gap-2"
                    >
                      <span className="text-gray-400">📄</span>
                      {d.file_name}
                    </button>
                    {d.notes && <div className="text-[11px] text-gray-500 mt-0.5">{d.notes}</div>}
                  </td>
                  <td className="py-2.5 px-3">
                    {type
                      ? <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${type.chip}`}>{type.label}</span>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 tabular-nums">{fmtBytes(d.size_bytes)}</td>
                  <td className="py-2.5 px-3">
                    {d.expires_at
                      ? (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${expired ? 'bg-red-100 text-red-800' : 'text-gray-600'}`}>
                          {expired ? `Expired ${fmtDate(d.expires_at)}` : fmtDate(d.expires_at)}
                        </span>
                      )
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 text-[12px]">
                    {d.uploaded_by_name ?? 'Unknown'} · {fmtDate(d.uploaded_at)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onDelete(d)}
                      className="text-gray-400 hover:text-red-700 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Upload modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold">Upload document</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Attach a file to <span className="font-semibold">{ingredientName}</span></p>
            </div>

            <form action={onUpload} className="px-5 py-4 space-y-3 text-sm">
              <input type="hidden" name="ingredient_id" value={ingredientId} />

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">File <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  name="file"
                  required
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  className="w-full text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">PDF · DOCX · XLSX · PNG · JPG · max 10 MB</p>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Document type <span className="text-red-500">*</span></label>
                <select name="doc_type" required defaultValue="" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white">
                  <option value="" disabled>— Select type —</option>
                  {INGREDIENT_DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.long}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Expires (optional)</label>
                  <input type="date" name="expires_at" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  <p className="text-[10px] text-gray-500 mt-0.5">Flagged red once past</p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Notes (optional)</label>
                  <input type="text" name="notes" maxLength={160} placeholder="e.g. Batch 20251104" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                </div>
              </div>

              {uploadError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{uploadError}</div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50">
                  {pending ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
