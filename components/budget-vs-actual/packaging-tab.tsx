'use client'

import { CountedEomInput } from './counted-eom-input'
import { OpeningCellInput } from './actual-cell-input'
import { packagingTypeLabel, PACKAGING_TYPE_COLOURS } from '@/lib/constants'

export interface PackagingTabRow {
  id: string
  sku: string
  name: string
  type: string
  uom: string | null
  opening: number | null
  derived: number
  override: number | null
  override_comment: string | null
  effective: number
  calc_eom: number | null
  counted_eom: number | null
  stock_variance: number | null
  /** 'retail-only' for SRT (wholesale shipper); 'total' for everything else. */
  derivation_basis?: 'retail-only' | 'total'
}

export function PackagingTab({
  rows, year_month, isLocked,
}: {
  rows: PackagingTabRow[]; year_month: string; isLocked: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 1200 }}>
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 min-w-[260px]">Packaging</th>
              <th className="text-left px-2 py-2 w-[90px]">Type</th>
              <th className="text-right px-2 py-2 w-[90px]">Open</th>
              <th className="text-right px-2 py-2 w-[100px] bg-emerald-50/40" title="Σ across products of (product total_out × packaging qty per unit)">Derived use</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40">Override</th>
              <th className="text-right px-2 py-2 w-[100px] bg-emerald-50">Effective use</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40">Calc EOM</th>
              <th className="text-right px-2 py-2 w-[120px]">Counted EOM</th>
              <th className="text-right px-2 py-2 w-[100px]">Stock var</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No packaging items yet.</td></tr>
            )}
            {rows.map((r) => {
              const noActivity = r.derived === 0 && r.counted_eom == null
              const negativeEom = r.calc_eom != null && r.calc_eom < 0
              return (
                <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${negativeEom ? 'bg-rose-50/30' : r.override != null ? 'bg-amber-50/20' : ''}`}>
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-[10px] font-mono text-gray-500">{r.sku}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${PACKAGING_TYPE_COLOURS[r.type] ?? PACKAGING_TYPE_COLOURS['OTHER']}`}>{packagingTypeLabel(r.type)}</span>
                  </td>
                  <td className="px-1 py-1">
                    <OpeningCellInput entity_type="packaging" entity_id={r.id} year_month={year_month} initial={r.opening} isLocked={isLocked} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40" title={r.derivation_basis === 'retail-only' ? 'SRT — derived from retail actuals only (samples + D2C excluded)' : 'Derived from total product actuals × qty per unit'}>
                    {noActivity && r.derived === 0 ? <span className="text-gray-300">—</span> : (
                      <>
                        {formatNum(r.derived)}
                        {r.derivation_basis === 'retail-only' && <span className="block text-[9px] normal-case text-gray-500 font-normal">retail only</span>}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40">
                    {r.override != null ? <span className="font-semibold text-amber-900" title={r.override_comment ?? undefined}>{formatNum(r.override)}{r.override_comment ? ' 💬' : ''}</span> : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-medium">{noActivity ? <span className="text-gray-300">—</span> : formatNum(r.effective)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums bg-amber-50/40 font-medium ${negativeEom ? 'text-rose-700' : ''}`}>
                    {r.calc_eom != null ? formatNum(r.calc_eom) : <span className="text-gray-300">—</span>}
                    {negativeEom && <span className="block text-[9px] normal-case text-rose-700 font-normal">stockout!</span>}
                  </td>
                  <td className="px-2 py-2">
                    <CountedEomInput entity_type="packaging" entity_id={r.id} year_month={year_month} initial={r.counted_eom} isLocked={isLocked} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.stock_variance != null
                      ? <span className={`inline-block px-1.5 py-0.5 rounded ${Math.abs(r.stock_variance) === 0 ? 'text-gray-400' : r.stock_variance > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>{r.stock_variance > 0 ? '+' : ''}{formatNum(r.stock_variance)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
        Derived use = product actuals × packaging qty-per-unit on each product&rsquo;s Packaging BOM. <strong>SRT</strong> packaging types use <em>retail-only</em> actuals (D2C and samples excluded — SRTs only ship to wholesale). Open falls back to packaging.current_soh when no monthly count is set. Negative Calc EOM = stockout.
      </div>
    </div>
  )
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
