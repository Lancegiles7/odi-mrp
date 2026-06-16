/**
 * Cost calculation utilities for the Product + BOM module.
 * All calculations happen here in TypeScript — nothing is stored.
 *
 * Costing model (per spec, 2026-06 — per-line currency):
 *   ingredient_subtotal = Σ (quantity_g / 1000) × price_per_kg     (NZD; ingredients are loaded to NZD via FX)
 *   ingredient_total    = ingredient_subtotal × (1 + wastage_pct) × serving_multiplier
 *
 *   Each cost input carries its own currency. Ingredients & packaging are
 *   already loaded to NZD on their own records; toll / margin / task / freight
 *   carry an explicit AUD|NZD flag on the product. Totals are built per market:
 *     nz_grand_total = Σ each line converted → NZD   (uses freight_nz)
 *     au_grand_total = Σ each line converted → AUD   (uses freight_au)
 *   computed independently — au is NOT nz ÷ fx, because each line's native
 *   currency differs. base_cost mirrors nz_grand_total (NZD).
 *
 *   cos_nz = nz_grand_total / (rrp / (1 + gst_nz_pct))
 *   cos_au = au_grand_total / (rrp / (1 + gst_au_pct))
 *
 *  fx_rate is "AUD → NZD" (i.e. NZD per 1 AUD, e.g. 1.20): AUD×fx → NZD,
 *  NZD÷fx → AUD. The per-product `apply_fx` flag is no longer read.
 */

import type {
  BomItemWithIngredient,
  Product,
  ProductCostSummary,
} from './types/database.types'
import type { SettingsSnapshot } from './settings'

// The grams that drive cost & procurement: the WET input where set (freeze-
// dried), else the dry quantity. Dry powders / normal lines leave wet null.
export function lineWetGrams(item: BomItemWithIngredient): number {
  return Number(item.wet_quantity_g ?? item.quantity_g) || 0
}

// Count-based units (each pouch / unit / case …) are priced per unit and the
// BOM quantity is a unit count, not grams. Weight units (kg/g) are priced per
// kg and the BOM quantity is grams.
const COUNT_UOMS = new Set(['each', 'unit', 'case', 'box', 'bag', 'pallet'])
export function isCountUom(uom: string | null | undefined): boolean {
  return COUNT_UOMS.has((uom ?? '').trim().toLowerCase())
}

// Cost of a quantity at a per-unit-of-measure price. For count items the price
// is per unit and qty is a unit count (no /1000); for weight items the price is
// per kg and qty is grams.
function costAtUom(qty: number, perUom: number, uom: string | null | undefined): number {
  return isCountUom(uom) ? round2(qty * perUom) : round2((qty / 1000) * perUom)
}

// Per-line price for a BOM item — costed on the wet input (no wastage here;
// that's a total-level operation per the revised spec).
export function calcLinePrice(item: BomItemWithIngredient): number {
  const perUom =
    item.price_override ??
    item.ingredients.total_loaded_cost ??
    0
  return costAtUom(lineWetGrams(item), perUom, item.ingredients.unit_of_measure)
}

// Australian per-line price for a dual-made product (AUD). Uses the
// ingredient's AU landed cost where set; otherwise falls back to the NZ cost
// (BOM override first, then the NZD loaded cost) converted at FX. Only the AU
// build of a dual-manufactured product calls this — single-manufacturer
// products still convert the NZ total wholesale.
export function calcLinePriceAu(item: BomItemWithIngredient, fxRate: number): number {
  const nzPerUom = item.price_override ?? item.ingredients.total_loaded_cost ?? 0
  const auPerUom =
    item.ingredients.total_loaded_cost_au ??
    (fxRate > 0 ? nzPerUom / fxRate : nzPerUom)
  return costAtUom(lineWetGrams(item), auPerUom, item.ingredients.unit_of_measure)
}

// Derived display values for each BOM row. Cost is on wet grams; % of weight
// stays on the dry composition (what's in the sold pack). Count items (each /
// unit) carry a unit count instead of grams — % of weight doesn't apply.
export function calcBomLineValues(
  item: BomItemWithIngredient,
  sizeG: number,
  servingSize: number,
) {
  const perUom        = item.price_override ?? item.ingredients.total_loaded_cost ?? 0
  const isCount       = isCountUom(item.ingredients.unit_of_measure)
  const wetG          = lineWetGrams(item)
  // For count items unit_in_kg holds the unit count (so unit_in_kg × per-unit
  // price still yields the line cost); for weight items it's kg.
  const unitInKg      = isCount ? round4(wetG) : round4(wetG / 1000)
  const pct           = !isCount && sizeG > 0 ? round4(item.quantity_g / sizeG) : 0
  const serveAmt      = !isCount && sizeG > 0 ? round2((item.quantity_g / sizeG) * servingSize) : 0
  const pricePerUnit  = costAtUom(wetG, perUom, item.ingredients.unit_of_measure)

  return {
    unit_in_kg:     unitInKg,
    percentage:     pct,
    serve_amount:   serveAmt,
    price_per_kg:   round2(perUom),
    price_per_unit: pricePerUnit,
    is_count:       isCount,
  }
}

/**
 * Full cost summary for a product. Needs both the BOM lines and the
 * current global settings (FX rate + GST rates).
 *
 * Ingredient cost scales from pack → serving by (serving_size / size_g)
 * when both are set. For a product whose pack == serving, the multiplier
 * is 1.0 and nothing changes. For a 30g pack with a 120g serving, the
 * ingredient cost gets multiplied by 4 before being added to the other
 * per-pack costs (packaging, toll, margin, task, freight).
 */
export function calcProductCostSummary(
  product: Pick<
    Product,
    | 'rrp'
    | 'rrp_au'
    | 'size_g'
    | 'serving_size'
    | 'packaging'
    | 'packaging_au'
    | 'toll'
    | 'margin'
    | 'other'
    | 'freight'
    | 'freight_nz'
    | 'freight_au'
    | 'toll_currency'
    | 'margin_currency'
    | 'other_currency'
    | 'freight_nz_currency'
    | 'freight_au_currency'
    | 'apply_fx'
    | 'wastage_pct'
    | 'manufacturer_au'
    | 'toll_au'
  >,
  bomItems: BomItemWithIngredient[],
  settings: Pick<SettingsSnapshot, 'fx_rate' | 'gst_nz_pct' | 'gst_au_pct' | 'fx_rates'>,
  // The AU build's own recipe (market = 'AU' BOM). When omitted, a dual product
  // falls back to the NZ recipe priced at AU ingredient costs (Phase 1 behaviour).
  auBomItems?: BomItemWithIngredient[],
): ProductCostSummary {
  // Ingredient cost — each line costed on its WET grams (the input that's
  // bought), via calcLinePrice. Freeze-dried lines carry a wet_quantity_g;
  // dry powders / normal lines fall back to quantity_g.
  const ingredientSubtotal = bomItems.reduce(
    (sum, item) => sum + calcLinePrice(item),
    0,
  )

  const wastagePct            = Number(product.wastage_pct ?? 0)
  const ingredientTotalPerPack = round2(ingredientSubtotal * (1 + wastagePct))

  // Serving-size scaling only applies when a serving is LARGER than the pack
  // (e.g. a 30g snack pack whose nutritional serving is 120g = 4 packs).
  // For products where the pack is multi-serve (tub with small spoonful
  // servings), the pack cost is what's sold — no scaling.
  const sizeG             = Number(product.size_g) || 0
  const servingSize       = Number(product.serving_size) || 0
  const servingMultiplier =
    sizeG > 0 && servingSize > sizeG ? servingSize / sizeG : 1
  const ingredientTotal   = round2(ingredientTotalPerPack * servingMultiplier)

  // FX: NZD per 1 AUD (e.g. 1.20). Used to convert each cost input between
  // markets. Single source of truth: settings.fx_rates.AUD. apply_fx is kept
  // on the row for back-compat but no longer read.
  const fxRate = Number(settings.fx_rates?.AUD) || 1
  const toNzd = (v: number, cur?: string | null) => (cur === 'AUD' ? v * fxRate : v)
  const toAud = (v: number, cur?: string | null) => (cur === 'AUD' ? v : (fxRate > 0 ? v / fxRate : v))

  // Each product-level input carries its own currency (toll/margin/task are
  // typically AUD; freight typically NZD). Ingredients and packaging are
  // already loaded to NZD on their own records, so they're NZD here.
  const packaging = Number(product.packaging ?? 0)
  const toll      = Number(product.toll   ?? 0)
  const margin    = Number(product.margin ?? 0)
  const other     = Number(product.other  ?? 0)
  const tollCur   = product.toll_currency   ?? 'AUD'
  const marginCur = product.margin_currency ?? 'AUD'
  const otherCur  = product.other_currency  ?? 'AUD'

  // Freight is country-specific. Fall back to the legacy single `freight`
  // value on rows not yet migrated to freight_nz / freight_au.
  const freightNz    = Number(product.freight_nz ?? product.freight ?? 0)
  const freightAu    = Number(product.freight_au ?? product.freight ?? 0)
  const freightNzCur = product.freight_nz_currency ?? 'NZD'
  const freightAuCur = product.freight_au_currency ?? 'NZD'

  // Dual-manufacture: when manufacturer_au is set the product is made
  // separately in Australia (VMC), so the AU build has its own ingredient
  // landed costs and its own toll (AUD) — it is NOT just the NZ build ÷ FX.
  // When manufacturer_au is blank, isDual is false and every AU figure below
  // collapses to "NZ converted at FX" — i.e. exactly the previous behaviour.
  const isDual = !!(product.manufacturer_au && String(product.manufacturer_au).trim())

  // AU build's recipe: its own market='AU' BOM when present, else the NZ recipe
  // priced at AU ingredient costs (Phase 1 fallback).
  const auItems = auBomItems && auBomItems.length > 0 ? auBomItems : bomItems

  // AU ingredient total (AUD). Dual: cost each AU line on its AU landed cost
  // (ingredient.total_loaded_cost_au, else NZ ÷ FX), then apply the same
  // wastage + serving scaling. Non-dual: the NZ total simply converted.
  const auIngredientTotal = isDual
    ? round2(
        auItems.reduce((sum, item) => sum + calcLinePriceAu(item, fxRate), 0) *
          (1 + wastagePct) *
          servingMultiplier,
      )
    : round2(toAud(ingredientTotal, 'NZD'))

  // AU packaging cost (NZD rollup, converted to AUD below). Dual: the AU build's
  // own packaging where it has any, else the NZ packaging. Non-dual: NZ.
  const auPackaging = isDual
    ? Number(product.packaging_au ?? product.packaging ?? 0)
    : packaging

  // AU toll (AUD). Dual: VMC's own toll where entered, else the NZ toll
  // converted (sensible auto-fill). Non-dual: the NZ toll converted.
  const auTollAmount = isDual
    ? (Number(product.toll_au) > 0 ? Number(product.toll_au) : toAud(toll, tollCur))
    : toAud(toll, tollCur)

  // NZ total — every line expressed in NZD (uses NZ freight). Always the
  // Brand Nation / NZ build.
  const nzGrandTotal = round2(
    ingredientTotal +
    packaging +
    toNzd(toll,      tollCur) +
    toNzd(margin,    marginCur) +
    toNzd(other,     otherCur) +
    toNzd(freightNz, freightNzCur),
  )

  // AU total — every line expressed in AUD (uses AU freight). For dual-made
  // products this is VMC's real build (AU ingredient costs + VMC toll);
  // otherwise it's the NZ build converted, computed per-line because each
  // input carries its own native currency.
  const auGrandTotal = round2(
    auIngredientTotal +
    toAud(auPackaging,     'NZD') +
    auTollAmount +
    toAud(margin,    marginCur) +
    toAud(other,     otherCur) +
    toAud(freightAu, freightAuCur),
  )

  // base_cost mirrors the NZ figure (NZD), as it always has.
  const baseCost = nzGrandTotal

  // NZ retail price (NZD) and AU retail price (AUD). rrp_au falls back to the
  // NZ rrp on rows not yet given a separate AU price.
  const rrpNz   = product.rrp ?? 0
  const rrpAu   = product.rrp_au ?? product.rrp ?? 0
  const gstNz   = Number(settings.gst_nz_pct) || 0
  const gstAu   = Number(settings.gst_au_pct) || 0

  const rrpExNz = rrpNz > 0 ? round2(rrpNz / (1 + gstNz)) : 0
  const rrpExAu = rrpAu > 0 ? round2(rrpAu / (1 + gstAu)) : 0

  const cosNz       = rrpExNz > 0 ? round4(nzGrandTotal / rrpExNz) : null
  const cosAu       = rrpExAu > 0 ? round4(auGrandTotal / rrpExAu) : null
  const gpNz        = cosNz !== null ? round4(1 - cosNz) : null
  const gpAu        = cosAu !== null ? round4(1 - cosAu) : null
  const gpNzAmount  = rrpExNz > 0 ? round2(rrpExNz - nzGrandTotal) : null
  const gpAuAmount  = rrpExAu > 0 ? round2(rrpExAu - auGrandTotal) : null

  return {
    ingredient_subtotal:     round2(ingredientSubtotal),
    ingredient_total_per_pack: ingredientTotalPerPack,
    serving_multiplier:      servingMultiplier,
    ingredient_total:        ingredientTotal,
    base_cost:               baseCost,
    nz_grand_total:          nzGrandTotal,
    au_grand_total:          auGrandTotal,
    rrp_ex_gst_nz:           rrpExNz,
    rrp_ex_gst_au:           rrpExAu,
    cos_nz:                  cosNz,
    cos_au:                  cosAu,
    gp_nz:                   gpNz,
    gp_au:                   gpAu,
    gp_nz_amount:            gpNzAmount,
    gp_au_amount:            gpAuAmount,
    is_dual_manufacture:     isDual,
    au_ingredient_total:     auIngredientTotal,
    au_toll:                 round2(auTollAmount),
    // Back-compat aliases — default to NZ view so old UI keeps working
    grand_total: nzGrandTotal,
    cos:         cosNz,
    gp:          gpNz,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
