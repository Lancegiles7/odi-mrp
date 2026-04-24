import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { calcProductCostSummary, calcBomLineValues } from '@/lib/costing'
import { getAppSettings } from '@/lib/settings'
import { PRODUCT_GROUP_LABELS, ROLES } from '@/lib/constants'
import { DeleteProductButton } from '@/components/products/delete-product-button'
import type { BomItemWithIngredient } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Product' }

interface PageProps {
  params: { id: string }
  searchParams: { restored?: string; error?: string }
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('user_profiles').select('roles(name)').eq('id', user?.id ?? '').maybeSingle() as { data: { roles: { name: string } | null } | null }
  const isAdmin = profile?.roles?.name === ROLES.ADMIN

  const [{ data: product }, settings] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        boms (
          id, version, is_active, notes,
          bom_items (
            id, ingredient_id, quantity_g, uom, price_override, notes, sort_order,
            ingredients ( id, name, sku_code, unit_of_measure, total_loaded_cost, is_organic )
          )
        )
      `)
      .eq('id', params.id)
      .single(),
    getAppSettings(),
  ])

  if (!product) notFound()

  const activeBom = (product.boms as Array<{
    id: string
    version: number
    is_active: boolean
    notes: string | null
    bom_items: BomItemWithIngredient[]
  }>)?.find((b) => b.is_active)

  const bomItems: BomItemWithIngredient[] = (activeBom?.bom_items ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const summary   = calcProductCostSummary(product, bomItems, settings)
  const typeLabel = product.product_type ? PRODUCT_GROUP_LABELS[product.product_type] ?? product.product_type : null
  const fxNote    = product.apply_fx ? `×${Number(settings.fx_rate).toFixed(4)} FX` : 'FX not applied'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/products" className="text-sm text-gray-500 hover:text-gray-900">
            ← Products / BOMs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">{product.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs">
            {typeLabel && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{typeLabel}</span>}
            {product.is_active
              ? <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">Active</span>
              : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">Inactive</span>}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {isAdmin && (
            <DeleteProductButton productId={params.id} productName={product.name} />
          )}
          <Link
            href={`/products/${params.id}/edit`}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            Edit
          </Link>
        </div>
      </div>

      {searchParams.restored && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Product restored from trash.
        </div>
      )}
      {searchParams.error === 'delete_failed' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Could not delete — please try again.
        </div>
      )}

      {/* Overview + SKU tile */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Overview</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Meta label="Product type" value={typeLabel} />
            <Meta label="Size" value={product.size_g != null ? `${product.size_g} g` : null} />
            <Meta label="Serving size" value={product.serving_size != null ? `${product.serving_size} g` : null} />
            <Meta label="RRP (inc GST)" value={product.rrp != null ? formatCurrency(product.rrp) : null} />
            <Meta label="Hero callout" value={product.hero_call_out} colSpan />
            <Meta label="Back of pack" value={product.back_of_pack} colSpan multiline />
          </dl>
        </div>
        <div className="bg-white rounded-lg border-2 border-gray-900 p-5 flex flex-col justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">SKU code</div>
            <div className="font-mono text-lg font-bold tracking-tight">{product.sku_code}</div>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Ingredient SKU codes auto-link to the ingredient master list below.
          </div>
        </div>
      </div>

      {/* Cost summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Cost summary</h3>
          <div className="text-xs text-gray-500">
            FX rate <span className="font-mono font-semibold">{Number(settings.fx_rate).toFixed(4)}</span> ·{' '}
            <span className={`px-1.5 py-0.5 rounded ${product.apply_fx ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {fxNote}
            </span>
            {product.rrp != null && product.rrp > 0 && (
              <>
                <span className="mx-2 text-gray-300">·</span>
                RRP ex-GST NZ <span className="font-mono font-semibold">{formatCurrency(summary.rrp_ex_gst_nz)}</span>
                <span className="mx-1 text-gray-300">/</span>
                AU <span className="font-mono font-semibold">{formatCurrency(summary.rrp_ex_gst_au)}</span>
              </>
            )}
          </div>
        </div>

        {/* Row 1 — cost build-up */}
        <div className="grid grid-cols-4 gap-3">
          <Tile
            label={summary.serving_multiplier !== 1 ? 'Ingredient total (per serving)' : 'Ingredient total'}
            value={formatCurrency(summary.ingredient_total)}
            sub={
              summary.serving_multiplier !== 1
                ? `pack ${formatCurrency(summary.ingredient_total_per_pack)} × ${summary.serving_multiplier.toFixed(2)}`
                : product.wastage_pct > 0
                  ? `+${(product.wastage_pct * 100).toFixed(1)}% wastage`
                  : 'From BOM lines'
            }
          />
          <Tile label="Base cost"      value={formatCurrency(summary.base_cost)}      sub="Ing + pkg + toll + margin + task + freight" />
          <Tile label="NZ grand total" value={formatCurrency(summary.nz_grand_total)} sub={product.apply_fx ? `×${Number(settings.fx_rate).toFixed(4)} FX` : 'No FX'} dark />
          <Tile label="AU grand total" value={formatCurrency(summary.au_grand_total)} sub="Never has FX" />
        </div>

        {/* Row 2 — COS + GP split across NZ / AU */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          <Tile
            label="COS NZ"
            value={summary.cos_nz !== null ? `${(summary.cos_nz * 100).toFixed(1)}%` : '—'}
            sub={`${formatCurrency(summary.nz_grand_total)} of ${formatCurrency(summary.rrp_ex_gst_nz)} ex-GST`}
            accent
          />
          <Tile
            label="GP NZ"
            value={summary.gp_nz_amount !== null ? formatCurrency(summary.gp_nz_amount) : '—'}
            sub={summary.gp_nz !== null ? `${(summary.gp_nz * 100).toFixed(1)}% of ex-GST RRP` : '—'}
            positive
          />
          <Tile
            label="COS AU"
            value={summary.cos_au !== null ? `${(summary.cos_au * 100).toFixed(1)}%` : '—'}
            sub={`${formatCurrency(summary.au_grand_total)} of ${formatCurrency(summary.rrp_ex_gst_au)} ex-GST`}
            accent
          />
          <Tile
            label="GP AU"
            value={summary.gp_au_amount !== null ? formatCurrency(summary.gp_au_amount) : '—'}
            sub={summary.gp_au !== null ? `${(summary.gp_au * 100).toFixed(1)}% of ex-GST RRP` : '—'}
            positive
          />
        </div>
      </div>

      {/* BOM table (read-only on detail; edit via Edit page which hosts the editor) */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Bill of materials</h3>
          <div className="text-xs text-gray-500">
            {bomItems.length} ingredient{bomItems.length === 1 ? '' : 's'}{activeBom ? ` · Version ${activeBom.version} (active)` : ''}
          </div>
        </div>
        {bomItems.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">
            No ingredients yet. <Link href={`/products/${params.id}/edit`} className="underline">Open the editor</Link> to add some.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Ingredient</th>
                  <th className="text-left font-medium px-5 py-2">Ing. SKU</th>
                  <th className="text-right font-medium px-5 py-2">g</th>
                  <th className="text-right font-medium px-5 py-2">kg</th>
                  <th className="text-right font-medium px-5 py-2">% of wt</th>
                  <th className="text-right font-medium px-5 py-2">Serve (g)</th>
                  <th className="text-right font-medium px-5 py-2">$/kg</th>
                  <th className="text-right font-medium px-5 py-2">$/unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bomItems.map((item) => {
                  const calc = calcBomLineValues(item, product.size_g ?? 0, product.serving_size ?? 0)
                  return (
                    <tr key={item.id}>
                      <td className="px-5 py-2.5">
                        <Link href={`/ingredients/${item.ingredient_id}`} className="font-medium text-gray-900 hover:underline">
                          {item.ingredients.name}
                        </Link>
                        {!item.ingredients.is_organic && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">Non-Organic</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{item.ingredients.sku_code}</td>
                      <td className="px-5 py-2.5 text-right">{item.quantity_g}</td>
                      <td className="px-5 py-2.5 text-right">{calc.unit_in_kg.toFixed(4)}</td>
                      <td className="px-5 py-2.5 text-right">{(calc.percentage * 100).toFixed(1)}%</td>
                      <td className="px-5 py-2.5 text-right">{calc.serve_amount.toFixed(2)}</td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(calc.price_per_kg)}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(calc.price_per_unit)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 text-sm">
                {/* Wastage line — sits between the last ingredient and the subtotal */}
                {product.wastage_pct > 0 && (
                  <tr className="border-t border-gray-200">
                    <td colSpan={7} className="px-5 py-2 text-xs text-gray-600">
                      + Contingency / wastage ({(product.wastage_pct * 100).toFixed(1)}%)
                    </td>
                    <td className="px-5 py-2 text-right text-xs tabular-nums text-gray-600">
                      {formatCurrency(summary.ingredient_total_per_pack - summary.ingredient_subtotal)}
                    </td>
                  </tr>
                )}

                {/* Subtotal per pack — includes wastage */}
                <tr className={product.wastage_pct > 0 ? '' : 'border-t border-gray-200'}>
                  <td colSpan={2} className="px-5 py-2 font-medium">Ingredients subtotal (per pack)</td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    {bomItems.reduce((s, i) => s + Number(i.quantity_g || 0), 0).toFixed(2)}
                  </td>
                  <td colSpan={4}></td>
                  <td className="px-5 py-2 text-right font-semibold tabular-nums">
                    {formatCurrency(summary.ingredient_total_per_pack)}
                  </td>
                </tr>

                {/* Serving-size scaling (only when serving ≠ pack) */}
                {summary.serving_multiplier !== 1 && (
                  <>
                    <tr>
                      <td colSpan={7} className="px-5 py-2 text-xs text-gray-500">
                        × Serving multiplier ({summary.serving_multiplier.toFixed(2)}× — serving {product.serving_size} g ÷ pack {product.size_g} g)
                      </td>
                      <td className="px-5 py-2 text-right text-xs tabular-nums">
                        {formatCurrency(summary.ingredient_total - summary.ingredient_total_per_pack)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={7} className="px-5 py-2 font-medium">Ingredient total (per serving)</td>
                      <td className="px-5 py-2 text-right font-semibold tabular-nums">{formatCurrency(summary.ingredient_total)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>

            <div className="grid grid-cols-2 gap-x-10 gap-y-1 px-5 py-4 text-sm border-t border-gray-100 bg-gray-50/50">
              <LineItem label="Packaging" value={product.packaging} />
              <LineItem label="Toll"      value={product.toll} />
              <LineItem label="Margin"    value={product.margin} />
              <LineItem label="Task / other" value={product.other} />
              <div className="flex justify-between col-span-2">
                <span className="text-gray-600">Freight</span>
                <span className="font-medium">{product.freight != null ? formatCurrency(product.freight) : '—'}</span>
              </div>
              <div className="flex justify-between col-span-2 pt-2 mt-1 border-t border-gray-200 text-base">
                <span className="font-semibold">Base cost (AU total)</span>
                <span className="font-semibold">{formatCurrency(summary.au_grand_total)}</span>
              </div>
              {product.apply_fx && (
                <div className="flex justify-between col-span-2 text-base">
                  <span className="font-semibold">+ FX × {Number(settings.fx_rate).toFixed(4)} → NZ total</span>
                  <span className="font-semibold">{formatCurrency(summary.nz_grand_total)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Meta({
  label, value, colSpan, multiline,
}: {
  label: string; value: string | number | null | undefined; colSpan?: boolean; multiline?: boolean
}) {
  return (
    <div className={colSpan ? 'col-span-2' : ''}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`font-medium ${multiline ? 'text-sm leading-relaxed' : ''}`}>
        {value ?? <span className="text-gray-300">—</span>}
      </dd>
    </div>
  )
}

function Tile({
  label, value, sub, dark, accent, positive,
}: {
  label: string; value: string; sub?: string
  dark?: boolean; accent?: boolean; positive?: boolean
}) {
  const base = 'p-3 rounded-md'
  const cls = dark
    ? `${base} bg-gray-900 text-white`
    : positive
      ? `${base} bg-green-50 text-green-800`
      : accent
        ? `${base} bg-amber-50 text-amber-800`
        : `${base} bg-gray-50`
  const subCls = dark
    ? 'text-white/70'
    : positive
      ? 'text-green-700'
      : accent
        ? 'text-amber-700'
        : 'text-gray-500'
  const labelCls = subCls
  return (
    <div className={cls}>
      <div className={`text-[11px] uppercase tracking-wider font-semibold ${labelCls}`}>{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {sub && <div className={`text-[11px] ${subCls}`}>{sub}</div>}
    </div>
  )
}

function LineItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{value != null ? formatCurrency(value) : '—'}</span>
    </div>
  )
}
