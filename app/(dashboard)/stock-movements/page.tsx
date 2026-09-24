import type { Metadata } from 'next'
import Link from 'next/link'
import { loadStockLedger } from '@/lib/stock-movements-data'
import { loadIngredientStockLedger } from '@/lib/ingredient-stock-movements'
import { StockMovementsTable } from '@/components/stock-movements/stock-movements-table'
import { IngredientStockTable } from '@/components/stock-movements/ingredient-stock-table'
import { InwardsUpload } from '@/components/stock-movements/inwards-upload'
import { MonthlyNotes } from '@/components/stock-movements/monthly-notes'
import { loadStockMovementNotes } from '@/app/(dashboard)/stock-movements/actions'

export const metadata: Metadata = { title: 'Stock Movements' }
// Always render fresh — receipts / write-offs / actuals / manual counts change
// often and a cached page makes saved data look like it "reverted".
export const dynamic = 'force-dynamic'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

type View = 'products' | 'ingredients' | 'packaging'

const TABS: { key: View; label: string }[] = [
  { key: 'products', label: 'Finished goods' },
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'packaging', label: 'Packaging' },
]

export default async function StockMovementsPage({ searchParams }: { searchParams: { view?: string; group?: string } }) {
  const view: View = searchParams.view === 'ingredients' ? 'ingredients'
    : searchParams.view === 'packaging' ? 'packaging' : 'products'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Stock Movements</h1>
          <p className="text-sm text-gray-500 mt-1">Running finished-goods, ingredient and packaging stocktake — per country and combined.</p>
        </div>
        {view === 'products' && <InwardsUpload />}
      </div>

      {/* Section tabs */}
      <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5 gap-0.5">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === 'products' ? '/stock-movements' : `/stock-movements?view=${t.key}`}
            className={`text-sm font-medium px-4 py-1.5 rounded-md ${view === t.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {view === 'products' && <ProductsView label={monthLabel} />}
      {view === 'ingredients' && <IngredientsView group={searchParams.group === 'supplier' ? 'supplier' : 'flat'} />}
      {view === 'packaging' && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          Packaging Stock Movements is next — it will mirror the Ingredients view exactly.
        </div>
      )}
    </div>
  )
}

async function ProductsView({ label }: { label: (m: string) => string }) {
  const [{ rows, actualMonths, forecastMonths, actualThrough }, notes] = await Promise.all([
    loadStockLedger(),
    loadStockMovementNotes('products'),
  ])
  const lastActualLabel = actualThrough ? label(actualThrough) : null
  const months = [...actualMonths, ...forecastMonths]
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Inbound − sold/samples − write-offs = predicted EOM
        {lastActualLabel && <> · actuals through <span className="font-semibold text-gray-800">{lastActualLabel}</span>, forecast thereafter</>}
      </p>
      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No stock movements yet. Use <strong>Upload inwards</strong> to load the Inwards Finished Goods sheet.
        </div>
      ) : (
        <StockMovementsTable rows={rows} actualMonths={actualMonths} forecastMonths={forecastMonths} label={label} />
      )}
      {months.length > 0 && <MonthlyNotes scope="products" months={months} initial={notes} />}
    </div>
  )
}

async function IngredientsView({ group }: { group: 'flat' | 'supplier' }) {
  const [ledger, notes] = await Promise.all([
    loadIngredientStockLedger(),
    loadStockMovementNotes('ingredients'),
  ])
  return (
    <div className="space-y-3">
      <IngredientStockTable ledger={ledger} group={group} />
      {ledger.months.length > 0 && <MonthlyNotes scope="ingredients" months={ledger.months} initial={notes} />}
    </div>
  )
}
