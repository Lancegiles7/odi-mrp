import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReceiveForm } from '@/components/purchase-orders/receive-form'

// Always render live data — never serve a cached copy, so a receipt just saved
// is always reflected (no stale "already received").
export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

interface POHeader {
  id: string
  po_number: string
  status: string
  expected_delivery_date: string | null
  supplier_id: string
}

interface POLineRow {
  id: string
  ingredient_id: string | null
  product_id: string | null
  description: string | null
  quantity_ordered: number
  quantity_received: number
  unit_cost: number | null
  unit_of_measure: string
  notes: string | null
}

export default async function ReceivePoPage({ params }: PageProps) {
  const supabase = createClient()

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, expected_delivery_date, supplier_id')
    .eq('id', params.id)
    .maybeSingle() as { data: POHeader | null }

  if (!po) notFound()
  if (po.status !== 'submitted' && po.status !== 'partially_received') {
    redirect(`/purchase-orders/${params.id}`)
  }

  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('id, ingredient_id, product_id, description, quantity_ordered, quantity_received, unit_cost, unit_of_measure, notes')
    .eq('purchase_order_id', params.id)
    .order('created_at') as { data: POLineRow[] | null }

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('name')
    .eq('id', po.supplier_id)
    .maybeSingle() as { data: { name: string } | null }

  const ingIds  = (lines ?? []).filter((l) => l.ingredient_id).map((l) => l.ingredient_id!)
  const prodIds = (lines ?? []).filter((l) => l.product_id).map((l) => l.product_id!)

  const { data: ings } = ingIds.length
    ? await supabase.from('ingredients').select('id, sku_code, name').in('id', ingIds) as unknown as { data: Array<{ id: string; sku_code: string; name: string }> | null }
    : { data: [] as Array<{ id: string; sku_code: string; name: string }> }

  const { data: prods } = prodIds.length
    ? await supabase.from('products').select('id, sku_code, name').in('id', prodIds) as unknown as { data: Array<{ id: string; sku_code: string; name: string }> | null }
    : { data: [] as Array<{ id: string; sku_code: string; name: string }> }

  const ingMap  = new Map((ings  ?? []).map((i) => [i.id, i]))
  const prodMap = new Map((prods ?? []).map((p) => [p.id, p]))

  const lineRows = (lines ?? []).map((l) => ({
    id: l.id,
    label:
      l.ingredient_id ? (ingMap.get(l.ingredient_id)?.name ?? '—') :
      l.product_id    ? (prodMap.get(l.product_id)?.name   ?? '—') :
                         (l.description ?? '—'),
    sku:
      l.ingredient_id ? (ingMap.get(l.ingredient_id)?.sku_code ?? null) :
      l.product_id    ? (prodMap.get(l.product_id)?.sku_code   ?? null) :
                         null,
    quantity_ordered:  Number(l.quantity_ordered),
    quantity_received: Number(l.quantity_received),
    unit_cost:         l.unit_cost != null ? Number(l.unit_cost) : null,
    unit_of_measure:   l.unit_of_measure,
    notes:             l.notes ?? '',
  }))

  return (
    <ReceiveForm
      poId={params.id}
      poNumber={po.po_number}
      supplierName={supplier?.name ?? '—'}
      expectedDate={po.expected_delivery_date?.slice(0, 10) ?? null}
      lines={lineRows}
    />
  )
}
