import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { calcProductCostSummary, calcBomLineValues } from '@/lib/costing'
import { getAppSettings } from '@/lib/settings'
import { PRODUCT_GROUP_LABELS, ROLES, packagingTypeLabel } from '@/lib/constants'
import { DeleteProductButton } from '@/components/products/delete-product-button'
import { ProductCostOverview } from '@/components/products/product-cost-overview'
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

  const [{ data: product }, settings, { data: packagingLinks }] = await Promise.all([
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
  // NZ build = the default recipe (untagged rows count as NZ); AU build optional.
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

  // BOM ingredient lines are shown in their supplier currency; the totals are
  // NZD (loaded cost). When every line shares one foreign currency, show the
  // conversion explicitly (e.g. AUD subtotal × FX → NZD).
  const ingCurrencies = Array.from(new Set(bomItems.map((i) => i.ingredients.currency ?? 'NZD')))
  const uniformForeign = ingCurrencies.length === 1 && ingCurrencies[0] !== 'NZD' ? ingCurrencies[0] : null
  const curSym = (c: string | null | undefined) => (c === 'AUD' ? 'A$' : c && c !== 'NZD' ? `${c} ` : '$')

  // Native (supplier-currency) ingredient totals — the true AUD figures, summed
  // straight from the per-line WET grams × price, parallel to the NZD loaded totals.
  const nativeRaw = bomItems.reduce(
    (s, i) => s + (Number(i.wet_quantity_g ?? i.quantity_g ?? 0) / 1000) * Number(i.price_override ?? i.ingredients.price ?? 0),
    0,
  )
  const nativePerPack    = Math.round(nativeRaw * (1 + Number(product.wastage_pct ?? 0)) * 100) / 100
  const nativePerServing = Math.round(nativePerPack * summary.serving_multiplier * 100) / 100
  const fSym = curSym(uniformForeign)
  // Freeze-dried = any line whose wet input differs from its dry amount.
  const isFreezeDried = bomItems.some((i) => i.wet_quantity_g != null && Number(i.wet_quantity_g) !== Number(i.quantity_g))
  const totalDryG = bomItems.reduce((s, i) => s + Number(i.quantity_g || 0), 0)
  const totalWetG = bomItems.reduce((s, i) => s + Number(i.wet_quantity_g ?? i.quantity_g ?? 0), 0)

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
            {summary.is_dual_manufacture && (
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                Dual build · {product.manufacturer ?? 'NZ'} + {product.manufacturer_au ?? 'VMC'}
              </span>
            )}
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
            href={`/products/${params.id}/print`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Export PDF
          </Link>
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
            <Meta label={isFreezeDried ? 'Size (dry pack)' : 'Size'} value={product.size_g != null ? `${product.size_g} g` : null} />
            <Meta label="Serving size" value={product.serving_size != null ? `${product.serving_size} g` : null} />
            {isFreezeDried && (
              <Meta label="Wet input → dry" value={`${totalWetG.toFixed(1)} g wet → ${totalDryG.toFixed(1)} g dry`} />
            )}
            <Meta label="RRP — NZ (inc GST)" value={product.rrp != null ? formatCurrency(product.rrp) : null} />
            <Meta label="RRP — AU (inc GST)" value={(product.rrp_au ?? product.rrp) != null ? `A${formatCurrency(product.rrp_au ?? product.rrp ?? 0)}` : null} />
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

      {/* Cost summary — NZ then AU; RRP inc GST → GP (% · $) → Cost ($ · %) */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Cost summary</h3>
          <span className="text-xs text-gray-500">FX (AUD → NZD) <span className="font-mono font-semibold">{Number(settings.fx_rates.AUD).toFixed(4)}</span></span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MarketCard
            name="New Zealand" currency="NZD" headerClass="bg-gray-900" sym="$"
            rrp={product.rrp}
            gp={summary.gp_nz} gpAmount={summary.gp_nz_amount}
            cost={summary.nz_grand_total} cos={summary.cos_nz}
            maker={product.manufacturer}
          />
          <MarketCard
            name="Australia" currency="AUD" headerClass="bg-[#1e3a5f]" sym="A$"
            rrp={product.rrp_au ?? product.rrp}
            gp={summary.gp_au} gpAmount={summary.gp_au_amount}
            cost={summary.au_grand_total} cos={summary.cos_au}
            maker={summary.is_dual_manufacture ? product.manufacturer_au : product.manufacturer}
          />
        </div>

        <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex justify-between gap-4">
          <span>Cost build-up · Ingredients {formatCurrency(summary.ingredient_total)} → NZ total {formatCurrency(summary.nz_grand_total)}</span>
          <span>GP % and Cost % are on ex-GST RRP ({formatCurrency(summary.rrp_ex_gst_nz)} NZ / A{formatCurrency(summary.rrp_ex_gst_au)} AU)</span>
        </div>
      </div>

      {/* Whole-BOM cost & margin, toggleable NZD / AUD */}
      <ProductCostOverview
        fx={Number(settings.fx_rates.AUD)}
        ingredientTotal={summary.ingredient_total}
        packaging={Number(product.packaging) || 0}
        toll={Number(product.toll) || 0}           tollCurrency={product.toll_currency ?? 'AUD'}
        margin={Number(product.margin) || 0}       marginCurrency={product.margin_currency ?? 'AUD'}
        other={Number(product.other) || 0}         otherCurrency={product.other_currency ?? 'AUD'}
        freightNz={Number(product.freight_nz ?? product.freight) || 0} freightNzCurrency={product.freight_nz_currency ?? 'NZD'}
        freightAu={Number(product.freight_au ?? product.freight) || 0} freightAuCurrency={product.freight_au_currency ?? 'NZD'}
        rrpExNz={summary.rrp_ex_gst_nz}
        rrpExAu={summary.rrp_ex_gst_au}
        isDual={summary.is_dual_manufacture}
        auIngredientTotal={summary.au_ingredient_total}
        auToll={summary.au_toll}
        manufacturerNz={product.manufacturer}
        manufacturerAu={product.manufacturer_au}
      />

      {/* BOM table (read-only on detail; edit via Edit page which hosts the editor) */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Bill of materials</h3>
            <div className="text-xs text-gray-500 mt-0.5">
              {bomItems.length} ingredient{bomItems.length === 1 ? '' : 's'}{activeBom ? ` · Version ${activeBom.version} (active)` : ''}
              {uniformForeign && <span className="text-gray-400"> · prices in {uniformForeign}, converted to NZD</span>}
            </div>
          </div>
          <div className="text-right bg-[#f0f4ec] border border-[#dbe7cf] rounded-lg px-4 py-2">
            <div className="text-[11px] text-[#3b6d11]">Total ingredients · NZD</div>
            <div className="text-xl font-bold text-[#27500a] tabular-nums">{formatCurrency(summary.ingredient_total)}</div>
            {uniformForeign && (
              <div className="text-[11px] text-gray-500">from {fSym}{nativePerServing.toFixed(2)} {uniformForeign}</div>
            )}
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
                  <th className="text-right font-medium px-5 py-2">Dry g</th>
                  <th className="text-right font-medium px-5 py-2 text-blue-600">Wet g</th>
                  <th className="text-right font-medium px-5 py-2">% of wt</th>
                  <th className="text-right font-medium px-5 py-2">Serve (g)</th>
                  <th className="text-right font-medium px-5 py-2">$/kg <span className="text-gray-400 normal-case">(supplier)</span></th>
                  <th className="text-right font-medium px-5 py-2">$/unit <span className="text-gray-400 normal-case">(supplier)</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bomItems.map((item) => {
                  const calc = calcBomLineValues(item, product.size_g ?? 0, product.serving_size ?? 0)
                  // Per-line price shown in the ingredient's supplier currency.
                  const cur        = item.ingredients.currency ?? 'NZD'
                  const sym        = curSym(cur)
                  const nativePerKg   = item.price_override ?? item.ingredients.price ?? 0
                  const nativePerUnit = calc.unit_in_kg * nativePerKg
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
                      <td className="px-5 py-2.5 text-right text-blue-700 tabular-nums">{Number(item.wet_quantity_g ?? item.quantity_g)}</td>
                      <td className="px-5 py-2.5 text-right">{(calc.percentage * 100).toFixed(1)}%</td>
                      <td className="px-5 py-2.5 text-right">{calc.serve_amount.toFixed(2)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{sym}{nativePerKg.toFixed(2)} <span className="text-[10px] text-gray-400">{cur}</span></td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums">{sym}{nativePerUnit.toFixed(2)}</td>
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
                    {uniformForeign && <span className="text-gray-500 font-normal">{fSym}{nativePerPack.toFixed(2)} → </span>}
                    {formatCurrency(summary.ingredient_total_per_pack)}<span className="text-[10px] text-gray-400 font-normal"> NZD</span>
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
                      <td className="px-5 py-2 text-right font-semibold tabular-nums">
                        {uniformForeign && <span className="text-gray-500 font-normal">{fSym}{nativePerServing.toFixed(2)} → </span>}
                        {formatCurrency(summary.ingredient_total)}<span className="text-[10px] text-gray-400 font-normal"> NZD</span>
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>

            {/* Packaging sub-items. Toll / margin / task / freight and the
                NZ & AU totals (with per-line currency) are in the cost &
                margin panel above, toggleable by currency. */}
            <div className="px-5 py-4 text-sm border-t border-gray-100 bg-gray-50/50 space-y-1">
              <PackagingBreakdown
                links={packagingLinks ?? []}
                total={Number(product.packaging) || 0}
              />
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

// Per-market cost card: RRP (inc GST) → GP (% · $) → Cost ($ · %).
function MarketCard({
  name, currency, headerClass, sym, rrp, gp, gpAmount, cost, cos, maker,
}: {
  name: string; currency: string; headerClass: string; sym: string
  rrp: number | null; gp: number | null; gpAmount: number | null
  cost: number; cos: number | null; maker?: string | null
}) {
  const money = (v: number) => `${sym}${Number(v).toFixed(2)}`
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className={`${headerClass} text-white px-3.5 py-2 text-sm font-semibold flex items-baseline justify-between`}>
        <span>{name} <span className="text-xs text-white/50 font-normal">{currency}</span></span>
        {maker && <span className="text-[11px] text-white/70 font-normal">{maker}</span>}
      </div>
      <div className="p-3.5">
        <div className="flex justify-between items-baseline pb-2.5 border-b border-gray-100">
          <span className="text-sm text-gray-500">RRP (inc GST)</span>
          <span className="text-base font-semibold tabular-nums">{rrp != null && rrp > 0 ? money(rrp) : '—'}</span>
        </div>
        <div className="flex justify-between items-baseline py-2.5 border-b border-gray-100">
          <span className="text-sm text-emerald-700">GP</span>
          <span className="tabular-nums text-emerald-800">
            {gp !== null
              ? <><b className="text-lg">{Math.round(gp * 100)}%</b> <span className="text-sm">· {money(gpAmount ?? 0)}</span></>
              : '—'}
          </span>
        </div>
        <div className="flex justify-between items-baseline pt-2.5">
          <span className="text-sm text-gray-500">Cost</span>
          <span className="tabular-nums">
            <b className="text-base">{money(cost)}</b>
            {cos !== null && <span className="text-sm text-gray-500"> · {Math.round(cos * 100)}%</span>}
          </span>
        </div>
      </div>
    </div>
  )
}

function PackagingBreakdown({
  links, total,
}: {
  links: Array<{
    packaging_id: string
    quantity_per_unit: number
    entry_mode: string | null
    entry_value: number | null
    include_in_cost: boolean
    packaging: { sku_code: string; name: string; type: string; total_loaded_cost_nzd: number | null } | null
  }>
  total: number
}) {
  const rows = links
    .filter((l) => l.packaging != null)
    .sort((a, b) => (a.packaging?.name ?? '').localeCompare(b.packaging?.name ?? ''))

  if (rows.length === 0) {
    return <LineItem label="Packaging" value={total > 0 ? total : null} />
  }

  return (
    <div className="col-span-2">
      <div className="flex justify-between font-medium">
        <span className="text-gray-700">Packaging</span>
        <span>{formatCurrency(total)}</span>
      </div>
      <ul className="mt-1 space-y-0.5 pl-3 border-l-2 border-gray-200 text-xs">
        {rows.map((l) => {
          const qty = Number(l.quantity_per_unit) || 0
          const unitCost = Number(l.packaging?.total_loaded_cost_nzd) || 0
          const contribution = qty * unitCost
          const excluded = !l.include_in_cost
          const entryDisplay = l.entry_mode === 'per_group' && l.entry_value
            ? `${Number(l.entry_value)} per ${packagingTypeLabel(l.packaging?.type ?? 'OTHER')} (= ${qty.toFixed(4)} per pack)`
            : `${qty} per pack`
          return (
            <li key={l.packaging_id} className="flex justify-between gap-2">
              <span className={`flex-1 truncate ${excluded ? 'text-gray-400' : 'text-gray-600'}`}>
                · {packagingTypeLabel(l.packaging?.type ?? 'OTHER')} — {l.packaging?.name}{' '}
                <span className="text-gray-400">({entryDisplay} × ${unitCost.toFixed(4)})</span>
              </span>
              <span className={`tabular-nums ${excluded ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                {excluded ? 'excluded' : formatCurrency(contribution)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
