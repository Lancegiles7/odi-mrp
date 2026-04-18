import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PO_STATUS } from '@/lib/constants'
import { isLowStock } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default async function DashboardPage() {
  const supabase = createClient()

  // Fetch summary counts in parallel
  const [
    { count: productCount },
    { count: ingredientCount },
    { count: openPoCount },
    { data: inventoryData },
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),

    supabase
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),

    supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', [PO_STATUS.DRAFT, PO_STATUS.SUBMITTED, PO_STATUS.PARTIALLY_RECEIVED]),

    supabase
      .from('inventory_balances')
      .select('quantity_on_hand, ingredients(reorder_point)'),
  ])

  const lowStockCount = (inventoryData ?? []).filter((row) => {
    const reorderPoint = (row.ingredients as { reorder_point: number | null } | null)
      ?.reorder_point ?? null
    return isLowStock(row.quantity_on_hand, reorderPoint)
  }).length

  const stats = [
    { label: 'Active Products',      value: productCount ?? 0 },
    { label: 'Active Ingredients',   value: ingredientCount ?? 0 },
    { label: 'Open Purchase Orders', value: openPoCount ?? 0 },
    {
      label: 'Low Stock Alerts',
      value: lowStockCount,
      highlight: lowStockCount > 0,
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your manufacturing operations
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`bg-white rounded-lg border p-5 ${
              stat.highlight
                ? 'border-amber-300 bg-amber-50'
                : 'border-gray-200'
            }`}
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p
              className={`text-3xl font-semibold mt-1 ${
                stat.highlight ? 'text-amber-700' : 'text-gray-900'
              }`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Placeholder panels — will be filled in Phase 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-900 mb-3">
            Recent Purchase Orders
          </h2>
          <p className="text-sm text-gray-400">
            Will show the most recent open purchase orders. Coming in Phase 3.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-900 mb-3">
            Low Stock Ingredients
          </h2>
          <p className="text-sm text-gray-400">
            Will show ingredients at or below their reorder point. Coming in Phase 4.
          </p>
        </div>
      </div>
    </div>
  )
}
