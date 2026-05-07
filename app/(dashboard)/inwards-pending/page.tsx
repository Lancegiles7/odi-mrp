import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Inwards Pending' }

interface POPendingRow {
  id: string
  po_number: string
  status: 'submitted' | 'partially_received'
  expected_delivery_date: string | null
  supplier_id: string
}

interface POLine {
  purchase_order_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number | null
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const target = new Date(d.slice(0, 10) + 'T00:00:00Z').getTime()
  const today  = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((target - today) / (24 * 60 * 60 * 1000))
}

export default async function InwardsPendingPage() {
  const supabase = createClient()

  const [{ data: pos }, { data: lines }, { data: suppliers }] = await Promise.all([
    supabase.from('purchase_orders')
      .select('id, po_number, status, expected_delivery_date, supplier_id')
      .in('status', ['submitted', 'partially_received'])
      .order('expected_delivery_date', { ascending: true, nullsFirst: false }) as unknown as Promise<{ data: POPendingRow[] | null }>,
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, quantity_ordered, quantity_received, unit_cost') as unknown as Promise<{ data: POLine[] | null }>,
    supabase.from('suppliers')
      .select('id, name') as unknown as Promise<{ data: Array<{ id: string; name: string }> | null }>,
  ])

  const allPos = pos ?? []
  const supplierById = new Map((suppliers ?? []).map((s) => [s.id, s.name]))

  // Per-PO outstanding totals = remaining qty × unit cost
  const outstandingByPo = new Map<string, { lines: number; outstanding: number }>()
  for (const l of lines ?? []) {
    const cur = outstandingByPo.get(l.purchase_order_id) ?? { lines: 0, outstanding: 0 }
    cur.lines += 1
    const remaining = Math.max(0, Number(l.quantity_ordered) - Number(l.quantity_received))
    if (l.unit_cost != null) cur.outstanding += remaining * Number(l.unit_cost)
    outstandingByPo.set(l.purchase_order_id, cur)
  }

  // Tiles
  const submittedCount = allPos.filter((p) => p.status === 'submitted').length
  const partialCount   = allPos.filter((p) => p.status === 'partially_received').length
  const totalOutstanding = Array.from(outstandingByPo.values()).reduce((s, x) => s + x.outstanding, 0)

  let overdueCount = 0
  let thisWeekCount = 0
  for (const p of allPos) {
    const d = daysUntil(p.expected_delivery_date)
    if (d == null) continue
    if (d < 0) overdueCount++
    else if (d <= 7) thisWeekCount++
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Inwards Pending</h1>
        <p className="text-sm text-gray-500 mt-1">
          POs awaiting receipt — what&rsquo;s expected to arrive. Click <b>Receive</b> to record a receipt and update SOH.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-[11px] uppercase font-semibold text-blue-700">Awaiting receipt</div>
          <div className="text-lg font-semibold text-blue-900">{submittedCount} {submittedCount === 1 ? 'PO' : 'POs'}</div>
          <div className="text-[11px] text-blue-700">${Math.round(totalOutstanding).toLocaleString()} outstanding</div>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="text-[11px] uppercase font-semibold text-amber-700">Partial</div>
          <div className="text-lg font-semibold text-amber-900">{partialCount} {partialCount === 1 ? 'PO' : 'POs'}</div>
          <div className="text-[11px] text-amber-700">part-received, more to come</div>
        </div>
        <div className={`p-3 rounded-md border ${overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className={`text-[11px] uppercase font-semibold ${overdueCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>Overdue</div>
          <div className={`text-lg font-semibold ${overdueCount > 0 ? 'text-red-800' : 'text-gray-900'}`}>{overdueCount}</div>
          <div className={`text-[11px] ${overdueCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>past expected date</div>
        </div>
        <div className="p-3 bg-white border border-gray-200 rounded-md">
          <div className="text-[11px] uppercase font-semibold text-gray-500">Arriving this week</div>
          <div className="text-lg font-semibold text-gray-900">{thisWeekCount}</div>
          <div className="text-[11px] text-gray-500">expected within 7 days</div>
        </div>
      </div>

      {allPos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No POs awaiting receipt. Submit a PO from the <Link href="/purchase-orders" className="text-blue-600 underline">Purchase orders</Link> page.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2 font-medium w-[110px]">PO #</th>
                <th className="text-left px-4 py-2 font-medium">Supplier</th>
                <th className="text-right px-3 py-2 font-medium w-[60px]">Lines</th>
                <th className="text-right px-3 py-2 font-medium w-[110px]">Outstanding</th>
                <th className="text-left px-3 py-2 font-medium w-[110px]">Status</th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">Expected</th>
                <th className="text-right px-3 py-2 font-medium w-[120px]"></th>
              </tr>
            </thead>
            <tbody>
              {allPos.map((p) => {
                const stats = outstandingByPo.get(p.id) ?? { lines: 0, outstanding: 0 }
                const d = daysUntil(p.expected_delivery_date)
                const overdue = d != null && d < 0
                const soon    = d != null && d >= 0 && d <= 7
                return (
                  <tr key={p.id} className={`border-t border-gray-100 hover:bg-gray-50 ${overdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2 font-mono">
                      <Link href={`/purchase-orders/${p.id}`} className="hover:underline text-gray-900">{p.po_number}</Link>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{supplierById.get(p.supplier_id) ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{stats.lines}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {stats.outstanding > 0 ? `$${stats.outstanding.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>
                        {p.status === 'submitted' ? 'Submitted' : 'Partial'}
                      </span>
                    </td>
                    <td className={`px-3 py-2 ${overdue ? 'text-red-700 font-medium' : soon ? 'text-amber-800' : 'text-gray-700'}`}>
                      {fmtDate(p.expected_delivery_date)}
                      {overdue && d != null && <span className="ml-1 text-[10px]">· overdue {Math.abs(d)} d</span>}
                      {soon    && d != null && !overdue && <span className="ml-1 text-[10px]">· in {d} d</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/purchase-orders/${p.id}/receive`}
                        className="inline-block px-2 py-1 text-[11px] bg-emerald-700 text-white rounded hover:bg-emerald-800"
                      >
                        📦 Receive
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
