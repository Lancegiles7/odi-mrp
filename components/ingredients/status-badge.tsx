import { cn } from '@/lib/utils'
import type { IngredientStatus } from '@/lib/types/database.types'

const CONFIG: Record<IngredientStatus, { label: string; className: string }> = {
  confirmed: {
    label: 'Confirmed',
    className: 'bg-green-100 text-green-700',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-700',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-gray-100 text-gray-500',
  },
}

export function StatusBadge({ status }: { status: IngredientStatus }) {
  const config = CONFIG[status] ?? CONFIG.confirmed
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.className
      )}
    >
      {config.label}
    </span>
  )
}
