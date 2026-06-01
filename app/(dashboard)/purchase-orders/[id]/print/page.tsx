import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getAppSettings } from '@/lib/settings'
import { paymentTermsLabel } from '@/lib/constants'
import { PrintTrigger } from '@/components/purchase-orders/print-trigger'

interface PageProps {
  params: { id: string }
}

const ODI_GREEN = '#5a8a3a'
const ODI_GREEN_DARK = '#2f4d1f'

/** Darken a hex colour (#rgb or #rrggbb) by a fixed amount. Used so each
 *  brand colour can drive both the divider (lighter) and the PURCHASE ORDER
 *  title heading (darker) without forcing the user to enter two hexes. */
function darken(hex: string, by = 0.4): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const adj = (v: number) => Math.max(0, Math.round(v * (1 - by)))
  return `#${[adj(r), adj(g), adj(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

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
      .select('po_number, status, order_date, expected_delivery_date, delivery_address_id, delivery_notes, notes, supplier_id, currency, issuer_id, company_id')
      .eq('id', params.id)
      .maybeSingle() as unknown as Promise<{ data: {
        po_number: string; status: string; order_date: string; expected_delivery_date: string | null;
        delivery_address_id: string | null; delivery_notes: string | null;
        notes: string | null; supplier_id: string; currency: string | null; issuer_id: string | null;
        company_id: string | null;
      } | null }>,
    supabase.from('purchase_order_lines')
      .select('id, ingredient_id, product_id, packaging_id, description, quantity_ordered, unit_cost, unit_of_measure, notes')
      .eq('purchase_order_id', params.id)
      .order('created_at') as unknown as Promise<{ data: Array<{
        id: string; ingredient_id: string | null; product_id: string | null; packaging_id: string | null;
        description: string | null; quantity_ordered: number; unit_cost: number | null;
        unit_of_measure: string; notes: string | null;
      }> | null }>,
    getAppSettings(),
  ])

  if (!po) notFound()

  // Resolve supplier + line names + delivery address
  const [{ data: supplier }, { data: ingredients }, { data: products }, { data: packaging }, { data: deliveryAddress }] = await Promise.all([
    supabase.from('suppliers')
      .select('name, contact_name, email, phone, address, payment_terms')
      .eq('id', po.supplier_id)
      .maybeSingle() as unknown as Promise<{ data: {
        name: string; contact_name: string | null; email: string | null; phone: string | null;
        address: string | null; payment_terms: string | null;
      } | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, supplier_sku_code')
      .in('id', (lines ?? []).filter((l) => l.ingredient_id).map((l) => l.ingredient_id!) ) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; supplier_sku_code: string | null }> | null }>,
    supabase.from('products')
      .select('id, sku_code, name')
      .in('id', (lines ?? []).filter((l) => l.product_id).map((l) => l.product_id!)) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>,
    supabase.from('packaging')
      .select('id, sku_code, name, supplier_sku_code')
      .in('id', (lines ?? []).filter((l) => l.packaging_id).map((l) => l.packaging_id!)) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string; supplier_sku_code: string | null }> | null }>,
    po.delivery_address_id
      ? supabase.from('delivery_addresses')
          .select('label, street, contact_name, phone, country')
          .eq('id', po.delivery_address_id)
          .maybeSingle() as unknown as Promise<{ data: { label: string; street: string; contact_name: string | null; phone: string | null; country: string } | null }>
      : Promise.resolve({ data: null }),
  ])

  // Issuer: use PO's issuer_id if set, otherwise fall back to the default issuer.
  // If the table is empty (pre-seed), fall back to hardcoded Atma defaults in the render.
  const { data: issuer } = po.issuer_id
    ? await supabase.from('po_issuers')
        .select('name, title, phone, email')
        .eq('id', po.issuer_id)
        .maybeSingle() as { data: { name: string; title: string | null; phone: string | null; email: string | null } | null }
    : await supabase.from('po_issuers')
        .select('name, title, phone, email')
        .eq('is_default', true)
        .maybeSingle() as { data: { name: string; title: string | null; phone: string | null; email: string | null } | null }

  // Company / letterhead: use PO's company_id if set, otherwise fall back to
  // the default company. Existing POs (no company_id) and empty tables fall
  // through to the app_settings-derived defaults below.
  type CompanyRow = {
    legal_name: string; country: string | null;
    business_number_label: string | null; business_number: string | null;
    tax_number_label: string | null; tax_number: string | null;
    address: string | null; website: string | null; email: string | null; phone: string | null;
    logo_path: string | null; brand_colour: string | null;
  }
  const { data: companyRow } = po.company_id
    ? await supabase.from('po_companies')
        .select('legal_name, country, business_number_label, business_number, tax_number_label, tax_number, address, website, email, phone, logo_path, brand_colour')
        .eq('id', po.company_id)
        .maybeSingle() as { data: CompanyRow | null }
    : await supabase.from('po_companies')
        .select('legal_name, country, business_number_label, business_number, tax_number_label, tax_number, address, website, email, phone, logo_path, brand_colour')
        .eq('is_default', true)
        .maybeSingle() as { data: CompanyRow | null }

  const ingMap  = new Map((ingredients ?? []).map((i) => [i.id, i]))
  const prodMap = new Map((products ?? []).map((p) => [p.id, p]))
  const pkgMap  = new Map((packaging  ?? []).map((p) => [p.id, p]))

  const subtotal = (lines ?? []).reduce(
    (s, l) => s + (Number(l.unit_cost) || 0) * Number(l.quantity_ordered), 0,
  )

  // Build the rendered company object. The po_companies row (if present)
  // wins; otherwise fall back to the app_settings fields so older POs
  // keep printing the Odi letterhead unchanged.
  const company = {
    name:          companyRow?.legal_name        ?? settings.company_legal_name  ?? 'Odi Nutrition Ltd',
    bizLabel:      companyRow?.business_number_label ?? 'NZBN',
    bizNumber:     companyRow?.business_number   ?? settings.company_nzbn        ?? null,
    taxLabel:      companyRow?.tax_number_label  ?? 'GST',
    taxNumber:     companyRow?.tax_number        ?? settings.company_gst_number  ?? null,
    address:       companyRow?.address           ?? settings.company_address     ?? null,
    website:       companyRow?.website           ?? settings.company_website     ?? 'www.odinutrition.com',
    email:         companyRow?.email             ?? null,
    phone:         companyRow?.phone             ?? null,
    logoPath:      companyRow?.logo_path         ?? '/odi-logo@2x.png',
    brandColour:   companyRow?.brand_colour      ?? ODI_GREEN,
  }
  const brandDark = darken(company.brandColour, 0.4)

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
        {/* Letterhead — logo on the left, company contact details on the right.
            Both the divider colour and the PURCHASE ORDER heading use the
            company's brand colour so Odi reads green and Vision Made reads
            dark green / each company's own palette. */}
        <div className="flex items-start justify-between pb-5 border-b-2" style={{ borderColor: company.brandColour }}>
          <div className="flex items-center gap-3">
            {company.logoPath ? (
              <Image
                src={company.logoPath}
                alt={company.name}
                width={140}
                height={70}
                priority
                style={{ width: 'auto', height: '60px' }}
              />
            ) : (
              <div className="text-[20px] font-semibold tracking-wide" style={{ color: brandDark }}>
                {company.name}
              </div>
            )}
          </div>
          <div className="text-right text-[10px] text-gray-600 leading-tight">
            <div className="font-semibold text-gray-900 text-[11px]">{company.name}</div>
            {company.bizNumber && <div>{company.bizLabel}: {company.bizNumber}</div>}
            {company.taxNumber && <div>{company.taxLabel}: {company.taxNumber}</div>}
            {company.address   && <div className="mt-2 whitespace-pre-line">{company.address}</div>}
            {company.phone     && <div className="mt-1">{company.phone}</div>}
            {company.website   && <div>{company.website}</div>}
            {company.email     && <div>{company.email}</div>}
          </div>
        </div>

        <div className="flex items-end justify-between mt-6 mb-6">
          <h1 className="text-[28px] font-light tracking-wide" style={{ color: brandDark }}>PURCHASE ORDER</h1>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">PO Number</div>
            <div className="font-mono text-[16px] font-semibold">{po.po_number}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-6">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Supplier</div>
            <div className="text-[13px] font-semibold">{supplier?.name ?? '—'}</div>
            {supplier?.contact_name && <div className="text-[11px] text-gray-700">Attn: {supplier.contact_name}</div>}
            {supplier?.email && <div className="text-[11px] text-gray-700">{supplier.email}</div>}
            {supplier?.phone && <div className="text-[11px] text-gray-700">{supplier.phone}</div>}
            {supplier?.address && <div className="text-[11px] text-gray-700 whitespace-pre-line">{supplier.address}</div>}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Deliver to</div>
            {deliveryAddress ? (
              <>
                <div className="text-[13px] font-semibold">{deliveryAddress.label}</div>
                <div className="text-[11px] text-gray-700 whitespace-pre-line">{deliveryAddress.street}</div>
                {deliveryAddress.contact_name && <div className="text-[11px] text-gray-700 mt-1">Attn: {deliveryAddress.contact_name}</div>}
                {deliveryAddress.phone && <div className="text-[11px] text-gray-700">{deliveryAddress.phone}</div>}
              </>
            ) : (
              <div className="text-[11px] text-gray-400">No address selected</div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Issued by</div>
            {(() => {
              // Show the chosen issuer's fields as-is (blank fields stay blank).
              // Only fall back to hardcoded Atma values if no issuer was found at all
              // (e.g. legacy PO with no issuer_id and no default in the table).
              const i = issuer ?? { name: 'Atma Okan', title: 'Operations Manager', phone: '+64 27 275 4329', email: 'orders@odinutrition.com' }
              return (
                <>
                  <div className="text-[13px] font-semibold">{i.name}</div>
                  {i.title && <div className="text-[11px] text-gray-700">{i.title}</div>}
                  {i.phone && <div className="text-[11px] text-gray-700">{i.phone}</div>}
                  {i.email && <div className="text-[11px] text-gray-700">{i.email}</div>}
                </>
              )
            })()}
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
            <div className="text-[12px] font-medium">{paymentTermsLabel(supplier?.payment_terms)}</div>
          </div>
        </div>

        <table className="w-full text-[11px] mb-6">
          <thead>
            <tr style={{ background: company.brandColour + '14', color: brandDark }}>
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
              const pkg  = l.packaging_id  ? pkgMap.get(l.packaging_id)  : null
              const name = ing?.name ?? prod?.name ?? pkg?.name ?? l.description ?? '—'
              const sku  = ing?.sku_code ?? prod?.sku_code ?? pkg?.sku_code ?? null
              const supplierSku = ing?.supplier_sku_code ?? pkg?.supplier_sku_code ?? null
              const total = (Number(l.unit_cost) || 0) * Number(l.quantity_ordered)
              return (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 align-top">
                    <div className="font-medium">{name}</div>
                    {sku && <div className="text-gray-500 text-[10px]">Internal SKU: {sku}{supplierSku ? `  ·  Supplier code: ${supplierSku}` : ''}</div>}
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
              <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total ({po.currency ?? 'NZD'} ex-GST)</td>
              <td className="px-2 py-2 text-right tabular-nums font-bold">{fmtMoney(subtotal)}</td>
            </tr>
          </tfoot>
        </table>

        {po.delivery_notes && (
          <div className="mb-4 p-3 border border-gray-200 rounded text-[10px] text-gray-700">
            <div className="font-semibold text-gray-900 mb-1">Delivery notes</div>
            <div className="whitespace-pre-line">{po.delivery_notes}</div>
          </div>
        )}

        <div className="mt-12 pt-3 border-t border-gray-200 text-[9px] text-gray-500 leading-snug">
          {company.name}
          {company.bizNumber ? ` · ${company.bizLabel} ${company.bizNumber}` : ''}
          {company.taxNumber ? ` · ${company.taxLabel} ${company.taxNumber}` : ''}
          {' · '}This document is computer-generated and valid without signature.
        </div>
      </div>
    </>
  )
}
