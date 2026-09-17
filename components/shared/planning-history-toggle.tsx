'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

interface Props {
  isHistory: boolean
  /** Label of the first month history opens back to, e.g. 'Apr 26'. */
  fromLabel: string
}

/**
 * Toggles the closed months back into view (?history=fy) on the planning
 * screens. It only changes the URL — the completed-month setting, and what
 * everyone else sees, is untouched. Past months render read-only.
 */
export function PlanningHistoryToggle({ isHistory, fromLabel }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const params = new URLSearchParams(searchParams.toString())
  if (isHistory) params.delete('history')
  else params.set('history', 'fy')
  const qs = params.toString()

  return (
    <Link
      href={`${pathname}${qs ? `?${qs}` : ''}`}
      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border ${
        isHistory
          ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
      title={isHistory
        ? 'Back to the current planning window'
        : `Show completed months back to ${fromLabel} (read-only)`}
    >
      {isHistory ? '↩ Current window' : `📅 Show from ${fromLabel}`}
    </Link>
  )
}
