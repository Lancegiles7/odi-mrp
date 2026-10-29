'use client'

import { useEffect, useState } from 'react'
import { fetchUploadChanges, saveUploadNote } from '@/app/(dashboard)/demand/actions'
import type { DemandUpload, DemandUploadDiff } from '@/lib/demand-uploads'

function fmtWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true }),
  }
}

function Delta({ delta, isNew }: { delta: number; isNew: boolean }) {
  if (delta === 0) return <span className="text-gray-400">—</span>
  const up = delta > 0
  return (
    <span className={up ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
      {up ? '+' : '−'}{Math.abs(delta).toLocaleString()} {up ? '▲' : '▼'}{isNew ? ' new' : ''}
    </span>
  )
}

export function DemandUploadPanel({ uploads }: { uploads: DemandUpload[] }) {
  const [open, setOpen] = useState(false)
  const latest = uploads[0] ?? null

  if (!latest) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500">
        No forecast uploads recorded yet — the next <span className="font-medium">Import XLSX</span> will start the trail.
      </div>
    )
  }

  const { date, time } = fmtWhen(latest.uploaded_at)

  return (
    <div className="space-y-3">
      {/* ── Stamp ───────────────────────────────────────────── */}
      <div className="rounded-lg bg-emerald-900 text-emerald-50 px-4 py-3 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,0.25)] flex-none" />
        <div className="min-w-0">
          <div className="font-semibold text-[15px]">Forecast last updated&nbsp; {date}, {time}</div>
          <div className="text-xs text-emerald-200/90 truncate">
            {latest.file_name ?? 'file not recorded'}
            {latest.fiscal_years.length > 0 && <> · {latest.fiscal_years.join(' · ')}</>}
            {latest.uploaded_by_name && <> · by {latest.uploaded_by_name}</>}
            {' '}· {latest.cells_changed.toLocaleString()} figures changed
          </div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto flex-none text-xs border border-emerald-600 rounded-md px-3 py-1.5 hover:bg-emerald-800 whitespace-nowrap"
        >
          {open ? 'Hide history ↑' : 'View history & changes ↓'}
        </button>
      </div>

      {open && <HistoryAndDiff uploads={uploads} />}
    </div>
  )
}

function HistoryAndDiff({ uploads }: { uploads: DemandUpload[] }) {
  const [selectedId, setSelectedId] = useState<string>(uploads[0].id)
  const [diff, setDiff] = useState<DemandUploadDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  async function select(id: string) {
    setSelectedId(id)
    setLoading(true)
    try {
      setDiff(await fetchUploadChanges(id))
    } finally {
      setLoading(false)
    }
  }

  // Load the most recent upload's changes once, when the panel opens.
  useEffect(() => { void select(uploads[0].id) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIdx = uploads.findIndex((u) => u.id === selectedId)
  const prior = selectedIdx >= 0 ? uploads[selectedIdx + 1] : undefined
  const selected = uploads[selectedIdx]

  const filtered = (diff?.changes ?? []).filter((c) => {
    if (!filter.trim()) return true
    const q = filter.toLowerCase()
    return c.product_name.toLowerCase().includes(q)
      || c.channel_label.toLowerCase().includes(q)
      || c.month_label.toLowerCase().includes(q)
  })

  function exportCsv() {
    const rows = [['Product', 'Channel', 'Month', 'Was', 'Now', 'Change'],
      ...filtered.map((c) => [c.product_name, c.channel_label, c.month_label,
        c.old_units ?? '', c.new_units, c.delta])]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `forecast-changes-${selected?.file_name ?? selectedId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // group filtered changes by product for display
  const groups: Array<{ product: string; items: typeof filtered }> = []
  for (const c of filtered) {
    let g = groups[groups.length - 1]
    if (!g || g.product !== c.product_name) { g = { product: c.product_name, items: [] }; groups.push(g) }
    g.items.push(c)
  }

  return (
    <div className="space-y-4">
      {/* history table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] uppercase font-semibold tracking-wide text-gray-500">
          Upload history
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-gray-500">
              <th className="text-left font-semibold px-4 py-2">When</th>
              <th className="text-left font-semibold px-3 py-2">File</th>
              <th className="text-left font-semibold px-3 py-2">Years</th>
              <th className="text-right font-semibold px-3 py-2">Changed</th>
              <th className="text-left font-semibold px-3 py-2">Note</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((u) => {
              const w = fmtWhen(u.uploaded_at)
              const isSel = u.id === selectedId
              return (
                <tr key={u.id} className={`border-t border-gray-100 ${isSel ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2.5 whitespace-nowrap align-top">
                    {w.date}<br /><span className="text-xs text-gray-500">{w.time}{u.uploaded_by_name ? ` · ${u.uploaded_by_name}` : ''}</span>
                  </td>
                  <td className="px-3 py-2.5 align-top font-medium text-gray-800">{u.file_name ?? '—'}</td>
                  <td className="px-3 py-2.5 align-top">
                    <span className="flex flex-wrap gap-1">
                      {u.fiscal_years.map((fy) => (
                        <span key={fy} className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{fy}</span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums font-semibold">{u.cells_changed.toLocaleString()}</td>
                  <td className="px-3 py-2.5 align-top w-48"><NoteCell uploadId={u.id} note={u.note} /></td>
                  <td className="px-3 py-2.5 align-top text-right">
                    {isSel
                      ? <span className="text-[11px] bg-emerald-700 text-white rounded px-2 py-0.5 font-semibold">viewing</span>
                      : <button onClick={() => select(u.id)} className="text-emerald-700 font-medium text-xs hover:underline">view changes</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* diff */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase font-semibold tracking-wide text-gray-500">What changed</span>
          <span className="text-xs text-gray-500">
            {selected && fmtWhen(selected.uploaded_at).date}
            {prior ? <> compared with {fmtWhen(prior.uploaded_at).date}</> : <> (first recorded upload)</>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter product / channel / month"
              className="text-xs border border-gray-300 rounded px-2 py-1 w-56"
            />
            <button onClick={exportCsv} disabled={filtered.length === 0}
              className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40">
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading changes…</div>
        ) : !diff || diff.changes.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No figures moved in this upload.</div>
        ) : (
          <div className="p-4 space-y-4">
            {/* tiles */}
            <div className="grid grid-cols-4 gap-3">
              <Tile n={diff.productsChanged.toLocaleString()} label="products changed" />
              <Tile n={`+${diff.unitsAdded.toLocaleString()}`} label="units added" tone="up" />
              <Tile n={`−${diff.unitsRemoved.toLocaleString()}`} label="units removed" tone="down" />
              <Tile n={`${diff.netChange >= 0 ? '+' : '−'}${Math.abs(diff.netChange).toLocaleString()}`} label="net change" />
            </div>

            {/* detail */}
            <div className="border border-gray-100 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                    <th className="text-left font-semibold px-3 py-2">Product · channel</th>
                    <th className="text-right font-semibold px-3 py-2">Month</th>
                    <th className="text-right font-semibold px-3 py-2">Was</th>
                    <th className="text-right font-semibold px-3 py-2">Now</th>
                    <th className="text-right font-semibold px-3 py-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <FragmentGroup key={g.product} product={g.product} items={g.items} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">▲ increase · ▼ decrease — direction only, not good/bad.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function FragmentGroup({ product, items }: { product: string; items: DemandUploadDiff['changes'] }) {
  return (
    <>
      <tr><td colSpan={5} className="px-3 py-1.5 bg-emerald-50/60 font-semibold text-emerald-900 text-[13px]">{product}</td></tr>
      {items.map((c, i) => (
        <tr key={i} className="border-t border-gray-50">
          <td className="px-3 py-1.5 text-gray-700">{c.channel_label}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{c.month_label}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{c.old_units ?? '—'}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{c.new_units.toLocaleString()}</td>
          <td className="px-3 py-1.5 text-right tabular-nums"><Delta delta={c.delta} isNew={c.old_units === null} /></td>
        </tr>
      ))}
    </>
  )
}

function Tile({ n, label, tone }: { n: string; label: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'text-emerald-700' : tone === 'down' ? 'text-red-700' : 'text-emerald-900'
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{n}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}

function NoteCell({ uploadId, note }: { uploadId: string; note: string | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note ?? '')
  const [saved, setSaved] = useState(note)

  async function save() {
    setEditing(false)
    const trimmed = value.trim()
    setSaved(trimmed || null)
    await saveUploadNote(uploadId, trimmed)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(saved ?? ''); setEditing(false) } }}
        maxLength={200}
        className="w-full text-xs border border-gray-300 rounded px-1.5 py-1"
      />
    )
  }
  return (
    <button onClick={() => setEditing(true)} className="text-left w-full group">
      {saved
        ? <span className="text-xs text-gray-600 italic">“{saved}”</span>
        : <span className="text-xs text-gray-400 group-hover:text-gray-600">+ add note</span>}
    </button>
  )
}
