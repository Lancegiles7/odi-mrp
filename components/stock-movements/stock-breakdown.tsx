'use client'

import { Fragment, useState } from 'react'
import type { BreakdownData, BreakdownRow } from '@/lib/stock-breakdown-data'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'

const nf = (n: number) => (n ? Math.round(n).toLocaleString('en-NZ') : '—')
const salesTotal = (r: BreakdownRow) => r.nz_d2c + r.au_d2c + r.nz_retail + r.au_retail + r.nz_samples + r.au_samples + r.expo_nz + r.expo_au
const inTotal = (r: BreakdownRow) => r.in_nz + r.in_au
const inHead = 'border-l-2 border-sky-200 bg-sky-50/50'
const inCell = 'border-l-2 border-sky-100 bg-sky-50/20'

const COLS: { key: keyof BreakdownRow; label: string }[] = [
  { key: 'nz_d2c', label: 'NZ e‑com' },
  { key: 'au_d2c', label: 'AU e‑com' },
  { key: 'nz_retail', label: 'NZ retail' },
  { key: 'au_retail', label: 'AU retail' },
  { key: 'nz_samples', label: 'NZ samples' },
  { key: 'au_samples', label: 'AU samples' },
  { key: 'expo_nz', label: 'Expo NZ' },
  { key: 'expo_au', label: 'Expo AU' },
  { key: 'writeoff', label: 'Write‑offs' },
]

export function StockBreakdown({ data }: { data: BreakdownData }) {
  const [month, setMonth] = useState<string>(data.months[0]?.key ?? '')
  const rows = data.byMonth[month] ?? []

  if (!data.months.length) {
    return <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">No sales loaded yet.</div>
  }

  // Group by product group, ordered like the Summary grid.
  const order = PRODUCT_GROUPS.map((g) => g.value as string)
  const grouped = new Map<string, BreakdownRow[]>()
  for (const r of rows) {
    const key = r.group ?? '__other__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  const grand = rows.reduce((acc, r) => {
    for (const c of COLS) acc[c.key] = (acc[c.key] ?? 0) + (r[c.key] as number)
    acc.total = (acc.total ?? 0) + salesTotal(r)
    acc.in_nz = (acc.in_nz ?? 0) + r.in_nz
    acc.in_au = (acc.in_au ?? 0) + r.in_au
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900">Breakdown — per product × channel</h2>
          <div className="inline-flex gap-1 flex-wrap">
            {data.months.map((m) => (
              <button key={m.key} onClick={() => setMonth(m.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${month === m.key ? 'bg-emerald-50 border-emerald-600 text-emerald-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-gray-400">units</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Product</th>
              {COLS.map((c) => <th key={c.key} className="text-right px-3 py-2 font-medium">{c.label}</th>)}
              <th className="text-right px-3 py-2 font-medium">Total sold</th>
              <th className={`text-right px-3 py-2 font-medium text-sky-700 ${inHead}`}>In NZ</th>
              <th className={`text-right px-3 py-2 font-medium text-sky-700 bg-sky-50/50`}>In AU</th>
              <th className={`text-right px-3 py-2 font-medium text-sky-700 bg-sky-50/50`}>In total</th>
            </tr>
          </thead>
          <tbody>
            {groupKeys.map((key) => {
              const gRows = grouped.get(key)!
              const gLabel = key === '__other__' ? 'Other' : (PRODUCT_GROUP_LABELS[key] ?? key)
              const sub = COLS.reduce((a, c) => { a[c.key] = gRows.reduce((s, r) => s + (r[c.key] as number), 0); return a }, {} as Record<string, number>)
              const subTotal = gRows.reduce((s, r) => s + salesTotal(r), 0)
              return (
                <Fragment key={key}>
                  <tr className="bg-gray-100/80">
                    <td colSpan={COLS.length + 5} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-600 border-y border-gray-200">
                      {gLabel} <span className="ml-1 normal-case font-normal text-gray-400">{gRows.length}</span>
                    </td>
                  </tr>
                  {gRows.map((r) => (
                    <tr key={r.product_id} className="border-t border-gray-100">
                      <td className="px-4 py-2"><div className="font-medium">{r.name}</div><div className="text-[10px] text-gray-500 font-mono">{r.sku}</div></td>
                      {COLS.map((c) => <td key={c.key} className={`px-3 py-2 text-right tabular-nums ${c.key === 'writeoff' && (r[c.key] as number) ? 'text-red-700' : ''}`}>{nf(r[c.key] as number)}</td>)}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{nf(salesTotal(r))}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${inCell}`}>{nf(r.in_nz)}</td>
                      <td className="px-3 py-2 text-right tabular-nums bg-sky-50/20">{nf(r.in_au)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold bg-sky-50/20">{nf(inTotal(r))}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold text-gray-700">
                    <td className="px-4 py-1.5">{gLabel} — subtotal</td>
                    {COLS.map((c) => <td key={c.key} className="px-3 py-1.5 text-right tabular-nums">{nf(sub[c.key])}</td>)}
                    <td className="px-3 py-1.5 text-right tabular-nums">{nf(subTotal)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${inCell}`}>{nf(gRows.reduce((s, r) => s + r.in_nz, 0))}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums bg-sky-50/20">{nf(gRows.reduce((s, r) => s + r.in_au, 0))}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums bg-sky-50/20">{nf(gRows.reduce((s, r) => s + inTotal(r), 0))}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200">
              <td className="px-4 py-2">All products</td>
              {COLS.map((c) => <td key={c.key} className="px-3 py-2 text-right tabular-nums">{nf(grand[c.key])}</td>)}
              <td className="px-3 py-2 text-right tabular-nums">{nf(grand.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums border-l-2 border-sky-300 text-sky-800">{nf(grand.in_nz)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-sky-800">{nf(grand.in_au)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-sky-800">{nf((grand.in_nz ?? 0) + (grand.in_au ?? 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="px-4 py-2 text-[11px] text-gray-400">
        NZ e‑com, AU e‑com &amp; AU retail from Shopify · NZ retail from Upstock · Expo NZ/AU from Shopify POS events · <span className="text-sky-700">Inwards = finished‑goods receipts by market (net of transfers), matching the Summary "IN"</span> · the current month shows month‑to‑date. $ view coming once per‑channel pricing is wired.
      </div>
    </div>
  )
}
