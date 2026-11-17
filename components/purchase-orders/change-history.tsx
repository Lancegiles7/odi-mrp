import { createClient } from '@/lib/supabase/server'
import { loadPoChangeLog, type PoLogEntry } from '@/lib/po-change-log'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${time}`
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', partially_received: 'Partially received', received: 'Received', cancelled: 'Cancelled',
}
const label = (v: string | null) => (v == null ? null : STATUS_LABEL[v] ?? v)

const ACTION_BADGE: Record<PoLogEntry['action'], { text: string; cls: string }> = {
  created:  { text: 'Created',  cls: 'bg-emerald-100 text-emerald-700' },
  amended:  { text: 'Amended',  cls: 'bg-amber-100 text-amber-700' },
  status:   { text: 'Status',   cls: 'bg-sky-100 text-sky-700' },
  deleted:  { text: 'Deleted',  cls: 'bg-rose-100 text-rose-700' },
}

// Change history for a single PO / transfer — who amended it, when, and the
// old → new value of each field. Renders nothing until the first logged change.
export async function ChangeHistory({ poId }: { poId: string }) {
  const supabase = createClient()
  const entries = await loadPoChangeLog(supabase, poId)
  if (!entries.length) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold">Change history</h2>
        <p className="text-xs text-gray-500 mt-0.5">Every amendment to this order — who made it, when, and what changed.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Who</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Field</th>
              <th className="text-left px-3 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const badge = ACTION_BADGE[e.action]
              const isStatus = e.action === 'status'
              const oldV = isStatus ? label(e.old_value) : e.old_value
              const newV = isStatus ? label(e.new_value) : e.new_value
              return (
                <tr key={e.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{fmtWhen(e.changed_at)}</td>
                  <td className="px-3 py-2 font-medium">{e.changed_by_name || <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2"><span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.text}</span></td>
                  <td className="px-3 py-2 text-gray-700">{e.field || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2">
                    {e.action === 'amended'
                      ? <span className="tabular-nums">
                          <span className="text-gray-400 line-through decoration-gray-300">{oldV ?? '∅'}</span>
                          <span className="mx-1.5 text-gray-400">→</span>
                          <span className="font-medium text-gray-900">{newV ?? '∅'}</span>
                        </span>
                      : <span className="text-gray-700">{newV ?? (oldV ? `was ${oldV}` : '—')}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
