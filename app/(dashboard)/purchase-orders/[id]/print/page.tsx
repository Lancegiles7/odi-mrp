import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getAppSettings } from '@/lib/settings'
import { PrintTrigger } from '@/components/purchase-orders/print-trigger'

interface PageProps {
  params: { id: string }
}

const ODI_GREEN = '#5a8a3a'
const ODI_GREEN_DARK = '#2f4d1f'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function PurchaseOrderPrintPage({ params }: PageProps) {
  const supabase = createClient()

  const [{ data: po }, { data: lines }, settings] = await Promise.all([
    supabase.from('purchase_orders')
      .select('po_number, status, order_date, expected_delivery_date, notes, supplier_id')
      .eq('id', params.id)
      .maybeSingle() as unknown as Promise<{ data: {
        po_number: string; status: string; order_date: string; expected_delivery_date: string | null;
        notes: string | null; supplier_id: string;
      } | null }>,
    supabase.from('purchase_order_lines')
      .select('id, ingredient_id, product_id, description, quantity_ordered, unit_cost, unit_of_measure, notes')
      .eq('purchase_order_id', params.id)
      .order('created_at') as unknown as Promise<{ data: Array<{
        id: string; ingredient_id: string | null; product_id: string | null;
        description: string | null; quantity_ordered: number; unit_cost: number | null;
        unit_of_measure: string; notes: string | null;
      }> | null }>,
    getAppSettings(),
  ])

  if (!po) notFound()

  // Resolve supplier + line names
  const [{ data: supplier }, { data: ingredients }, { data: products }] = await Promise.all([
    supabase.from('suppliers')
      .select('name, contact_name, email, phone, address, payment_terms')
      .eq('id', po.supplier_id)
      .maybeSingle() as unknown as Promise<{ data: {
        name: string; contact_name: string | null; email: string | null; phone: string | null;
        address: string | null; payment_terms: string | null;
      } | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name')
      .in('id', (lines ?? []).filter((l) => l.ingredient_id).map((l) => l.ingredient_id!) ) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>,
    supabase.from('products')
      .select('id, sku_code, name')
      .in('id', (lines ?? []).filter((l) => l.product_id).map((l) => l.product_id!)) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>,
  ])

  const ingMap  = new Map((ingredients ?? []).map((i) => [i.id, i]))
  const prodMap = new Map((products ?? []).map((p) => [p.id, p]))

  const subtotal = (lines ?? []).reduce(
    (s, l) => s + (Number(l.unit_cost) || 0) * Number(l.quantity_ordered), 0,
  )

  const company = {
    name:    settings.company_legal_name ?? 'Odi Nutrition Ltd',
    nzbn:    settings.company_nzbn ?? null,
    gst:     settings.company_gst_number ?? null,
    address: settings.company_address ?? null,
    website: settings.company_website ?? 'www.odinutrition.com',
  }

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          /* Hide everything except the PDF page itself (sidebar, header, toolbars) */
          body * { visibility: hidden; }
          .pdf-page, .pdf-page * { visibility: visible; }
          .pdf-page {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; box-shadow: none !important;
            margin: 0 !important; padding: 24mm 18mm !important;
          }
          @page { margin: 0; size: A4; }
        }
      `}</style>

      {/* Top toolbar — hidden in print */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-5 py-2.5 flex items-center justify-between z-10">
        <div className="text-xs text-gray-500">Preview · {po.po_number}</div>
        <div className="flex gap-2">
          <a href={`/purchase-orders/${params.id}`} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">← Back to PO</a>
          <PrintTrigger />
        </div>
      </div>

      <div className="pdf-page" style={{
        width: '794px', minHeight: '1123px', background: 'white',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '56px 64px',
        margin: '64px auto', fontSize: '12px', lineHeight: 1.55, color: '#1f2937',
      }}>
        {/* Letterhead */}
        <div className="flex items-start justify-between pb-5 border-b-2" style={{ borderColor: ODI_GREEN }}>
          <div className="flex items-center gap-3">
            <Image src="/odi-logo@2x.png" alt="Odi" width={140} height={70} priority style={{ width: 'auto', height: '60px' }} />
          </div>
          <div className="text-right text-[10px] text-gray-600 leading-tight">
            <div className="font-semibold text-gray-900 text-[11px]">{company.name}</div>
            {company.nzbn    && <div>NZBN: {company.nzbn}</div>}
            {company.gst     && <div>GST: {company.gst}</div>}
            {company.address && <div className="mt-2 whitespace-pre-line">{company.address}</div>}
            {company.website && <div className="mt-1">{company.website}</div>}
          </div>
        </div>

        <div className="flex items-end justify-between mt-6 mb-6">
          <h1 className="text-[28px] font-light tracking-wide" style={{ color: ODI_GREEN_DARK }}>PURCHASE ORDER</h1>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">PO Number</div>
            <div className="font-mono text-[16px] font-semibold">{po.po_number}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Supplier</div>
            <div className="text-[13px] font-semibold">{supplier?.name ?? '—'}</div>
            {supplier?.contact_name && <div className="text-[11px] text-gray-700">Attn: {supplier.contact_name}</div>}
            {supplier?.email && <div className="text-[11px] text-gray-700">{supplier.email}</div>}
            {supplier?.phone && <div className="text-[11px] text-gray-700">{supplier.phone}</div>}
            {supplier?.address && <div className="text-[11px] text-gray-700 whitespace-pre-line">{supplier.address}</div>}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Issued by</div>
            <div className="text-[13px] font-semibold">Atma Okan</div>
            <div className="text-[11px] text-gray-700">Operations Manager</div>
            <div className="text-[11px] text-gray-700">+64 27 275 4329</div>
            <div className="text-[11px] text-gray-700">atma@odinutrition.com</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5 pb-3 border-b border-gray-200">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500">Order date</div>
            <div className="text-[12px] font-medium">{fmtDate(po.order_date)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500">Expected delivery</div>
            <div className="text-[12px] font-medium">{fmtDate(po.expected_delivery_date)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500">Payment terms</div>
            <div className="text-[12px] font-medium">{supplier?.payment_terms ?? '—'}</div>
          </div>
        </div>

        <table className="w-full text-[11px] mb-6">
          <thead>
            <tr style={{ background: '#f0f4ec', color: ODI_GREEN_DARK }}>
              <th className="text-left px-2 py-1.5 font-semibold">Description</th>
              <th className="text-right px-2 py-1.5 font-semibold w-[60px]">Qty</th>
              <th className="text-left px-2 py-1.5 font-semibold w-[50px]">UoM</th>
              <th className="text-right px-2 py-1.5 font-semibold w-[80px]">Unit price</th>
              <th className="text-right px-2 py-1.5 font-semibold w-[90px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => {
              const ing  = l.ingredient_id ? ingMap.get(l.ingredient_id) : null
              const prod = l.product_id    ? prodMap.get(l.product_id)   : null
              const name = ing?.name ?? prod?.name ?? l.description ?? '—'
              const sku  = ing?.sku_code ?? prod?.sku_code ?? null
              const total = (Number(l.unit_cost) || 0) * Number(l.quantity_ordered)
              return (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 align-top">
                    <div className="font-medium">{name}</div>
                    {sku && <div className="text-gray-500 text-[10px]">SKU: {sku}</div>}
                    {l.notes && <div className="text-gray-500 text-[10px]">{l.notes}</div>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums align-top">{Number(l.quantity_ordered).toLocaleString()}</td>
                  <td className="px-2 py-2 align-top">{l.unit_of_measure}</td>
                  <td className="px-2 py-2 text-right tabular-nums align-top">{fmtMoney(l.unit_cost)}</td>
                  <td className="px-2 py-2 text-right tabular-nums align-top">{fmtMoney(total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="text-[12px]">
              <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total (NZD ex-GST)</td>
              <td className="px-2 py-2 text-right tabular-nums font-bold">{fmtMoney(subtotal)}</td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <div className="mb-8 p-3 border border-gray-200 rounded text-[10px] text-gray-700">
            <div className="font-semibold text-gray-900 mb-1">Delivery notes</div>
            <div className="whitespace-pre-line">{po.notes}</div>
          </div>
        )}

        <div className="mt-12 pt-3 border-t border-gray-200 text-[9px] text-gray-500 leading-snug">
          {company.name}
          {company.nzbn ? ` · NZBN ${company.nzbn}` : ''}
          {company.gst  ? ` · GST ${company.gst}`   : ''}
          {' · '}This document is computer-generated and valid without signature.
        </div>
      </div>
    </>
  )
}
