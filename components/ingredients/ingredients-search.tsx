'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { PRODUCT_GROUPS, INGREDIENT_CATEGORIES } from '@/lib/constants'

const STATUS_OPTIONS = [
  { value: '',          label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed'    },
  { value: 'at_risk',   label: 'At risk'      },
  { value: 'pending',   label: 'Pending'      },
  { value: 'inactive',  label: 'Inactive'     },
]

const GROUP_OPTIONS = [
  { value: '',         label: 'All ingredients' },
  { value: 'active',   label: 'Used by active products only' },
  { value: 'unused',   label: 'Not used in any BOM' },
  // Separator handled in render
  ...PRODUCT_GROUPS.map((g) => ({ value: g.value, label: g.label })),
]

interface IngredientsSearchProps {
  defaultSearch: string
  defaultStatus: string
  defaultGroup:  string
  defaultCategory: string
}

export function IngredientsSearch({ defaultSearch, defaultStatus, defaultGroup, defaultCategory }: IngredientsSearchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="flex gap-3 flex-wrap items-end">
      <div className="flex-1 min-w-[280px]">
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Search</label>
        <input
          type="search"
          placeholder="SKU, ingredient name, or supplier name…"
          defaultValue={defaultSearch}
          onChange={(e) => updateParams('q', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Status</label>
        <select
          defaultValue={defaultStatus}
          onChange={(e) => updateParams('status', e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Category</label>
        <select
          defaultValue={defaultCategory}
          onChange={(e) => updateParams('category', e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          <option value="">All categories</option>
          {INGREDIENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Used in products</label>
        <select
          defaultValue={defaultGroup}
          onChange={(e) => updateParams('group', e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white min-w-[220px]"
        >
          <option value="">All ingredients</option>
          <option value="active">Used by active products only</option>
          <option value="unused">Not used in any BOM</option>
          <optgroup label="By product group">
            {PRODUCT_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </optgroup>
        </select>
      </div>
    </div>
  )
}
