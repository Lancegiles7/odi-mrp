import type { Metadata } from 'next'
import Link from 'next/link'
import { loadStockLedger, loadFgValueSummary } from '@/lib/stock-movements-data'
import { loadIngredientStockLedger } from '@/lib/ingredient-stock-movements'
import { loadPackagingStockLedger } from '@/lib/packaging-stock-movements'
import { StockMovementsTable } from '@/components/stock-movements/stock-movements-table'
import { IngredientStockTable } from '@/components/stock-movements/ingredient-stock-table'
import { InwardsUpload } from '@/components/stock-movements/inwards-upload'
import { MonthlyNotes } from '@/components/stock-movements/monthly-notes'
import { loadStockMovementNotes } from '@/app/(dashboard)/stock-movements/actions'
import { loadStockoutWatch } from '@/lib/stockout-watch-data'
import { StockoutWatch } from '@/components/stock-movements/stockout-watch'
import { loadStockBreakdown } from '@/lib/stock-breakdown-data'
import { StockBreakdown } from '@/components/stock-movements/stock-breakdown'
import { UploadsHub } from '@/components/stock-movements/uploads-hub'
import { fyStartFor, fyMonths, shortMonth } from '@/lib/budget-vs-actual'
import { createClient } from '@/lib/supabase/server'

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

type Hub = 'summary' | 'watch' | 'uploads' | 'breakdown'
const HUB_TABS: { key: Hub; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'watch', label: 'Stockout Watch' },
  { key: 'uploads', label: 'Uploads' },
  { key: 'breakdown', label: 'Breakdown' },
]

export default async function StockMovementsPage({ searchParams }: { searchParams: { view?: string; group?: string; hub?: string } }) {
  const hub: Hub = searchParams.hub === 'watch' ? 'watch'
    : searchParams.hub === 'uploads' ? 'uploads'
    : searchParams.hub === 'breakdown' ? 'breakdown' : 'summary'
  const view: View = searchParams.view === 'ingredients' ? 'ingredients'
    : searchParams.view === 'packaging' ? 'packaging' : 'products'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Stock Movements</h1>
          <p className="text-sm text-gray-500 mt-1">Running finished-goods, ingredient and packaging stocktake — per country and combined.</p>
        </div>
        {hub === 'summary' && view === 'products' && <InwardsUpload />}
      </div>

      {/* Hub tabs */}
      <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5 gap-0.5">
        {HUB_TABS.map((t) => (
          <Link key={t.key} href={t.key === 'summary' ? '/stock-movements' : `/stock-movements?hub=${t.key}`}
            className={`text-sm font-medium px-4 py-1.5 rounded-md ${hub === t.key ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {hub === 'watch' ? (
        <StockoutWatchView />
      ) : hub === 'uploads' ? (
        <UploadsView />
      ) : hub === 'breakdown' ? (
        <StockBreakdownView />
      ) : (
        <>
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
          {view === 'packaging' && <PackagingView group={searchParams.group === 'supplier' ? 'supplier' : 'flat'} />}
        </>
      )}
    </div>
  )
}

async function StockoutWatchView() {
  const data = await loadStockoutWatch()
  return <StockoutWatch data={data} />
}

async function StockBreakdownView() {
  const data = await loadStockBreakdown()
  return <StockBreakdown data={data} />
}

async function UploadsView() {
  const supabase = createClient()
  const monthKeys = fyMonths(fyStartFor(new Date()))
  const { data: locks } = await supabase
    .from('month_locks').select('year_month')
    .gte('year_month', monthKeys[0]).lte('year_month', monthKeys[monthKeys.length - 1]) as { data: Array<{ year_month: string }> | null }
  const locked = new Set((locks ?? []).map((l) => l.year_month))
  const months = monthKeys.map((m) => ({ key: m, label: shortMonth(m), closed: locked.has(m) }))
  const defaultMonth = months.find((m) => !m.closed)?.key ?? months[0]?.key ?? ''
  return <UploadsHub months={months} defaultMonth={defaultMonth} />
}

async function ProductsView({ label }: { label: (m: string) => string }) {
  const [ledger, notes] = await Promise.all([
    loadStockLedger(),
    loadStockMovementNotes('products'),
  ])
  const { rows, actualMonths, forecastMonths, actualThrough } = ledger
  const valueSummary = rows.length > 0 ? await loadFgValueSummary(ledger) : {}
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
        <StockMovementsTable rows={rows} actualMonths={actualMonths} forecastMonths={forecastMonths} label={label} valueSummary={valueSummary} />
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

async function PackagingView({ group }: { group: 'flat' | 'supplier' }) {
  const [ledger, notes] = await Promise.all([
    loadPackagingStockLedger(),
    loadStockMovementNotes('packaging'),
  ])
  return (
    <div className="space-y-3">
      <IngredientStockTable ledger={ledger} group={group} entityType="packaging" />
      {ledger.months.length > 0 && <MonthlyNotes scope="packaging" months={ledger.months} initial={notes} />}
    </div>
  )
}
