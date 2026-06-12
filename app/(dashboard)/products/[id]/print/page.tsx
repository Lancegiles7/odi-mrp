import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { calcProductCostSummary, calcBomLineValues } from '@/lib/costing'
import { getAppSettings } from '@/lib/settings'
import { PRODUCT_GROUP_LABELS, packagingTypeLabel } from '@/lib/constants'
import { PrintTrigger } from '@/components/products/print-trigger'
import type { BomItemWithIngredient } from '@/lib/types/database.types'

interface PageProps {
  params: { id: string }
}

const ODI_GREEN = '#5a8a3a'
const ODI_GREEN_DARK = '#2f4d1f'

function fmtToday(): string {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function ProductPrintPage({ params }: PageProps) {
  const supabase = createClient()

  const [{ data: product }, settings, { data: packagingLinks }, { data: companyRow }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        boms (
          id, version, is_active, notes, market,
          bom_items (
            id, ingredient_id, quantity_g, wet_quantity_g, uom, price_override, notes, sort_order,
            ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, total_loaded_cost_au, is_organic, currency, price )
          )
        )
      `)
      .eq('id', params.id)
      .single(),
    getAppSettings(),
    supabase
      .from('product_packaging')
      .select('packaging_id, quantity_per_unit, entry_mode, entry_value, include_in_cost, packaging:packaging_id(sku_code, name, type, total_loaded_cost_nzd)')
      .eq('product_id', params.id)
      .eq('market', 'NZ') as unknown as { data: Array<{
        packaging_id: string
        quantity_per_unit: number
        entry_mode: string | null
        entry_value: number | null
        include_in_cost: boolean
        packaging: { sku_code: string; name: string; type: string; total_loaded_cost_nzd: number | null } | null
      }> | null },
    supabase
      .from('app_settings')
      .select('company_legal_name, company_nzbn, company_gst_number, company_address, company_website')
      .eq('id', 1)
      .maybeSingle() as unknown as { data: {
        company_legal_name: string | null; company_nzbn: string | null; company_gst_number: string | null
        company_address: string | null; company_website: string | null
      } | null },
  ])

  if (!product) notFound()

  const allBoms = (product.boms as Array<{
    id: string
    version: number
    is_active: boolean
    notes: string | null
    market: string | null
    bom_items: BomItemWithIngredient[]
  }>) ?? []
  const activeBom = allBoms.find((b) => b.is_active && (b.market ?? 'NZ') === 'NZ')
  const auBom     = allBoms.find((b) => b.is_active && b.market === 'AU')

  const bomItems: BomItemWithIngredient[] = (activeBom?.bom_items ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const auBomItems: BomItemWithIngredient[] = (auBom?.bom_items ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const summary   = calcProductCostSummary(product, bomItems, settings, auBomItems)
  const typeLabel = product.product_type ? PRODUCT_GROUP_LABELS[product.product_type] ?? product.product_type : null
  const totalWeight = bomItems.reduce((s, i) => s + Number(i.quantity_g || 0), 0)

  const company = {
    name:    companyRow?.company_legal_name ?? 'Odi Nutrition Ltd',
    nzbn:    companyRow?.company_nzbn ?? null,
    gst:     companyRow?.company_gst_number ?? null,
    address: companyRow?.company_address ?? null,
    website: companyRow?.company_website ?? 'www.odinutrition.com',
  }

  // Packaging breakdown rows (mirrors the on-screen PackagingBreakdown)
  const pkgRows = (packagingLinks ?? [])
    .filter((l) => l.packaging != null)
    .sort((a, b) => (a.packaging?.name ?? '').localeCompare(b.packaging?.name ?? ''))
  const packagingTotal = Number(product.packaging) || 0

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
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
        <div className="text-xs text-gray-500">Preview · {product.sku_code}</div>
        <div className="flex gap-2">
          <a href={`/products/${params.id}`} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">← Back to product</a>
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
          <Image src="/odi-logo@2x.png" alt="Odi" width={140} height={70} priority style={{ width: 'auto', height: '60px' }} />
          <div className="text-right text-[10px] text-gray-600 leading-tight">
            <div className="font-semibold text-gray-900 text-[11px]">{company.name}</div>
            {company.nzbn    && <div>NZBN: {company.nzbn}</div>}
            {company.gst     && <div>GST: {company.gst}</div>}
            {company.address && <div className="mt-2 whitespace-pre-line">{company.address}</div>}
            {company.website && <div className="mt-1">{company.website}</div>}
          </div>
        </div>

        {/* Title */}
        <div className="flex items-end justify-between mt-6 mb-2">
          <div>
            <h1 className="text-[28px] font-light tracking-wide" style={{ color: ODI_GREEN_DARK }}>PRODUCT COST SHEET</h1>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
              {typeLabel && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{typeLabel}</span>}
              {product.is_active
                ? <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">Active</span>
                : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">Inactive</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">SKU code</div>
            <div className="font-mono text-[16px] font-semibold">{product.sku_code}</div>
          </div>
        </div>

        <div className="text-[16px] font-semibold mb-4">{product.name}</div>

        {/* Overview */}
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 mb-5">
          <Meta label="Product type"   value={typeLabel} />
          <Meta label="Size"           value={product.size_g != null ? `${product.size_g} g` : null} />
          <Meta label="Serving size"   value={product.serving_size != null ? `${product.serving_size} g` : null} />
          <Meta label="RRP (inc GST)"  value={product.rrp != null ? formatCurrency(product.rrp) : null} />
          {product.hero_call_out && <div className="col-span-2"><Meta label="Hero call-out" value={product.hero_call_out} /></div>}
          <div className="col-span-2">
            <Meta label="FX" value={`AUD → NZD ×${Number(settings.fx_rates.AUD).toFixed(4)} · base is NZD, AU derived`} />
          </div>
        </div>

        {/* Cost summary */}
        <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">
          Cost summary
          {product.rrp != null && product.rrp > 0 && (
            <span className="normal-case tracking-normal text-gray-500"> · RRP ex-GST NZ {formatCurrency(summary.rrp_ex_gst_nz)} / AU {formatCurrency(summary.rrp_ex_gst_au)}</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <Tile
            label={summary.serving_multiplier !== 1 ? 'Ingredient total (per serving)' : 'Ingredient total'}
            value={formatCurrency(summary.ingredient_total)}
            sub={summary.serving_multiplier !== 1
              ? `pack ${formatCurrency(summary.ingredient_total_per_pack)} × ${summary.serving_multiplier.toFixed(2)}`
              : product.wastage_pct > 0 ? `+${(product.wastage_pct * 100).toFixed(1)}% wastage` : 'From BOM lines'}
          />
          <Tile label="Base cost"      value={formatCurrency(summary.base_cost)}      sub="NZ total (all lines → NZD)" />
          <Tile label="NZ grand total" value={formatCurrency(summary.nz_grand_total)} sub="every line converted → NZD" dark />
          <Tile label="AU grand total" value={`A${formatCurrency(summary.au_grand_total)}`} sub="every line converted → AUD" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { name: 'New Zealand', cur: 'NZD', sym: '$',  rrp: product.rrp,                   gp: summary.gp_nz, gpAmt: summary.gp_nz_amount, cost: summary.nz_grand_total, cos: summary.cos_nz },
            { name: 'Australia',   cur: 'AUD', sym: 'A$', rrp: product.rrp_au ?? product.rrp, gp: summary.gp_au, gpAmt: summary.gp_au_amount, cost: summary.au_grand_total, cos: summary.cos_au },
          ].map((m) => (
            <div key={m.name} className="border border-gray-300 rounded overflow-hidden">
              <div className="px-2 py-1 text-[10px] font-semibold" style={{ background: ODI_GREEN_DARK, color: '#fff' }}>{m.name} · {m.cur}</div>
              <div className="px-2 py-1.5 text-[11px] space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">RRP (inc GST)</span><span className="font-semibold tabular-nums">{m.rrp != null && m.rrp > 0 ? `${m.sym}${Number(m.rrp).toFixed(2)}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">GP</span><span className="tabular-nums font-semibold">{m.gp !== null ? `${Math.round(m.gp * 100)}% · ${m.sym}${Number(m.gpAmt ?? 0).toFixed(2)}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Cost</span><span className="tabular-nums">{`${m.sym}${Number(m.cost).toFixed(2)}`}{m.cos !== null ? ` · ${Math.round(m.cos * 100)}%` : ''}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* BOM table */}
        <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">
          Bill of materials · {bomItems.length} ingredient{bomItems.length === 1 ? '' : 's'}{activeBom ? ` · Version ${activeBom.version} (active)` : ''}
        </div>
        <table className="w-full text-[11px] mb-1">
          <thead>
            <tr style={{ background: '#f0f4ec', color: ODI_GREEN_DARK }}>
              <th className="text-left px-2 py-1.5 font-semibold">Ingredient</th>
              <th className="text-left px-2 py-1.5 font-semibold">Ing. SKU</th>
              <th className="text-right px-2 py-1.5 font-semibold">g</th>
              <th className="text-right px-2 py-1.5 font-semibold">kg</th>
              <th className="text-right px-2 py-1.5 font-semibold">% of wt</th>
              <th className="text-right px-2 py-1.5 font-semibold">Serve (g)</th>
              <th className="text-right px-2 py-1.5 font-semibold">$/kg</th>
              <th className="text-right px-2 py-1.5 font-semibold">$/unit</th>
            </tr>
          </thead>
          <tbody>
            {bomItems.map((item) => {
              const calc = calcBomLineValues(item, product.size_g ?? 0, product.serving_size ?? 0)
              return (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 align-top">
                    <span className="font-medium text-gray-900">{item.ingredients.name}</span>
                    {!item.ingredients.is_organic && (
                      <span className="ml-1.5 text-[8px] px-1 py-0.5 rounded bg-orange-50 text-orange-700">Non-Organic</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-gray-600 align-top">{item.ingredients.sku_code}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums align-top">{item.quantity_g}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums align-top">{calc.unit_in_kg.toFixed(4)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums align-top">{(calc.percentage * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right tabular-nums align-top">{calc.serve_amount.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums align-top">{formatCurrency(calc.price_per_kg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium align-top">{formatCurrency(calc.price_per_unit)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Cost build-up */}
        <div className="mt-4 pt-3 border-t border-gray-200 text-[11px]">
          {product.wastage_pct > 0 && (
            <div className="flex justify-between py-0.5 text-gray-600">
              <span>+ Contingency / wastage ({(product.wastage_pct * 100).toFixed(1)}%)</span>
              <span className="tabular-nums">{formatCurrency(summary.ingredient_total_per_pack - summary.ingredient_subtotal)}</span>
            </div>
          )}
          <div className="flex justify-between py-1 font-semibold border-t border-gray-100 mt-1">
            <span>Ingredients subtotal (per pack) · {totalWeight.toFixed(2)} g</span>
            <span className="tabular-nums">{formatCurrency(summary.ingredient_total_per_pack)}</span>
          </div>

          {summary.serving_multiplier !== 1 && (
            <>
              <div className="flex justify-between py-0.5 text-gray-500">
                <span>× Serving multiplier ({summary.serving_multiplier.toFixed(2)}× — serving {product.serving_size} g ÷ pack {product.size_g} g)</span>
                <span className="tabular-nums">{formatCurrency(summary.ingredient_total - summary.ingredient_total_per_pack)}</span>
              </div>
              <div className="flex justify-between py-0.5 font-semibold">
                <span>Ingredient total (per serving)</span>
                <span className="tabular-nums">{formatCurrency(summary.ingredient_total)}</span>
              </div>
            </>
          )}

          {/* Packaging */}
          <div className="mt-2.5">
            <div className="flex justify-between font-medium">
              <span>Packaging</span>
              <span className="tabular-nums">{formatCurrency(packagingTotal)}</span>
            </div>
            {pkgRows.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-3 border-l-2 border-gray-200 text-[10px]">
                {pkgRows.map((l) => {
                  const qty = Number(l.quantity_per_unit) || 0
                  const unitCost = Number(l.packaging?.total_loaded_cost_nzd) || 0
                  const excluded = !l.include_in_cost
                  const entryDisplay = l.entry_mode === 'per_group' && l.entry_value
                    ? `${Number(l.entry_value)} per ${packagingTypeLabel(l.packaging?.type ?? 'OTHER')} (= ${qty.toFixed(4)} per pack)`
                    : `${qty} per pack`
                  return (
                    <li key={l.packaging_id} className="flex justify-between gap-2">
                      <span className={`flex-1 ${excluded ? 'text-gray-400' : 'text-gray-600'}`}>
                        · {packagingTypeLabel(l.packaging?.type ?? 'OTHER')} — {l.packaging?.name}{' '}
                        <span className="text-gray-400">({entryDisplay} × ${unitCost.toFixed(4)})</span>
                      </span>
                      <span className={`tabular-nums ${excluded ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                        {excluded ? 'excluded' : formatCurrency(qty * unitCost)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Other costs — each input converted to NZD for the NZ subtotal. */}
          {(() => {
            const fx = Number(settings.fx_rates.AUD) || 1
            const toNzd = (v: number, cur?: string | null) => (cur === 'AUD' ? v * fx : v)
            const cur   = (c?: string | null) => (c === 'AUD' ? 'AUD' : 'NZD')
            const tollNzd      = toNzd(Number(product.toll)   || 0, product.toll_currency)
            const marginNzd    = toNzd(Number(product.margin) || 0, product.margin_currency)
            const otherNzd     = toNzd(Number(product.other)  || 0, product.other_currency)
            const freightNzNzd = toNzd(Number(product.freight_nz ?? product.freight) || 0, product.freight_nz_currency)
            return (
              <>
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Other · converted to NZD</div>
                  <LineItem label={`Toll (${cur(product.toll_currency)})`}             value={tollNzd} />
                  <LineItem label={`Margin (${cur(product.margin_currency)})`}          value={marginNzd} />
                  <LineItem label={`Task / other (${cur(product.other_currency)})`}     value={otherNzd} />
                  <LineItem label={`Freight — NZ (${cur(product.freight_nz_currency)})`} value={freightNzNzd} />
                  <div className="flex justify-between pt-1 mt-0.5 border-t border-gray-200">
                    <span className="text-gray-700 font-medium">Other subtotal</span>
                    <span className="tabular-nums font-semibold">{formatCurrency(tollNzd + marginNzd + otherNzd + freightNzNzd)}</span>
                  </div>
                </div>

                <div className="flex justify-between pt-2 mt-2 border-t border-gray-300 text-[15px] font-bold">
                  <span>Base cost (NZ total)</span>
                  <span className="tabular-nums">{formatCurrency(summary.nz_grand_total)}</span>
                </div>
                <div className="flex justify-between pt-1 text-[12px]" style={{ color: '#6b7280' }}>
                  <span>AU total · each line → AUD, AU freight (FX {fx.toFixed(4)})</span>
                  <span className="tabular-nums">A{formatCurrency(summary.au_grand_total)}</span>
                </div>
              </>
            )
          })()}
        </div>

        <div className="mt-10 pt-3 border-t border-gray-200 text-[9px] text-gray-500 leading-snug">
          {company.name}
          {company.nzbn ? ` · NZBN ${company.nzbn}` : ''}
          {company.gst  ? ` · GST ${company.gst}`   : ''}
          {' · '}Generated {fmtToday()} · This cost sheet is computer-generated and for internal use.
        </div>
      </div>
    </>
  )
}

function Meta({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[12px] font-semibold">{value ?? <span className="text-gray-300">—</span>}</div>
    </div>
  )
}

function LineItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between text-gray-600">
      <span>{label}</span>
      <span className={`tabular-nums ${value != null ? 'text-gray-900 font-medium' : ''}`}>
        {value != null ? formatCurrency(value) : '—'}
      </span>
    </div>
  )
}

function Tile({
  label, value, sub, dark, accent, positive,
}: {
  label: string; value: string; sub?: string; dark?: boolean; accent?: boolean; positive?: boolean
}) {
  const cls = dark
    ? 'bg-gray-900 text-white'
    : positive
      ? 'bg-green-50 text-green-800'
      : accent
        ? 'bg-amber-50 text-amber-800'
        : 'bg-gray-50 text-gray-900'
  const subCls = dark ? 'text-white/70' : positive ? 'text-green-700' : accent ? 'text-amber-700' : 'text-gray-500'
  return (
    <div className={`rounded-md p-2.5 ${cls}`}>
      <div className={`text-[8px] uppercase tracking-wider font-semibold ${subCls}`}>{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold leading-tight">{value}</div>
      {sub && <div className={`text-[8px] ${subCls}`}>{sub}</div>}
    </div>
  )
}
