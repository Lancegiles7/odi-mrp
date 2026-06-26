'use client'

import { useRouter } from 'next/navigation'
import {
  variance, fmtMoney, fmtNum, fmtPct, SUMMARY_GROUPS,
  shortMonth, type FigureMap,
} from '@/lib/budget-vs-actual'

interface MonthOpt { key: string; label: string; closed: boolean; hasData: boolean }

interface Props {
  fyStart: string
  scope: string            // 'ytd' or a month key (YYYY-MM-01)
  months: MonthOpt[]
  figures: FigureMap       // aggregated for the active scope (budget already pro-rated if applicable)
  proRata: { factor: number; daysElapsed: number; daysInMonth: number } | null
  proRataOn: boolean
  isCurrentMonthScope: boolean
}

function f(map: FigureMap, key: string) {
  return map[key] ?? { budget: null, actual: null }
}

export function SummaryTab({ fyStart, scope, months, figures, proRata, proRataOn, isCurrentMonthScope }: Props) {
  const router = useRouter()
  function go(nextScope: string, prorata = proRataOn) {
    const p = new URLSearchParams({ fy: fyStart, tab: 'summary', scope: nextScope })
    if (prorata) p.set('prorata', '1')
    router.push(`/reporting/budget-vs-actual?${p.toString()}`)
  }

  const d2c    = f(figures, 'rev_d2c')
  const retail = f(figures, 'rev_retail')
  const revTotal = { budget: (d2c.budget ?? 0) + (retail.budget ?? 0), actual: (d2c.actual ?? 0) + (retail.actual ?? 0) }

  const oD2c    = f(figures, 'ord_d2c')
  const oRetail = f(figures, 'ord_retail')
  const oWw     = f(figures, 'ord_retail_ww')
  const oOther  = f(figures, 'ord_retail_other')
  const oAll    = { budget: (oD2c.budget ?? 0) + (oRetail.budget ?? 0), actual: (oD2c.actual ?? 0) + (oRetail.actual ?? 0) }

  return (
    <div className="space-y-5">
      {/* Scope selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Scope:</span>
        <button
          onClick={() => go('ytd')}
          className={`px-3 py-1.5 text-sm rounded-md ${scope === 'ytd' ? 'bg-emerald-700 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
        >Year to date</button>
        {months.filter((m) => m.hasData || m.closed).map((m) => (
          <button
            key={m.key}
            onClick={() => go(m.key)}
            className={`px-3 py-1.5 text-sm rounded-md ${scope === m.key ? 'bg-emerald-700 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >{m.label}{m.closed ? ' 🔒' : ''}</button>
        ))}
        {isCurrentMonthScope && proRata && (
          <label className="flex items-center gap-2 text-xs text-gray-700 ml-2">
            <input type="checkbox" checked={proRataOn} onChange={(e) => go(scope, e.target.checked)} />
            Pro-rata budget to date ({proRata.daysElapsed}/{proRata.daysInMonth} days ≈ {Math.round(proRata.factor * 100)}%)
          </label>
        )}
      </div>

      {/* Revenue */}
      <Panel title="Revenue" subtitle="D2C at gross customer sales · Retail at wholesale (what Odi invoices)">
        <Row label="D2C (Shopify)"  pair={d2c}    money />
        <Row label="Retail (Upstock)" pair={retail} money />
        <Row label="Total revenue"  pair={revTotal} money strong />
      </Panel>

      {/* Orders */}
      <Panel title="Orders" subtitle="Ecomm vs budget; retail split Woolworths vs the rest (actual)">
        <Row label="Ecomm (D2C)" pair={oD2c} />
        <Row label="Retail — total" pair={oRetail} />
        <Row label="↳ Woolworths" pair={oWw} muted indent />
        <Row label="↳ Other retailers" pair={oOther} muted indent />
        <Row label="All orders" pair={oAll} strong />
      </Panel>

      {/* Units by group (indicative) */}
      <Panel
        title="Units by group"
        subtitle="Indicative — budget from the FY27 Units tab; actual grouped from Shopify + Upstock (retail pouches ×6). Cross-channel SKU mapping not yet applied."
      >
        {SUMMARY_GROUPS.map((g) => <Row key={g.key} label={g.label} pair={f(figures, g.key)} />)}
      </Panel>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-4 py-2 font-medium">Line</th>
            <th className="text-right px-3 py-2 font-medium">Budget</th>
            <th className="text-right px-3 py-2 font-medium">Actual</th>
            <th className="text-right px-3 py-2 font-medium">Variance</th>
            <th className="text-right px-3 py-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">{children}</tbody>
      </table>
    </div>
  )
}

function Row({
  label, pair, money = false, strong = false, muted = false, indent = false,
}: {
  label: string
  pair: { budget: number | null; actual: number | null }
  money?: boolean; strong?: boolean; muted?: boolean; indent?: boolean
}) {
  const v = variance(pair.actual, pair.budget)
  const fmt = money ? fmtMoney : fmtNum
  const hasBudget = pair.budget != null
  const positive = v.abs >= 0
  const varColor = !hasBudget ? 'text-gray-300' : v.abs === 0 ? 'text-gray-500' : positive ? 'text-emerald-700' : 'text-rose-700'
  return (
    <tr className={`border-t border-gray-100 ${strong ? 'font-semibold bg-gray-50/60' : ''} ${muted ? 'text-gray-600' : ''}`}>
      <td className={`px-4 py-2 ${indent ? 'pl-8' : ''}`}>{label}</td>
      <td className="px-3 py-2 text-right">{hasBudget ? fmt(pair.budget) : '—'}</td>
      <td className="px-3 py-2 text-right">{fmt(pair.actual)}</td>
      <td className={`px-3 py-2 text-right ${varColor}`}>{hasBudget ? `${v.abs >= 0 ? '+' : ''}${money ? fmtMoney(v.abs) : fmtNum(v.abs)}` : '—'}</td>
      <td className={`px-3 py-2 text-right ${varColor}`}>{hasBudget ? fmtPct(v.pct) : '—'}</td>
    </tr>
  )
}

// silence unused import in some builds
void shortMonth
