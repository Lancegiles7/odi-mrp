'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Props {
  value: string
  options: string[]
  unassignedKey: string
}

/**
 * Manufacturer filter on the Production "view all" table.
 * Updates ?manufacturer=... on change and pushes the new URL so the
 * server component re-renders.
 */
export function ManufacturerFilter({ value, options, unassignedKey }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', 'all')
    if (e.target.value === 'all') params.delete('manufacturer')
    else params.set('manufacturer', e.target.value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={value}
      onChange={onChange}
      className="px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white"
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {m === 'all' ? 'All manufacturers' : m === unassignedKey ? 'Not set' : m}
        </option>
      ))}
    </select>
  )
}
