import type { Metadata } from 'next'
import Link from 'next/link'
import { listShipments, type ShipmentListRow } from '@/lib/shipments'
import { NewShipmentButton } from '@/components/shipments/new-shipment-button'
import { RouteFlags, StatusPill, fmtDate } from '@/components/shipments/shipment-bits'

export const metadata: Metadata = { title: 'Shipments' }

export default async function ShipmentsPage() {
  const shipments = await listShipments()

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Shipments</h1>
          <p className="text-sm text-gray-500 mt-1">Book a freight movement once, then load transfer orders onto it. The shipment owns the depart / arrive dates.</p>
        </div>
        <NewShipmentButton />
      </div>

      {shipments.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-gray-500">
          No shipments yet. Create one with <span className="font-medium">+ New shipment</span>, then load transfers onto it (from here or the Create‑transfer dialog on Production).
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="text-left font-semibold px-4 py-2.5">Shipment</th>
                <th className="text-left font-semibold px-3 py-2.5">Route</th>
                <th className="text-left font-semibold px-3 py-2.5">Depart</th>
                <th className="text-left font-semibold px-3 py-2.5">Arrive</th>
                <th className="text-left font-semibold px-3 py-2.5">Status</th>
                <th className="text-right font-semibold px-3 py-2.5">Transfers</th>
                <th className="text-right font-semibold px-4 py-2.5">Units</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s: ShipmentListRow) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/shipments/${s.id}`} className="font-semibold text-emerald-800 hover:underline">{s.shipment_number}</Link>
                  </td>
                  <td className="px-3 py-2.5"><RouteFlags direction={s.direction} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(s.depart_date)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(s.arrive_date)}</td>
                  <td className="px-3 py-2.5"><StatusPill status={s.status} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.transfer_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{s.total_units.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
