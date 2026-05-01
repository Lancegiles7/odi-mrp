import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { POForm } from '@/components/purchase-orders/po-form'
import { generatePoNumber } from '@/app/(dashboard)/purchase-orders/actions'

export const metadata: Metadata = { title: 'New purchase order' }

export default async function NewPurchaseOrderPage() {
  const supabase = createClient()

  const [{ data: suppliers }, { data: ingredients }, { data: products }] = await Promise.all([
    supabase.from('suppliers')
      .select('id, name, payment_terms, email, phone')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; name: string; payment_terms: string | null; email: string | null; phone: string | null }> | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; unit_of_measure: string | null }> | null }>,
    supabase.from('products')
      .select('id, sku_code, name')
      .is('deleted_at', null)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>,
  ])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const poNumber = await generatePoNumber()

  return (
    <POForm
      mode="new"
      initialPoNumber={poNumber}
      initialSupplierId=""
      initialOrderDate={todayStr}
      initialExpected={null}
      initialNotes={null}
      initialLines={[]}
      status="draft"
      suppliers={suppliers ?? []}
      ingredients={ingredients ?? []}
      products={products ?? []}
    />
  )
}
