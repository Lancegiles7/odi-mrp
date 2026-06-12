import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { POForm } from '@/components/purchase-orders/po-form'
import type { POLineInput } from '@/app/(dashboard)/purchase-orders/actions'

export const metadata: Metadata = { title: 'Purchase order' }

interface PageProps {
  params: { id: string }
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const supabase = createClient()

  const [{ data: po }, { data: lines }, { data: suppliers }, { data: ingredients }, { data: products }, { data: packaging }, { data: addresses }, { data: issuers }, { data: companies }] = await Promise.all([
    supabase.from('purchase_orders')
      .select('id, po_number, supplier_id, currency, issuer_id, company_id, status, order_date, expected_delivery_date, delivery_address_id, delivery_notes, notes')
      .eq('id', params.id)
      .maybeSingle() as unknown as Promise<{ data: {
        id: string; po_number: string; supplier_id: string; currency: string | null; issuer_id: string | null;
        company_id: string | null;
        status: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled';
        order_date: string; expected_delivery_date: string | null;
        delivery_address_id: string | null; delivery_notes: string | null;
        notes: string | null;
      } | null }>,
    supabase.from('purchase_order_lines')
      .select('id, ingredient_id, product_id, packaging_id, description, quantity_ordered, unit_cost, unit_of_measure, notes, supplier_code, supplier_pack_size')
      .eq('purchase_order_id', params.id)
      .order('created_at') as unknown as Promise<{ data: Array<{
        id: string; ingredient_id: string | null; product_id: string | null; packaging_id: string | null;
        description: string | null; quantity_ordered: number; unit_cost: number | null;
        unit_of_measure: string; notes: string | null; supplier_code: string | null; supplier_pack_size: number | null;
      }> | null }>,
    supabase.from('suppliers')
      .select('id, name, payment_terms, email, phone, currency')
      .order('name') as unknown as Promise<{ data: Array<{ id: string; name: string; payment_terms: string | null; email: string | null; phone: string | null; currency: string | null }> | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure, supplier_sku_code, supplier_pack_size, supplier_pack_unit, price')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; unit_of_measure: string | null; supplier_sku_code: string | null; supplier_pack_size: number | null; supplier_pack_unit: string | null; price: number | null }> | null }>,
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

  if (!po) notFound()

  const initialLines: POLineInput[] = (lines ?? []).map((l) => ({
    id: l.id,
    line_type:
      l.ingredient_id ? 'ingredient' :
      l.packaging_id  ? 'packaging'  :
      l.product_id    ? 'product'    : 'other',
    ingredient_id: l.ingredient_id,
    product_id: l.product_id,
    packaging_id: l.packaging_id,
    description: l.description,
    quantity_ordered: Number(l.quantity_ordered),
    unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
    unit_of_measure: l.unit_of_measure,
    notes: l.notes,
    supplier_code: l.supplier_code,
    supplier_pack_size: l.supplier_pack_size != null ? Number(l.supplier_pack_size) : null,
  }))

  return (
    <POForm
      mode="edit"
      poId={po.id}
      initialPoNumber={po.po_number}
      initialSupplierId={po.supplier_id}
      initialCurrency={po.currency ?? 'NZD'}
      initialIssuerId={po.issuer_id}
      initialCompanyId={po.company_id}
      initialOrderDate={po.order_date.slice(0, 10)}
      initialExpected={po.expected_delivery_date?.slice(0, 10) ?? null}
      initialDeliveryAddressId={po.delivery_address_id}
      initialDeliveryNotes={po.delivery_notes}
      initialNotes={po.notes}
      initialLines={initialLines}
      status={po.status}
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
