'use client'

import { Fragment, useMemo, useState } from 'react'
import type { StockoutData, StockoutRow } from '@/lib/stockout-watch-data'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
function fmtD(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MON3[d.getMonth()]}`
}
const WEEKS = 8

const daily = (r: StockoutRow) => (r.soldMtd > 0 ? r.soldMtd / r.daysElapsed : 0)

function sellout(r: StockoutRow, asOf: string): { txt: string; days: number } {
  const dr = daily(r)
  if (dr <= 0) return { txt: '—', days: 9999 }
  let stock = r.onHand
  const start = new Date(asOf + 'T00:00:00')
  for (let d = 0; d < 160; d++) {
    const iso = new Date(start.getTime() + d * 86_400_000).toISOString().slice(0, 10)
    for (const i of r.incoming) if (i.date === iso) stock += i.units
    stock -= dr
    if (stock < 0) return { txt: fmtD(iso), days: d }
  }
  return { txt: '>160d', days: 160 }
}
const toneOf = (days: number) => (days <= 10 ? 'red' : days <= 30 ? 'amber' : 'green')
const PILL: Record<string, string> = {
  red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800', green: 'bg-emerald-100 text-emerald-800',
}
const CELL: Record<string, string> = {
  red: 'bg-red-100 text-red-800 font-semibold', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-800',
}

export function StockoutWatch({ data }: { data: StockoutData }) {
  const [view, setView] = useState<'ov' | 'wk'>('ov')
  const asOf = data.asOf ?? new Date().toISOString().slice(0, 10)

  const weekStarts = useMemo(() => {
    const s = new Date(asOf + 'T00:00:00')
    return Array.from({ length: WEEKS }, (_, w) => new Date(s.getTime() + w * 7 * 86_400_000))
  }, [asOf])

  if (!data.hasInterim) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
        No month-to-date sales loaded yet. Pull Shopify e-com and upload the Upstock retail export to see sellout risk.
      </div>
    )
  }

  const atRisk = data.rows.filter((r) => toneOf(sellout(r, asOf).days) === 'red').length
  const totalSold = data.rows.reduce((s, r) => s + r.soldMtd, 0)

  return (
    <div className="space-y-4">
      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat k="SKUs at risk (≤10 days)" v={String(atRisk)} tone={atRisk ? 'text-red-700' : 'text-emerald-700'} />
        <Stat k="NZ units sold · month to date" v={nf(totalSold)} />
        <Stat k="As of" v={data.asOf ? fmtD(data.asOf) : '—'} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Stockout Watch — NZ{data.periodStart ? ` · ${fmtD(data.periodStart).split(' ')[1]}` : ''}</h2>
            <div className="inline-flex border border-gray-300 rounded-md overflow-hidden text-xs">
              <button onClick={() => setView('ov')} className={`px-3 py-1 font-medium ${view === 'ov' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Overview</button>
              <button onClick={() => setView('wk')} className={`px-3 py-1 font-medium border-l border-gray-300 ${view === 'wk' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Weekly cover</button>
            </div>
          </div>
          <span className="text-xs text-gray-400">run-rate = MTD ÷ {data.rows[0]?.daysElapsed ?? '—'} days</span>
        </div>

        {view === 'ov' ? <Overview rows={data.rows} asOf={asOf} /> : <Weekly rows={data.rows} weekStarts={weekStarts} />}
      </div>
    </div>
  )
}

function Stat({ k, v, tone = 'text-gray-900' }: { k: string; v: string; tone?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{k}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone}`}>{v}</div>
    </div>
  )
}

function Overview({ rows, asOf }: { rows: StockoutRow[]; asOf: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-4 py-2 font-medium">Product</th>
            <th className="text-right px-3 py-2 font-medium">On hand</th>
            <th className="text-right px-3 py-2 font-medium">Sold MTD</th>
            <th className="text-right px-3 py-2 font-medium">Sold/day</th>
            <th className="text-left px-3 py-2 font-medium">Weeks cover</th>
            <th className="text-left px-3 py-2 font-medium">Runs out</th>
            <th className="text-left px-3 py-2 font-medium">Next stock in</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const so = sellout(r, asOf), t = toneOf(so.days), dr = daily(r)
            const wks = dr > 0 ? r.onHand / (dr * 7) : 999
            return (
              <tr key={r.product_id} className={`border-t border-gray-100 ${t === 'red' ? 'bg-red-50/40' : ''}`}>
                <td className="px-4 py-2"><div className="font-medium">{r.name}</div><div className="text-[10px] text-gray-500 font-mono">{r.sku}</div></td>
                <td className="px-3 py-2 text-right tabular-nums">{nf(r.onHand)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{nf(r.soldMtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{dr.toFixed(0)}</td>
                <td className="px-3 py-2">{wks < 0.2 ? 'now' : `~${wks.toFixed(1)} wks`}</td>
                <td className="px-3 py-2">{so.txt}</td>
                <td className="px-3 py-2 text-[11px]">
                  {r.incoming.length
                    ? r.incoming.map((i, k) => <div key={k}>+{nf(i.units)} · {i.date ? fmtD(i.date) : '—'} ({i.po})</div>)
                    : <span className="text-gray-300">— nothing on order</span>}
                </td>
                <td className="px-3 py-2"><span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${PILL[t]}`}>{t === 'red' ? 'AT RISK' : t === 'amber' ? 'WATCH' : 'OK'}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Projected end-of-week units on hand for each week (can go negative).
function weeklyStock(r: StockoutRow, weekStarts: Date[]): number[] {
  const wd = daily(r) * 7
  let stock = r.onHand
  return weekStarts.map((s0) => {
    const s1 = new Date(s0.getTime() + 7 * 86_400_000)
    for (const inc of r.incoming) {
      if (!inc.date) continue
      const id = new Date(inc.date + 'T00:00:00')
      if (id >= s0 && id < s1) stock += inc.units
    }
    stock -= wd
    return stock
  })
}

function Weekly({ rows, weekStarts }: { rows: StockoutRow[]; weekStarts: Date[] }) {
  // Group by product group, ordered like the Summary grid.
  const order = PRODUCT_GROUPS.map((g) => g.value as string)
  const grouped = new Map<string, StockoutRow[]>()
  for (const r of rows) {
    const key = r.group ?? '__other__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  const colCount = 4 + weekStarts.length

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left px-4 py-2 font-medium">Product</th>
            <th className="text-right px-3 py-2 font-medium">On hand</th>
            <th className="text-right px-3 py-2 font-medium">Sold MTD</th>
            <th className="text-right px-3 py-2 font-medium">Wks cover</th>
            {weekStarts.map((d, i) => (
              <th key={i} className="text-right px-2 py-2 font-medium border-l border-gray-100">{fmtD(d.toISOString().slice(0, 10))}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupKeys.map((key) => {
            const gRows = grouped.get(key)!
            const gLabel = key === '__other__' ? 'Other' : (PRODUCT_GROUP_LABELS[key] ?? key)
            const subOn = gRows.reduce((s, r) => s + r.onHand, 0)
            const subSold = gRows.reduce((s, r) => s + r.soldMtd, 0)
            const subWeeks = weekStarts.map((_, i) => gRows.reduce((s, r) => s + Math.max(0, weeklyStock(r, weekStarts)[i]), 0))
            return (
              <Fragment key={key}>
                <tr className="bg-gray-100/80">
                  <td colSpan={colCount} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-600 border-y border-gray-200">
                    {gLabel} <span className="ml-1 normal-case font-normal text-gray-400">{gRows.length}</span>
                  </td>
                </tr>
                {gRows.map((r) => {
                  const wd = daily(r) * 7
                  const wkStock = weeklyStock(r, weekStarts)
                  const wks = wd > 0 ? r.onHand / wd : 999
                  return (
                    <tr key={r.product_id} className="border-t border-gray-100">
                      <td className="px-4 py-2"><div className="font-medium">{r.name}</div><div className="text-[10px] text-gray-500 font-mono">{r.sku}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.onHand)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.soldMtd)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{wks < 0.2 ? 'now' : wks.toFixed(1)}</td>
                      {wkStock.map((stock, i) => {
                        const cls = stock < 0 ? CELL.red : stock < wd ? CELL.amber : CELL.green
                        return <td key={i} className={`px-2 py-2 text-right tabular-nums border-l border-gray-100 ${cls}`}>{stock < 0 ? '0' : nf(stock)}</td>
                      })}
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-1.5">{gLabel} — subtotal</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf(subOn)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf(subSold)}</td>
                  <td className="px-3 py-1.5"></td>
                  {subWeeks.map((v, i) => <td key={i} className="px-2 py-1.5 text-right tabular-nums border-l border-gray-100">{nf(v)}</td>)}
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
