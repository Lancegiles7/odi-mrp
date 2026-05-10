'use client'

import { CountedEomInput } from './counted-eom-input'

export interface IngredientRow {
  id: string
  sku: string
  name: string
  uom: string | null
  opening: number | null
  derived: number
  override: number | null
  override_comment: string | null
  effective: number
  calc_eom: number | null
  counted_eom: number | null
  stock_variance: number | null
}

export function IngredientsTab({
  rows, year_month, isLocked,
}: {
  rows: IngredientRow[]; year_month: string; isLocked: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 1200 }}>
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 min-w-[260px]">Ingredient</th>
              <th className="text-right px-2 py-2 w-[60px]">UoM</th>
              <th className="text-right px-2 py-2 w-[90px]">Open</th>
              <th className="text-right px-2 py-2 w-[100px] bg-emerald-50/40" title="Σ across products of (product total_out × BOM kg)">Derived use</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40">Override</th>
              <th className="text-right px-2 py-2 w-[100px] bg-emerald-50">Effective use</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40">Calc EOM</th>
              <th className="text-right px-2 py-2 w-[120px]">Counted EOM</th>
              <th className="text-right px-2 py-2 w-[100px]">Stock var</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No ingredients yet.</td></tr>
            )}
            {rows.map((r) => {
              const noActivity = r.derived === 0 && r.counted_eom == null
              return (
                <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${r.override != null ? 'bg-amber-50/20' : ''}`}>
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-[10px] font-mono text-gray-500">{r.sku}</div>
                  </td>
                  <td className="px-2 py-2 text-right text-gray-500">{r.uom ?? '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.opening != null ? formatNum(r.opening) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40">{noActivity && r.derived === 0 ? <span className="text-gray-300">—</span> : formatNum(r.derived)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40">
                    {r.override != null ? <span className="font-semibold text-amber-900" title={r.override_comment ?? undefined}>{formatNum(r.override)}{r.override_comment ? ' 💬' : ''}</span> : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-medium">{noActivity ? <span className="text-gray-300">—</span> : formatNum(r.effective)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-medium">{r.calc_eom != null ? formatNum(r.calc_eom) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-2">
                    <CountedEomInput entity_type="ingredient" entity_id={r.id} year_month={year_month} initial={r.counted_eom} isLocked={isLocked} />
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
        Derived use comes from product actuals × each ingredient&rsquo;s grams in the product BOM. Override columns are read-only here for now (Phase 2: inline override + comment).
      </div>
    </div>
  )
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
