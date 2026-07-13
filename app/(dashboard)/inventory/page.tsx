import { redirect } from 'next/navigation'

// Stock Levels was folded into Stock Movements — keep old links working.
export default function InventoryPage() {
  redirect('/stock-movements')
}
