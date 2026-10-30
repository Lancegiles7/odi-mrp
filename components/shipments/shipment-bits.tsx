import type { ShipmentDirection, ShipmentStatus } from '@/lib/shipments'

export const DIRECTION_LABEL: Record<ShipmentDirection, string> = {
  AU_TO_NZ: 'Australia → New Zealand',
  NZ_TO_AU: 'New Zealand → Australia',
}

export function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Flag({ c }: { c: 'NZ' | 'AU' }) {
  return <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${c === 'AU' ? 'bg-sky-100 text-sky-800' : 'bg-gray-900 text-white'}`}>{c}</span>
}

export function RouteFlags({ direction }: { direction: ShipmentDirection }) {
  const [from, to]: ['NZ' | 'AU', 'NZ' | 'AU'] = direction === 'AU_TO_NZ' ? ['AU', 'NZ'] : ['NZ', 'AU']
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <Flag c={from} /> <span className="text-emerald-700 font-bold">→</span> <Flag c={to} />
    </span>
  )
}

const STATUS_STYLE: Record<ShipmentStatus, string> = {
  planned:   'bg-gray-100 text-gray-600',
  departed:  'bg-blue-50 text-blue-700',
  arrived:   'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-600',
}

export function StatusPill({ status }: { status: ShipmentStatus }) {
  return <span className={`text-[10.5px] font-semibold rounded-full px-2.5 py-0.5 ${STATUS_STYLE[status]}`}>{status[0].toUpperCase() + status.slice(1)}</span>
}
