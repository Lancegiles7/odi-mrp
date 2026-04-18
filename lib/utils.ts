import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely — used by shadcn/ui components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a date string or Date object for display (e.g. "12 Jan 2024"). */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

/** Format a datetime string for display (e.g. "12 Jan 2024, 14:30"). */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

/** Format a numeric quantity, optionally with unit suffix. */
export function formatQuantity(
  quantity: number | null | undefined,
  unit?: string | null
): string {
  if (quantity === null || quantity === undefined) return '—'
  const formatted = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(quantity)
  return unit ? `${formatted} ${unit}` : formatted
}

/** Format a number as NZD currency. */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(amount)
}

/**
 * Generate a sequential PO number string.
 * Format: PO-YYYY-NNNN (e.g. PO-2024-0042)
 *
 * NOTE: In production, the sequence number should come from the database
 * to guarantee uniqueness under concurrent requests. This helper is for
 * client-side preview only — the server action should generate the final value.
 */
export function formatPoNumber(year: number, sequence: number): string {
  return `PO-${year}-${String(sequence).padStart(4, '0')}`
}

/** Convert a role slug to a readable label (e.g. "supply_chain" → "Supply Chain"). */
export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Returns true if a quantity is at or below the reorder point. */
export function isLowStock(
  quantityOnHand: number,
  reorderPoint: number | null | undefined
): boolean {
  if (reorderPoint === null || reorderPoint === undefined) return false
  return quantityOnHand <= reorderPoint
}
