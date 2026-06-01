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

  /**
   * Open PO arrivals: ingredient_id → array of incoming line items.
   * Each entry is one PO line still expected to arrive (qty_ordered − qty_received,
   * in the ingredient's stock UOM), tagged with the PO number and the month
   * its expected_delivery_date falls in.
   */
  arrivalsByIngredient?: Map<string, Array<{
    po_id: string
    po_number: string
    month: string         // first-of-month key
    qty: number           // remaining-to-arrive in the ingredient's UOM
  }>>
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
  /** month → quantity arriving from open POs (in the ingredient's UOM). */
  arrivingByMonth: Map<string, number>
  /** PO breakdown per month — for hover/tooltip. */
  arrivingPosByMonth: Map<string, Array<{ po_number: string; po_id: string; qty: number }>>
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
      arrivingByMonth: new Map(months.map((m) => [m, 0])),
      arrivingPosByMonth: new Map(months.map((m) => [m, []])),
      products: [],
    })
  }

  // Fold in arrivals (open PO line items) per ingredient
  if (input.arrivalsByIngredient) {
    for (const [ingId, entries] of input.arrivalsByIngredient.entries()) {
      const row = rowsByIngredient.get(ingId)
      if (!row) continue
      for (const e of entries) {
        if (!row.arrivingByMonth.has(e.month)) continue   // outside the window
        row.arrivingByMonth.set(e.month, (row.arrivingByMonth.get(e.month) ?? 0) + e.qty)
        row.arrivingPosByMonth.get(e.month)!.push({ po_id: e.po_id, po_number: e.po_number, qty: e.qty })
      }
    }
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
    // Drop ingredients with zero demand AND no opening stock AND no arrivals
    const anyArriving = Array.from(row.arrivingByMonth.values()).some((v) => v > 0)
    if (row.totalDemand === 0 && row.ingredient.opening_stock_override == null && !anyArriving) continue

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
 * Per-month shortfall flags against opening stock + arrivals.
 *
 * A month is flagged only when THAT month has demand AND that demand
 * exceeds the running stock balance going into the month. The running
 * balance carries forward each month's net change: previous + arrivals − demand.
 * Months with zero demand are never flagged.
 */
export function monthShortfalls(
  row: IngredientRow,
  opening: number,
  months: string[],
): Map<string, boolean> {
  const out = new Map<string, boolean>()
  let balance = opening
  for (const m of months) {
    const demand   = row.demandByMonth.get(m)   ?? 0
    const arriving = row.arrivingByMonth.get(m) ?? 0
    const availableBefore = Math.max(0, balance) + arriving
    out.set(m, demand > 0 && demand > availableBefore)
    balance = balance + arriving - demand
  }
  return out
}

/**
 * Three-state shortfall classification per month.
 *   - 'red'   = demand > opening-carried balance + this month's arrival (still short).
 *   - 'amber' = demand fits with this month's arrival, but WOULD have been short
 *               without it (the PO landing this month is what saved it).
 *   - 'ok'    = demand fits within the opening-carried balance alone.
 *               No demand → also 'ok'.
 */
export type ShortfallState = 'ok' | 'amber' | 'red'

export function monthShortfallStates(
  row: IngredientRow,
  opening: number,
  months: string[],
): Map<string, ShortfallState> {
  const out = new Map<string, ShortfallState>()
  let balance = opening
  for (const m of months) {
    const demand   = row.demandByMonth.get(m)   ?? 0
    const arriving = row.arrivingByMonth.get(m) ?? 0
    const carriedAvailable = Math.max(0, balance)
    const fullAvailable    = carriedAvailable + arriving
    let state: ShortfallState = 'ok'
    if (demand > 0) {
      if (demand > fullAvailable) state = 'red'
      else if (demand > carriedAvailable) state = 'amber'
    }
    out.set(m, state)
    balance = balance + arriving - demand
  }
  return out
}

/**
 * Running stock balance after each month (opening + Σ arrivals − Σ demand
 * through that month). Powers the per-cell "% of demand still covered"
 * sub-label on the Ingredient demand row.
 */
export function monthRunningBalances(
  row: IngredientRow,
  opening: number,
  months: string[],
): Map<string, number> {
  const out = new Map<string, number>()
  let balance = opening
  for (const m of months) {
    const demand   = row.demandByMonth.get(m)   ?? 0
    const arriving = row.arrivingByMonth.get(m) ?? 0
    balance = balance + arriving - demand
    out.set(m, balance)
  }
  return out
}

export function hasAnyShortfall(
  row: IngredientRow,
  opening: number,
  months: string[],
): boolean {
  let balance = opening
  for (const m of months) {
    const demand   = row.demandByMonth.get(m)   ?? 0
    const arriving = row.arrivingByMonth.get(m) ?? 0
    const availableBefore = Math.max(0, balance) + arriving
    if (demand > 0 && demand > availableBefore) return true
    balance = balance + arriving - demand
  }
  return false
}
