'use client'

import { useRouter } from 'next/navigation'
import { fyLabel, shortMonth } from '@/lib/budget-vs-actual'

export function MonthSelector({
  fyStart, month, months, tab,
}: {
  fyStart: string; month: string; months: string[]; tab: string
}) {
  const router = useRouter()

  function go(newMonth: string) {
    router.push(`/reporting/budget-vs-actual?fy=${fyStart}&month=${newMonth}&tab=${tab}`)
  }

  return (
    <div className="flex gap-2">
      <select disabled className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-gray-50 text-gray-700">
        <option value={fyStart}>{fyLabel(fyStart)} (current)</option>
      </select>
      <select
        value={month}
        onChange={(e) => go(e.target.value)}
        className="text-xs border border-gray-300 rounded px-2 py-1.5"
      >
        {months.map((m) => <option key={m} value={m}>{shortMonth(m)}</option>)}
      </select>
    </div>
  )
}
