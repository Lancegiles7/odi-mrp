import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getShipment, listAssignableTransfers } from '@/lib/shipments'
import { ShipmentDetail } from '@/components/shipments/shipment-detail'

export const metadata: Metadata = { title: 'Shipment' }

export default async function ShipmentDetailPage({ params }: { params: { id: string } }) {
  const [shipment, assignable] = await Promise.all([
    getShipment(params.id),
    listAssignableTransfers(),
  ])
  if (!shipment) notFound()

  return (
    <div className="space-y-5">
      <Link href="/shipments" className="text-xs text-gray-500 hover:underline">← All shipments</Link>
      <ShipmentDetail shipment={shipment} assignable={assignable} />
    </div>
  )
}
