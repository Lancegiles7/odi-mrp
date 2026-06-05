'use client'

import { useRouter } from 'next/navigation'
import { ENHANCEMENT_CATEGORIES } from '@/lib/constants'

/**
 * Tiny client-side wrappers for the sort + category dropdowns on the
 * enhancements list page. On change they push to a URL that preserves
 * the other filter params.
 */

function buildUrl(params: { status: string; category: string; sort: string }): string {
  const p = new URLSearchParams()
  if (params.status)   p.set('status',   params.status)
  if (params.category) p.set('category', params.category)
  if (params.sort)     p.set('sort',     params.sort)
  const qs = p.toString()
  return qs ? `/enhancements?${qs}` : '/enhancements'
}

export function SortPicker({ current, statusFilter, categoryFilter }: { current: string; statusFilter: string; categoryFilter: string }) {
  const router = useRouter()
  return (
    <select
      defaultValue={current || 'newest'}
      onChange={(e) => router.push(buildUrl({ status: statusFilter, category: categoryFilter, sort: e.target.value }))}
      className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white"
    >
      <option value="newest">Sort: Newest</option>
      <option value="updated">Last updated</option>
      <option value="priority">Priority (high → low)</option>
    </select>
  )
}

export function CategoryPicker({ current, statusFilter, sort }: { current: string; statusFilter: string; sort: string }) {
  const router = useRouter()
  return (
    <select
      defaultValue={current}
      onChange={(e) => router.push(buildUrl({ status: statusFilter, category: e.target.value, sort }))}
      className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white"
    >
      <option value="">All categories</option>
      {ENHANCEMENT_CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  )
}
