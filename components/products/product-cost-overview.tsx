'use client'

import { useState } from 'react'

/**
 * Whole-BOM cost & margin, toggleable between NZD and AUD.
 *
 * Each line carries its own native currency; flipping the view re-expresses
 * every line in the chosen currency (converted lines highlighted) and reports
 * that market's total cost and margin. NZD uses NZ freight + NZ RRP; AUD uses
 * AU freight + AU RRP — so each view is the real cost/margin for that market,
 * not one figure ÷ FX.
 */
interface Props {
  fx: number
  ingredientTotal: number          // NZD (ingredients are loaded to NZD per item)
  packaging: number                // NZD
  toll: number;      tollCurrency: string
  margin: number;    marginCurrency: string
  other: number;     otherCurrency: string
  freightNz: number; freightNzCurrency: string
  freightAu: number; freightAuCurrency: string
  rrpExNz: number
  rrpExAu: number
}

const r2  = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) =>
  n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Line { label: string; value: number; currency: string; market?: 'NZD' | 'AUD' }

export function ProductCostOverview(props: Props) {
  const [view, setView] = useState<'NZD' | 'AUD'>('NZD')
  const fx  = props.fx > 0 ? props.fx : 1
  const sym = view === 'AUD' ? 'A$' : '$'

  // Convert a value from its native currency into the current view currency.
  const toView = (v: number, cur: string) =>
    cur === view ? v : view === 'NZD' ? v * fx : v / fx

  const lines: Line[] = [
    { label: 'Ingredients (loaded)', value: props.ingredientTotal, currency: 'NZD' },
    { label: 'Packaging',            value: props.packaging,        currency: 'NZD' },
    { label: 'Toll',                 value: props.toll,             currency: props.tollCurrency },
    { label: 'Margin',               value: props.margin,           currency: props.marginCurrency },
    { label: 'Task / other',         value: props.other,            currency: props.otherCurrency },
    { label: 'Freight — NZ',         value: props.freightNz,        currency: props.freightNzCurrency, market: 'NZD' },
    { label: 'Freight — AU',         value: props.freightAu,        currency: props.freightAuCurrency, market: 'AUD' },
  ]
  const shown  = lines.filter((l) => !l.market || l.market === view)
  const total  = r2(shown.reduce((s, l) => s + toView(l.value, l.currency), 0))
  const rrpEx  = view === 'NZD' ? props.rrpExNz : props.rrpExAu
  const gp     = rrpEx > 0 ? r2(rrpEx - total) : null
  const gpPct  = rrpEx > 0 ? Math.round((1 - total / rrpEx) * 100) : null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Cost &amp; margin · whole BOM</h3>
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm">
          {(['NZD', 'AUD'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setView(c)}
              className={view === c ? 'px-4 py-1.5 bg-gray-900 text-white' : 'px-4 py-1.5 bg-white text-gray-600 hover:bg-gray-50'}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400">
            <th className="text-left font-normal pb-1.5">Component</th>
            <th className="text-right font-normal pb-1.5">As entered</th>
            <th className="text-right font-normal pb-1.5">In {view}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l, i) => {
            const converted = l.currency !== view
            const lineSym = l.currency === 'AUD' ? 'A$' : '$'
            return (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1.5">{l.label}</td>
                <td className="py-1.5 text-right text-gray-500 tabular-nums">
                  {lineSym}{fmt(l.value)} <span className="text-[10px] text-gray-400">{l.currency}</span>
                </td>
                <td className={converted ? 'py-1.5 text-right font-medium tabular-nums text-blue-600' : 'py-1.5 text-right font-medium tabular-nums'}>
                  {sym}{fmt(toView(l.value, l.currency))}
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-gray-300">
            <td className="py-2 font-semibold">Total cost ({view})</td>
            <td></td>
            <td className="py-2 text-right font-semibold tabular-nums">{sym}{fmt(total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <Stat label="Total cost"   value={`${sym}${fmt(total)}`} />
        <Stat label="RRP ex-GST"   value={rrpEx > 0 ? `${sym}${fmt(rrpEx)}` : '—'} />
        <Stat label="Margin (GP)"  value={gp !== null ? `${sym}${fmt(gp)} · ${gpPct}%` : '—'} accent />
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        NZD view uses NZ freight &amp; NZ RRP; AUD view uses AU freight &amp; AU RRP.
        Blue figures are converted at FX {fx.toFixed(4)} (1 AUD = {fx.toFixed(2)} NZD).
      </p>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? 'rounded-md p-3 bg-emerald-50' : 'rounded-md p-3 bg-gray-50'}>
      <div className={accent ? 'text-xs text-emerald-700' : 'text-xs text-gray-500'}>{label}</div>
      <div className={accent ? 'text-lg font-semibold text-emerald-800' : 'text-lg font-semibold text-gray-900'}>{value}</div>
    </div>
  )
}
