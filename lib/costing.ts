/**
 * Cost calculation utilities for the Product + BOM module.
 * All calculations happen here in TypeScript — nothing is stored.
 *
 * Costing model (per spec, 2026-05 — NZD-base):
 *   ingredient_subtotal = Σ (quantity_g / 1000) × price_per_kg     (NZD; ingredients are loaded to NZD via FX)
 *   ingredient_total    = ingredient_subtotal × (1 + wastage_pct)
 *   base_cost           = ingredient_total + packaging + toll + margin + other + freight   (NZD)
 *   nz_grand_total      = base_cost                                                        (base IS NZD)
 *   au_grand_total      = base_cost ÷ fx_rate                                              (NZD → AUD)
 *   cos_nz              = nz_grand_total / (rrp / (1 + gst_nz_pct))
 *   cos_au              = au_grand_total / (rrp / (1 + gst_au_pct))
 *
 *  fx_rate is "AUD → NZD" (i.e. NZD per 1 AUD, e.g. 1.20). Dividing
 *  NZD by it gives AUD. The per-product `apply_fx` flag is no longer
 *  read by costing — AU is now always derived alongside NZ.
 */

import type {
  BomItemWithIngredient,
  Product,
  ProductCostSummary,
} from './types/database.types'
import type { SettingsSnapshot } from './settings'

// Per-line price for a BOM item (no wastage applied here — that's a
// total-level operation per the revised spec).
export function calcLinePrice(item: BomItemWithIngredient): number {
  const pricePerKg =
    item.price_override ??
    item.ingredients.total_loaded_cost ??
    0
  return round2((item.quantity_g / 1000) * pricePerKg)
}

// Derived display values for each BOM row.
export function calcBomLineValues(
  item: BomItemWithIngredient,
  sizeG: number,
  servingSize: number,
) {
  const pricePerKg    = item.price_override ?? item.ingredients.total_loaded_cost ?? 0
  const unitInKg      = round4(item.quantity_g / 1000)
  const pct           = sizeG > 0 ? round4(item.quantity_g / sizeG) : 0
  const serveAmt      = sizeG > 0 ? round2((item.quantity_g / sizeG) * servingSize) : 0
  const pricePerUnit  = round2(unitInKg * pricePerKg)

  return {
    unit_in_kg:     unitInKg,
    percentage:     pct,
    serve_amount:   serveAmt,
    price_per_kg:   round2(pricePerKg),
    price_per_unit: pricePerUnit,
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
    | 'size_g'
    | 'serving_size'
    | 'packaging'
    | 'toll'
    | 'margin'
    | 'other'
    | 'freight'
    | 'apply_fx'
    | 'wastage_pct'
  >,
  bomItems: BomItemWithIngredient[],
  settings: Pick<SettingsSnapshot, 'fx_rate' | 'gst_nz_pct' | 'gst_au_pct' | 'fx_rates'>,
): ProductCostSummary {
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

  const baseCost = round2(
    ingredientTotal +
    (product.packaging ?? 0) +
    (product.toll      ?? 0) +
    (product.margin    ?? 0) +
    (product.other     ?? 0) +
    (product.freight   ?? 0),
  )

  // NZD-base: base_cost is already in NZD (ingredients & packaging are
  // loaded to NZD via FX in lib/packaging-cost.ts and the ingredient
  // form). NZ grand total == base. AU is derived by dividing by the
  // AUD→NZD rate. apply_fx is kept on the row for back-compat but no
  // longer affects the calculation — AU is always shown.
  //
  // Single source of truth: settings.fx_rates.AUD (same rate the
  // loaded-cost converters use, so a round-trip on an AUD input is
  // exact). The legacy settings.fx_rate column is no longer read.
  const fxRate       = Number(settings.fx_rates?.AUD) || 1
  const nzGrandTotal = baseCost
  const auGrandTotal = fxRate > 0 ? round2(baseCost / fxRate) : baseCost

  const rrp     = product.rrp ?? 0
  const gstNz   = Number(settings.gst_nz_pct) || 0
  const gstAu   = Number(settings.gst_au_pct) || 0

  const rrpExNz = rrp > 0 ? round2(rrp / (1 + gstNz)) : 0
  const rrpExAu = rrp > 0 ? round2(rrp / (1 + gstAu)) : 0

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
