import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Purchase orders' }

interface POListRow {
  id: string
  po_number: string
  status: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'
  order_date: string
  expected_delivery_date: string | null
  supplier_id: string
  market: string | null
}

interface PageProps {
  searchParams: { status?: string; supplier?: string }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  partially_received: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
}

const STATUS_CLS: Record<string, string> = {
  draft:              'bg-gray-100 text-gray-600',
  submitted:          'bg-blue-100 text-blue-700',
  partially_received: 'bg-amber-100 text-amber-800',
  received:           'bg-emerald-100 text-emerald-700',
  cancelled:          'bg-gray-100 text-gray-500 line-through',
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day))
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export default async function PurchaseOrdersPage({ searchParams }: PageProps) {
  const supabase = createClient()

  const [{ data: pos }, { data: suppliers }, { data: lines }] = await Promise.all([
    supabase.from('purchase_orders')
      .select('id, po_number, status, order_date, expected_delivery_date, supplier_id, market')
      .order('po_number', { ascending: false }) as unknown as Promise<{ data: POListRow[] | null }>,
    supabase.from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; name: string }> | null }>,
    supabase.from('purchase_order_lines')
      .select('purchase_order_id, quantity_ordered, unit_cost, ingredient_id, product_id, description') as unknown as Promise<{ data: Array<{
        purchase_order_id: string; quantity_ordered: number; unit_cost: number | null
        ingredient_id: string | null; product_id: string | null; description: string | null
      }> | null }>,
  ])

  const allPos = pos ?? []
  const supplierById = new Map((suppliers ?? []).map((s) => [s.id, s.name]))

  // Aggregate line counts and totals per PO
  const linesByPo = new Map<string, { count: number; total: number }>()
  for (const l of lines ?? []) {
    const cur = linesByPo.get(l.purchase_order_id) ?? { count: 0, total: 0 }
    cur.count += 1
    if (l.unit_cost != null) cur.total += Number(l.unit_cost) * Number(l.quantity_ordered)
    linesByPo.set(l.purchase_order_id, cur)
  }

  const filterStatus   = searchParams.status   ?? 'all'
  const filterSupplier = searchParams.supplier ?? 'all'
  const filtered = allPos.filter((p) =>
    (filterStatus === 'all'   || p.status === filterStatus) &&
    (filterSupplier === 'all' || p.supplier_id === filterSupplier),
  )

  // Derived stats
  const totalCount = allPos.length
  const awaitingCount = allPos.filter((p) => p.status === 'submitted').length
  const partialCount  = allPos.filter((p) => p.status === 'partially_received').length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Purchase orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} POs · {awaitingCount} awaiting receipt{partialCount > 0 ? ` · ${partialCount} partial` : ''}
          </p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
        >
          + New PO
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
        <span className="text-xs text-gray-500">Filter:</span>
        <form className="flex items-center gap-2" action="/purchase-orders" method="get">
          <select name="status" defaultValue={filterStatus} className="text-xs border border-gray-300 rounded-md px-2 py-1.5">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="partially_received">Partial</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select name="supplier" defaultValue={filterSupplier} className="text-xs border border-gray-300 rounded-md px-2 py-1.5">
            <option value="all">All suppliers</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="text-xs px-2 py-1.5 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200">Apply</button>
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No purchase orders match this filter. Click <span className="font-medium">+ New PO</span> to create one.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2 font-medium w-[120px]">PO #</th>
                <th className="text-left px-4 py-2 font-medium">Supplier</th>
                <th className="text-right px-3 py-2 font-medium w-[60px]">Lines</th>
                <th className="text-right px-3 py-2 font-medium w-[110px]">Total</th>
                <th className="text-left px-3 py-2 font-medium w-[110px]">Status</th>
                <th className="text-left px-3 py-2 font-medium w-[100px]">Order date</th>
                <th className="text-left px-3 py-2 font-medium w-[100px]">Expected</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const stats = linesByPo.get(p.id) ?? { count: 0, total: 0 }
                return (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">
                      <Link href={`/purchase-orders/${p.id}`} className="hover:underline text-gray-900">{p.po_number}</Link>
                      {p.market === 'AU' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-sans">AU</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{supplierById.get(p.supplier_id) ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{stats.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {stats.total > 0 ? `$${stats.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{fmtDate(p.order_date)}</td>
                    <td className="px-3 py-2 text-gray-700">{fmtDate(p.expected_delivery_date)}</td>
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
