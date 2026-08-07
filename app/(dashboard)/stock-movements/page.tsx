import type { Metadata } from 'next'
import { loadStockLedger } from '@/lib/stock-movements-data'
import { StockMovementsTable } from '@/components/stock-movements/stock-movements-table'
import { InwardsUpload } from '@/components/stock-movements/inwards-upload'

export const metadata: Metadata = { title: 'Stock Movements' }
// Always render fresh — receipts / write-offs / actuals change often and a
// cached page makes saved data look like it "reverted".
export const dynamic = 'force-dynamic'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

export default async function StockMovementsPage() {
  const { rows, actualMonths, forecastMonths, actualThrough } = await loadStockLedger()
  const lastActualLabel = actualThrough ? monthLabel(actualThrough) : null

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Stock Movements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Finished-goods running stocktake · Inbound − sold/samples − write-offs = predicted EOM
            {lastActualLabel && <> · actuals through <span className="font-semibold text-gray-800">{lastActualLabel}</span>, forecast thereafter</>}
          </p>
        </div>
        <InwardsUpload />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          No stock movements yet. Use <strong>Upload inwards</strong> to load the Inwards Finished Goods sheet, then arrivals,
          sales (from Budget vs Actual) and write-offs will roll into a running stocktake here.
        </div>
      ) : (
        <StockMovementsTable rows={rows} actualMonths={actualMonths} forecastMonths={forecastMonths} label={monthLabel} />
      )}
    </div>
  )
}
