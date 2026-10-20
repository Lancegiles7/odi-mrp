import { BvaUploadActuals } from '@/components/budget-vs-actual/bva-upload-actuals'
import { InwardsUpload } from '@/components/stock-movements/inwards-upload'

interface MonthOpt { key: string; label: string; closed: boolean }

/**
 * Uploads — one home for every data feed behind Stock Movements and Budget vs
 * Actual. Reuses the existing, tested upload surfaces (month actuals + inwards)
 * and shows each source with where it comes from. Shopify channels pull live;
 * Upstock retail, samples and write-offs are file uploads.
 */
export function UploadsHub({ months, defaultMonth }: { months: MonthOpt[]; defaultMonth: string }) {
  return (
    <div className="space-y-4">
      {/* Action cards — the live upload surfaces */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card
          title="Month actuals"
          tag="file" tagLabel="Shopify + Upstock"
          desc="D2C (Shopify export) · Retail (Upstock export) · Samples tracker · Write-offs tracker — files the month's final figures for the Summary grid and Budget vs Actual."
          action={<BvaUploadActuals months={months} defaultMonth={defaultMonth} />}
        />
        <Card
          title="Finished-goods inwards"
          tag="file" tagLabel="Inwards sheet"
          desc="Stock received into the warehouse (NZ + AUST tabs, market-tagged). Feeds the inbound column on the Summary grid."
          action={<InwardsUpload />}
        />
      </div>

      {/* Source map — what feeds what (live-pull sources arrive with the in-app Shopify button) */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Data sources</h2>
          <p className="text-xs text-gray-500 mt-0.5">Where each channel comes from. Budget vs Actual now reads these same numbers — no separate upload there.</p>
        </div>
        <div className="divide-y divide-gray-100">
          <Source name="NZ e-commerce" src="shopify" note="Pulled from Shopify (ship-to New Zealand)." />
          <Source name="AU e-commerce" src="shopify" note="Pulled from Shopify (ship-to Australia)." />
          <Source name="AU retail" src="shopify" note="From the Shopify AU wholesale/retail channel." />
          <Source name="NZ retail" src="file" note="Upstock orders export (no public API) — part of Month actuals." />
          <Source name="Samples — NZ & AU" src="file" note="NZ + AU sample trackers — part of Month actuals." />
          <Source name="Write-offs — NZ & AU" src="file" note="Stock write-off tracker — part of Month actuals." />
        </div>
        <div className="px-4 py-2 text-[11px] text-gray-400">
          Shopify sources are pulled for the live month-to-date (Stockout Watch) today; a self-serve “Pull from Shopify” button is coming.
        </div>
      </div>
    </div>
  )
}

function Card({ title, desc, action, tag, tagLabel }: { title: string; desc: string; action: React.ReactNode; tag: 'file' | 'shopify'; tagLabel: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className={`text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${tag === 'shopify' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{tagLabel}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1 flex-1">{desc}</p>
      <div className="mt-3">{action}</div>
    </div>
  )
}

function Source({ name, src, note }: { name: string; src: 'shopify' | 'file'; note: string }) {
  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <span className={`text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded flex-shrink-0 w-16 text-center ${src === 'shopify' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{src === 'shopify' ? 'Shopify' : 'File'}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-800">{name}</div>
        <div className="text-[11px] text-gray-500">{note}</div>
      </div>
    </div>
  )
}
