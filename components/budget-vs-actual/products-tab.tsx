'use client'

import { CountedEomInput } from './counted-eom-input'
import { varBadgeClass, type ProductRow } from '@/lib/budget-vs-actual'

export function ProductsTab({
  rows, year_month, isLocked,
}: {
  rows: ProductRow[]; year_month: string; isLocked: boolean
}) {
  // Headline totals
  const totals = rows.reduce(
    (acc, r) => ({
      opening:     acc.opening   + (r.opening ?? 0),
      budget:      acc.budget    + r.budget,
      retail:      acc.retail    + r.channels.nz_retail,
      d2c:         acc.d2c       + r.channels.nz_d2c,
      samples:     acc.samples   + r.channels.nz_samples,
      total_out:   acc.total_out + r.total_out,
      total_sales: acc.total_sales + r.total_sales,
      calc_eom:    acc.calc_eom  + (r.calc_eom ?? 0),
      counted_eom: acc.counted_eom + (r.counted_eom ?? 0),
    }),
    { opening: 0, budget: 0, retail: 0, d2c: 0, samples: 0, total_out: 0, total_sales: 0, calc_eom: 0, counted_eom: 0 },
  )

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 1700 }}>
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 min-w-[260px]">Product</th>
              <th className="text-right px-2 py-2 w-[80px]" title="Opening SOH for the month">Open</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40" title="Budget snapshot for this month">Budget</th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50/40">NZ Retail</th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50/40">NZ D2C</th>
              <th className="text-right px-2 py-2 w-[80px] bg-purple-50/60">NZ Samples</th>
              <th className="text-right px-2 py-2 w-[80px] bg-gray-100 text-gray-400">AU Retail<span className="block text-[9px] normal-case">soon</span></th>
              <th className="text-right px-2 py-2 w-[80px] bg-gray-100 text-gray-400">AU D2C<span className="block text-[9px] normal-case">soon</span></th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50">Total out</th>
              <th className="text-right px-2 py-2 w-[110px]" title="(Retail + D2C) − Budget">Var sales</th>
              <th className="text-right px-2 py-2 w-[110px]" title="Total out − Budget (incl. samples)">Var total</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40" title="Opening − Total out">Calc EOM</th>
              <th className="text-right px-2 py-2 w-[100px]" title="Counted closing stock (manual)">Counted EOM</th>
              <th className="text-right px-2 py-2 w-[100px]">Stock var</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-500">
                  No products yet. Add products under <em>Planning → Products / BOMs</em>.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const noActuals = r.total_out === 0 && r.budget === 0
              return (
                <tr key={r.product_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-[10px] font-mono text-gray-500">{r.sku}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.opening != null ? r.opening.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{r.budget > 0 ? r.budget.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40">{cellOrDash(r.channels.nz_retail)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40">{cellOrDash(r.channels.nz_d2c)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-purple-50/60">{cellOrDash(r.channels.nz_samples)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-gray-50 text-gray-300">—</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-gray-50 text-gray-300">—</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-medium">
                    {r.total_out > 0 ? r.total_out.toLocaleString() : <span className="text-gray-300 italic">not entered</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {noActuals ? <span className="text-gray-300">—</span> : <VarBadge actual={r.total_sales} budget={r.budget} />}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {noActuals ? <span className="text-gray-300">—</span> : <VarBadge actual={r.total_out} budget={r.budget} />}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-medium">
                    {r.calc_eom != null ? r.calc_eom.toLocaleString() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-2">
                    <CountedEomInput entity_type="product" entity_id={r.product_id} year_month={year_month} initial={r.counted_eom} isLocked={isLocked} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.stock_variance != null
                      ? <span className={`inline-block px-1.5 py-0.5 rounded ${Math.abs(r.stock_variance) === 0 ? 'text-gray-400' : r.stock_variance > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>{r.stock_variance > 0 ? '+' : ''}{r.stock_variance.toLocaleString()}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 text-sm">
                <td className="px-3 py-2 sticky left-0 bg-gray-50 font-semibold">Totals</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">{totals.opening.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{totals.budget.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 font-semibold">{totals.retail.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 font-semibold">{totals.d2c.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums bg-purple-50/60 font-semibold">{totals.samples.toLocaleString()}</td>
                <td colSpan={2} className="px-2 py-2 text-right tabular-nums bg-gray-100 text-gray-300">—</td>
                <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-semibold">{totals.total_out.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">{totals.budget > 0 ? <VarBadge actual={totals.total_sales} budget={totals.budget} /> : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">{totals.budget > 0 ? <VarBadge actual={totals.total_out} budget={totals.budget} /> : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-semibold">{totals.calc_eom.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">{totals.counted_eom.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="p-3 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
        <strong>Legend:</strong>
        <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50/40">Budget</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-50/40">Sales channels</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-purple-50/60">Samples</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50/40">Calculated</span>
        <span className="ml-3 text-gray-400">Variance bands: 0–10% none · 10–25% amber · &gt;25% red</span>
      </div>
    </div>
  )
}

function cellOrDash(n: number): React.ReactNode {
  return n > 0 ? n.toLocaleString() : <span className="text-gray-300 italic">—</span>
}

function VarBadge({ actual, budget }: { actual: number; budget: number }) {
  const diff = actual - budget
  const pct  = budget !== 0 ? (diff / budget) * 100 : null
  const sign = diff >= 0 ? '+' : ''
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${varBadgeClass(actual, budget)}`}>
      {sign}{diff.toLocaleString()}{pct != null ? ` (${sign}${pct.toFixed(0)}%)` : ''}
    </span>
  )
}
