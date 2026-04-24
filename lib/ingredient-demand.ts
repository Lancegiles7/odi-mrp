/**
 * Ingredient demand helpers. Pure functions — no DB calls.
 *
 * Given product-level units by month (either forecast grand totals or
 * production plans) and BOM data, roll up per-ingredient demand per month
 * and track which products contribute what.
 *
 * Unit conversion: bom_items.quantity_g is grams per product unit.
 *   - If the ingredient UOM is kg → divide by 1000 to report in kg.
 *   - Otherwise → report in grams (or the ingredient's native count).
 * Liquid/each UOMs are displayed as-is; a conversion table can be added later.
 */

// ============================================================
// Inputs
// ============================================================

export interface IngredientDemandInput {
  /** ingredient-level metadata keyed by id */
  ingredients: Array<{
    id: string
    sku_code: string
    name: string
    unit_of_measure: string | null
    supplier_id: string | null
    opening_stock_override: number | null
  }>

  /** suppliers keyed by id (supplier_id may be null on an ingredient) */
  suppliers: Array<{ id: string; name: string }>

  /** active BOM rows: one per product → bom_id */
  activeBomByProduct: Map<string, string>

  /** BOM line items grouped by bom_id */
  bomItemsByBom: Map<string, Array<{
    ingredient_id: string
    quantity_g: number
  }>>

  /** products keyed by id (non-deleted only) */
  products: Array<{ id: string; sku_code: string; name: string }>

  /** month → product_id → units (from forecast grand total or production plan) */
  unitsByMonthByProduct: Map<string, Map<string, number>>

  /** rolling month keys in display order (e.g. '2026-04-01') */
  months: string[]
}

// ============================================================
// Outputs
// ============================================================

export interface IngredientRow {
  ingredient: {
    id: string
    sku_code: string
    name: string
    unit_of_measure: string | null
    opening_stock_override: number | null
  }
  /** month → demand in the ingredient's display UOM */
  demandByMonth: Map<string, number>
  /** total across the window */
  totalDemand: number
  /** product contributions: productId → per-month + total */
  products: Array<{
    id: string
    sku_code: string
    name: string
    gramsPerUnit: number
    demandByMonth: Map<string, number>
    totalDemand: number
  }>
}

export interface SupplierGroup {
  supplier: { id: string | null; name: string }
  ingredients: IngredientRow[]
}

// ============================================================
// Conversion
// ============================================================

/**
 * Convert grams (as stored on bom_items.quantity_g) to the display unit.
 * Weight-based ingredients (g, kg, or unset) are always shown in kg.
 * Non-weight units (each, L, mL) pass through unchanged — kg doesn't apply.
 */
export function convertGramsToIngredientUom(grams: number, uom: string | null): number {
  const u = (uom ?? '').trim().toLowerCase()
  if (u === 'each' || u === 'l' || u === 'ml') return grams
  return grams / 1000
}

/** Short label for the ingredient's demand unit. */
export function demandUnitLabel(uom: string | null): string {
  const u = (uom ?? '').trim().toLowerCase()
  if (u === 'each') return 'each'
  if (u === 'l')    return 'L'
  if (u === 'ml')   return 'mL'
  // Weight-based (and unset) all display as kg
  return 'kg'
}

// ============================================================
// Aggregation
// ============================================================

export function aggregateIngredientDemand(input: IngredientDemandInput): SupplierGroup[] {
  const {
    ingredients, suppliers, activeBomByProduct, bomItemsByBom,
    products, unitsByMonthByProduct, months,
  } = input

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))
  const supplierById   = new Map(suppliers.map((s) => [s.id, s]))
  const productById    = new Map(products.map((p) => [p.id, p]))

  // Initialise per-ingredient accumulators
  const rowsByIngredient = new Map<string, IngredientRow>()
  for (const ing of ingredients) {
    rowsByIngredient.set(ing.id, {
      ingredient: {
        id: ing.id,
        sku_code: ing.sku_code,
        name: ing.name,
        unit_of_measure: ing.unit_of_measure,
        opening_stock_override: ing.opening_stock_override,
      },
      demandByMonth: new Map(months.map((m) => [m, 0])),
      totalDemand: 0,
      products: [],
    })
  }

  // Walk: for each product with an active BOM, multiply each bom line's
  // quantity_g by that product's monthly units, convert to ingredient UOM,
  // and accumulate into the ingredient row (plus its per-product breakdown).
  for (const [productId, bomId] of activeBomByProduct.entries()) {
    const product = productById.get(productId)
    if (!product) continue

    const items = bomItemsByBom.get(bomId)
    if (!items || items.length === 0) continue

    for (const item of items) {
      const row = rowsByIngredient.get(item.ingredient_id)
      if (!row) continue  // ingredient deleted / not loaded

      const perProduct = {
        id: product.id,
        sku_code: product.sku_code,
        name: product.name,
        gramsPerUnit: Number(item.quantity_g) || 0,
        demandByMonth: new Map<string, number>(months.map((m) => [m, 0])),
        totalDemand: 0,
      }

      let productAny = false
      for (const m of months) {
        const units = unitsByMonthByProduct.get(m)?.get(productId) ?? 0
        if (!units) continue
        const grams = units * perProduct.gramsPerUnit
        const qty = convertGramsToIngredientUom(grams, row.ingredient.unit_of_measure)
        perProduct.demandByMonth.set(m, qty)
        perProduct.totalDemand += qty
        row.demandByMonth.set(m, (row.demandByMonth.get(m) ?? 0) + qty)
        row.totalDemand += qty
        productAny = true
      }

      if (productAny) row.products.push(perProduct)
    }
  }

  // Group rows by supplier
  const groupsBySupplier = new Map<string | null, SupplierGroup>()
  for (const ing of ingredients) {
    const row = rowsByIngredient.get(ing.id)!
    // Drop ingredients with zero demand and no opening stock — they'd clutter
    if (row.totalDemand === 0 && row.ingredient.opening_stock_override == null) continue

    const sKey = ing.supplier_id
    if (!groupsBySupplier.has(sKey)) {
      const sup = sKey ? supplierById.get(sKey) : null
      groupsBySupplier.set(sKey, {
        supplier: { id: sKey, name: sup?.name ?? 'Supplier not set' },
        ingredients: [],
      })
    }
    groupsBySupplier.get(sKey)!.ingredients.push(row)
  }

  // Sort ingredients within a group by name; groups by supplier name (unset last)
  const groups = Array.from(groupsBySupplier.values())
  for (const g of groups) g.ingredients.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
  groups.sort((a, b) => {
    if (a.supplier.id === null) return 1
    if (b.supplier.id === null) return -1
    return a.supplier.name.localeCompare(b.supplier.name)
  })

  return groups
}

// ============================================================
// Shortfall detection
// ============================================================

/**
 * Per-month shortfall flags against opening stock. A month is a shortfall
 * when cumulative demand from month 0..m exceeds opening stock.
 */
export function monthShortfalls(
  row: IngredientRow,
  opening: number,
  months: string[],
): Map<string, boolean> {
  const out = new Map<string, boolean>()
  let cumulative = 0
  for (const m of months) {
    cumulative += row.demandByMonth.get(m) ?? 0
    out.set(m, cumulative > opening)
  }
  return out
}

export function hasAnyShortfall(
  row: IngredientRow,
  opening: number,
  months: string[],
): boolean {
  let cumulative = 0
  for (const m of months) {
    cumulative += row.demandByMonth.get(m) ?? 0
    if (cumulative > opening) return true
  }
  return false
}
