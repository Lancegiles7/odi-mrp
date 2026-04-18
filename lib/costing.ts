/**
 * Cost calculation utilities for the Product + BOM module.
 * All calculations happen here in TypeScript — nothing is stored.
 */

import type { BomItemWithIngredient, Product, ProductCostSummary } from './types/database.types'

/**
 * Calculate cost per unit for a single BOM item line.
 * price_per_kg = price_override if set, else ingredient.total_loaded_cost
 * price_per_unit = (quantity_g / 1000) * price_per_kg
 */
export function calcLinePrice(item: BomItemWithIngredient): number {
  const pricePerKg =
    item.price_override ??
    item.ingredients.total_loaded_cost ??
    0
  return round2((item.quantity_g / 1000) * pricePerKg)
}

/**
 * Calculate derived display values for a BOM item line.
 * Used in both the detail view and the BOM editor.
 */
export function calcBomLineValues(
  item: BomItemWithIngredient,
  sizeG: number,
  servingSize: number
) {
  const pricePerKg = item.price_override ?? item.ingredients.total_loaded_cost ?? 0
  const unitInKg   = round4(item.quantity_g / 1000)
  const pct        = sizeG > 0 ? round4(item.quantity_g / sizeG) : 0
  const serveAmt   = sizeG > 0 ? round2((item.quantity_g / sizeG) * servingSize) : 0
  const pricePerUnit = round2(unitInKg * pricePerKg)

  return {
    unit_in_kg:   unitInKg,
    percentage:   pct,
    serve_amount: serveAmt,
    price_per_kg: round2(pricePerKg),
    price_per_unit: pricePerUnit,
  }
}

/**
 * Calculate the full cost summary for a product given its BOM items.
 */
export function calcProductCostSummary(
  product: Pick<Product, 'rrp' | 'packaging' | 'toll' | 'margin' | 'other' | 'currency_exchange' | 'freight'>,
  bomItems: BomItemWithIngredient[]
): ProductCostSummary {
  const ingredientTotal = bomItems.reduce((sum, item) => sum + calcLinePrice(item), 0)

  const grandTotal = round2(
    ingredientTotal +
    (product.packaging        ?? 0) +
    (product.toll             ?? 0) +
    (product.margin           ?? 0) +
    (product.other            ?? 0) +
    (product.currency_exchange ?? 0) +
    (product.freight          ?? 0)
  )

  const cos = product.rrp && product.rrp > 0
    ? round4(grandTotal / product.rrp)
    : null

  const gp = cos !== null ? round4(1 - cos) : null

  return {
    ingredient_total: round2(ingredientTotal),
    grand_total:      grandTotal,
    cos,
    gp,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
