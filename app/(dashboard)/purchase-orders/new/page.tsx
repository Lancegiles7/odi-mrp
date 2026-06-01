import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { POForm } from '@/components/purchase-orders/po-form'
import { generatePoNumber } from '@/app/(dashboard)/purchase-orders/actions'

export const metadata: Metadata = { title: 'New purchase order' }

export default async function NewPurchaseOrderPage() {
  const supabase = createClient()

  const [{ data: suppliers }, { data: ingredients }, { data: products }, { data: packaging }, { data: addresses }, { data: issuers }, { data: companies }] = await Promise.all([
    supabase.from('suppliers')
      .select('id, name, payment_terms, email, phone, currency')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; name: string; payment_terms: string | null; email: string | null; phone: string | null; currency: string | null }> | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure, supplier_sku_code, supplier_pack_size, supplier_pack_unit, price, currency')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; unit_of_measure: string | null; supplier_sku_code: string | null; supplier_pack_size: number | null; supplier_pack_unit: string | null; price: number | null; currency: string | null }> | null }>,
    supabase.from('products')
      .select('id, sku_code, name')
      .is('deleted_at', null)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>,
    supabase.from('packaging')
      .select('id, sku_code, name, unit_of_measure, supplier_sku_code, supplier_pack_size, supplier_pack_unit, price, currency, total_loaded_cost_nzd')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; unit_of_measure: string; supplier_sku_code: string | null; supplier_pack_size: number | null; supplier_pack_unit: string | null; price: number | null; currency: string | null; total_loaded_cost_nzd: number | null }> | null }>,
    supabase.from('delivery_addresses')
      .select('id, label, street, contact_name, phone, country, is_default')
      .eq('is_active', true)
      .order('country').order('label') as unknown as Promise<{ data: Array<{ id: string; label: string; street: string; contact_name: string | null; phone: string | null; country: 'NZ' | 'AU'; is_default: boolean }> | null }>,
    supabase.from('po_issuers')
      .select('id, name, title, is_default')
      .eq('is_active', true)
      .order('is_default', { ascending: false }).order('name') as unknown as Promise<{ data: Array<{ id: string; name: string; title: string | null; is_default: boolean }> | null }>,
    supabase.from('po_companies')
      .select('id, legal_name, country, is_default')
      .eq('is_active', true)
      .order('is_default', { ascending: false }).order('legal_name') as unknown as Promise<{ data: Array<{ id: string; legal_name: string; country: string | null; is_default: boolean }> | null }>,
  ])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const poNumber = await generatePoNumber()

  return (
    <POForm
      mode="new"
      initialPoNumber={poNumber}
      initialSupplierId=""
      initialCurrency="NZD"
      initialIssuerId={null}
      initialCompanyId={null}
      initialOrderDate={todayStr}
      initialExpected={null}
      initialDeliveryAddressId={null}
      initialDeliveryNotes={null}
      initialNotes={null}
      initialLines={[]}
      status="draft"
      suppliers={suppliers ?? []}
      ingredients={ingredients ?? []}
      products={products ?? []}
      packaging={packaging ?? []}
      deliveryAddresses={addresses ?? []}
      issuers={issuers ?? []}
      companies={companies ?? []}
    />
  )
}
