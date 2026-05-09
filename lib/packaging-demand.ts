/**
 * Packaging demand helpers — pure functions.
 *
 * For each packaging item, sum across products that consume it:
 *   demand[m] = Σ over products of (production_units[product, m] × quantity_per_unit)
 *
 * Plus arrivals from open POs by expected_delivery_date month, like
 * lib/ingredient-demand does. Plus shortfall flagging.
 */

export type Region = 'nz' | 'au' | 'total'

export interface PackagingRow {
  packaging: {
    id: string
    sku_code: string
    name: string
    type: string
    unit_of_measure: string
    supplier_id: string | null
    opening_stock_override: number | null
  }
  demandByMonth: Map<string, number>
  totalDemand: number
  arrivingByMonth: Map<string, number>
  arrivingPosByMonth: Map<string, Array<{ po_id: string; po_number: string; qty: number }>>
  products: Array<{
    id: string
    sku_code: string
    name: string
    quantityPerUnit: number
    demandByMonth: Map<string, number>
    totalDemand: number
  }>
}

export interface SupplierGroup {
  supplier: { id: string | null; name: string }
  packaging: PackagingRow[]
}

export interface AggregateInput {
  packaging: Array<{
    id: string
    sku_code: string
    name: string
    type: string
    unit_of_measure: string
    supplier_id: string | null
    opening_stock_override: number | null
  }>
  suppliers: Array<{ id: string; name: string }>
  productPackaging: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number }>
  products: Array<{ id: string; sku_code: string; name: string }>
  unitsByMonthByProduct: Map<string, Map<string, number>>
  months: string[]
  arrivalsByPackaging?: Map<string, Array<{ po_id: string; po_number: string; month: string; qty: number }>>
}

export function aggregatePackagingDemand(input: AggregateInput): SupplierGroup[] {
  const {
    packaging, suppliers, productPackaging, products,
    unitsByMonthByProduct, months, arrivalsByPackaging,
  } = input

  const productById = new Map(products.map((p) => [p.id, p]))
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))

  const rows = new Map<string, PackagingRow>()
  for (const pk of packaging) {
    rows.set(pk.id, {
      packaging: pk,
      demandByMonth: new Map(months.map((m) => [m, 0])),
      totalDemand: 0,
      arrivingByMonth: new Map(months.map((m) => [m, 0])),
      arrivingPosByMonth: new Map(months.map((m) => [m, []])),
      products: [],
    })
  }

  // Track which packaging items have ANY product link so we can keep them
  // visible on the demand page even when there's no production yet.
  const linkedPackaging = new Set<string>()

  // Walk each product → packaging link
  for (const pp of productPackaging) {
    const row = rows.get(pp.packaging_id)
    if (!row) continue
    const prod = productById.get(pp.product_id)
    if (!prod) continue
    linkedPackaging.add(pp.packaging_id)

    const perProduct = {
      id: prod.id,
      sku_code: prod.sku_code,
      name: prod.name,
      quantityPerUnit: Number(pp.quantity_per_unit) || 0,
      demandByMonth: new Map<string, number>(months.map((m) => [m, 0])),
      totalDemand: 0,
    }

    for (const m of months) {
      const units = unitsByMonthByProduct.get(m)?.get(prod.id) ?? 0
      if (!units) continue
      const qty = units * perProduct.quantityPerUnit
      perProduct.demandByMonth.set(m, qty)
      perProduct.totalDemand += qty
      row.demandByMonth.set(m, (row.demandByMonth.get(m) ?? 0) + qty)
      row.totalDemand += qty
    }
    // Always include linked products on the row, even at 0 demand, so the
    // user can see the BOM connection from the demand page.
    row.products.push(perProduct)
  }

  // Fold arrivals
  if (arrivalsByPackaging) {
    for (const [pkId, entries] of arrivalsByPackaging.entries()) {
      const row = rows.get(pkId)
      if (!row) continue
      for (const e of entries) {
        if (!row.arrivingByMonth.has(e.month)) continue
        row.arrivingByMonth.set(e.month, (row.arrivingByMonth.get(e.month) ?? 0) + e.qty)
        row.arrivingPosByMonth.get(e.month)!.push({ po_id: e.po_id, po_number: e.po_number, qty: e.qty })
      }
    }
  }

  // Group by supplier — include any packaging that has demand, opening stock,
  // arrivals, OR a product BOM link (so the user can see the link even when
  // there's no production schedule yet).
  const groups = new Map<string | null, SupplierGroup>()
  for (const pk of packaging) {
    const row = rows.get(pk.id)!
    const anyArriving = Array.from(row.arrivingByMonth.values()).some((v) => v > 0)
    const hasLink = linkedPackaging.has(pk.id)
    if (row.totalDemand === 0 && row.packaging.opening_stock_override == null && !anyArriving && !hasLink) continue

    const sKey = pk.supplier_id
    if (!groups.has(sKey)) {
      const sup = sKey ? supplierById.get(sKey) : null
      groups.set(sKey, {
        supplier: { id: sKey, name: sup?.name ?? 'Supplier not set' },
        packaging: [],
      })
    }
    groups.get(sKey)!.packaging.push(row)
  }

  const out = Array.from(groups.values())
  for (const g of out) g.packaging.sort((a, b) => a.packaging.name.localeCompare(b.packaging.name))
  out.sort((a, b) => {
    if (a.supplier.id === null) return 1
    if (b.supplier.id === null) return -1
    return a.supplier.name.localeCompare(b.supplier.name)
  })
  return out
}

// ============================================================
// Shortfall flagging — same logic as lib/ingredient-demand
// ============================================================
export function monthShortfalls(row: PackagingRow, opening: number, months: string[]): Map<string, boolean> {
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

export function hasAnyShortfall(row: PackagingRow, opening: number, months: string[]): boolean {
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
