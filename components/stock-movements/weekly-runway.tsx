'use client'

import { Fragment, useState } from 'react'
import type { WeeklyRunwayData, RunwayRow, RunwayIncoming, WeekCol, Market } from '@/lib/weekly-runway-data'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso: string | null) => (!iso || iso.length < 10 ? '' : `${Number(iso.slice(8, 10))} ${MON3[Number(iso.slice(5, 7)) - 1] ?? ''}`)
const shortRef = (po: string | null) => (po ? po.replace(/^([A-Z]+)-\d{4}-/, '$1-') : '')

type Basis = 'confirmed' | 'all'
interface ProjCell { closing: number; demand: number; detail: RunwayIncoming[] }
interface Proj { cells: ProjCell[]; coverWeeks: number | null; runsOut: string | null; noStock: boolean }

/** Walk the weeks for one view. "confirmed" counts only received receipts and
 *  no-PO production builds; "all" also counts open POs / transfers. */
function project(row: RunwayRow, basis: Basis, weeks: WeekCol[]): Proj {
  const keep = (d: RunwayIncoming) => basis === 'all' || d.source === 'receipt' || d.source === 'planned'
  let bal = row.onHand
  let cover: number | null = null
  let totalInc = 0
  const cells: ProjCell[] = row.weeks.map((w, i) => {
    const detail = w.detail.filter(keep)
    const incUnits = detail.reduce((s, d) => s + d.units, 0)
    totalInc += incUnits
    bal = bal - w.demand + incUnits
    if (cover === null && bal <= 0) cover = i + 1
    return { closing: Math.round(bal), demand: w.demand, detail }
  })
  const noStock = row.onHand <= 0 && totalInc <= 0
  const coverWeeks = noStock ? null : cover
  return { cells, coverWeeks, runsOut: coverWeeks ? weeks[coverWeeks - 1].endLabel : null, noStock }
}

function tone(closing: number, avgWeekly: number, noStock: boolean): { wrap: string; bal: string } {
  if (noStock) return { wrap: 'bg-slate-50', bal: 'text-slate-300' }
  if (closing <= 0) return { wrap: 'bg-rose-100', bal: 'text-rose-800' }
  if (avgWeekly > 0 && closing <= 2 * avgWeekly) return { wrap: 'bg-amber-100', bal: 'text-amber-800' }
  return { wrap: 'bg-emerald-50', bal: 'text-emerald-800' }
}

function incLabel(d: RunwayIncoming): string {
  if (d.source === 'planned') return 'no PO'
  if (d.source === 'receipt') return 'receipt'
  return shortRef(d.po) || 'order'
}

export function WeeklyRunway({ data }: { data: WeeklyRunwayData }) {
  const [basis, setBasis] = useState<Basis>('confirmed')
  const [order, setOrder] = useState<'group' | 'urgency'>('group')
  const [market, setMarket] = useState<'ALL' | Market>('ALL')

  const rows = data.rows.filter((r) => market === 'ALL' || r.market === market)
  const projected = rows.map((r) => ({ r, p: project(r, basis, data.weeks) }))
  const atRisk = projected.filter((x) => !x.p.noStock && x.p.coverWeeks != null).length

  // Month header groups.
  const mGroups: { label: string; span: number }[] = []
  for (const w of data.weeks) {
    const last = mGroups[mGroups.length - 1]
    if (last && last.label === w.monthLabel) last.span++
    else mGroups.push({ label: w.monthLabel, span: 1 })
  }

  // Row ordering.
  const ordered: { header: string | null; r: RunwayRow; p: Proj }[] = []
  if (order === 'urgency') {
    const sorted = [...projected].sort((a, b) => {
      if (a.p.noStock !== b.p.noStock) return a.p.noStock ? 1 : -1
      return (a.p.coverWeeks ?? 999) - (b.p.coverWeeks ?? 999)
    })
    for (const x of sorted) ordered.push({ header: null, r: x.r, p: x.p })
  } else {
    const groupOrder = PRODUCT_GROUPS.map((g) => g.value as string)
    const byGroup = new Map<string, typeof projected>()
    for (const x of projected) { const k = x.r.group ?? '__other__'; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k)!.push(x) }
    const keys = Array.from(byGroup.keys()).sort((a, b) => {
      const ia = groupOrder.indexOf(a), ib = groupOrder.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    for (const k of keys) {
      const list = byGroup.get(k)!.sort((a, b) => a.r.name.localeCompare(b.r.name) || (a.r.market === b.r.market ? 0 : a.r.market === 'NZ' ? -1 : 1))
      const label = k === '__other__' ? 'Other' : (PRODUCT_GROUP_LABELS[k] ?? k)
      list.forEach((x, i) => ordered.push({ header: i === 0 ? label : null, r: x.r, p: x.p }))
    }
  }

  const colCount = data.weeks.length + 3

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Stock today → weekly sales out → stock in · {data.horizonWeeks} weeks from {data.asOf ? fmtDate(data.asOf) : 'now'} ·
          {' '}<span className="font-semibold text-rose-700">{atRisk}</span> line{atRisk === 1 ? '' : 's'} forecast to run out
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5 gap-0.5 text-xs">
            {(['confirmed', 'all'] as const).map((b) => (
              <button key={b} onClick={() => setBasis(b)}
                className={`px-3 py-1 rounded-md font-medium ${basis === b ? 'bg-violet-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                title={b === 'confirmed' ? 'Received stock + no-PO production builds only' : 'Also counts open POs and transfers (to close out)'}>
                {b === 'confirmed' ? 'Confirmed stock' : 'With open orders'}
              </button>
            ))}
          </div>
          <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5 gap-0.5 text-xs">
            {(['group', 'urgency'] as const).map((o) => (
              <button key={o} onClick={() => setOrder(o)}
                className={`px-3 py-1 rounded-md font-medium ${order === o ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {o === 'group' ? 'By product group' : 'Soonest to run out'}
              </button>
            ))}
          </div>
          <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5 gap-0.5 text-xs">
            {(['ALL', 'NZ', 'AU'] as const).map((m) => (
              <button key={m} onClick={() => setMarket(m)}
                className={`px-3 py-1 rounded-md font-medium ${market === m ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {m === 'ALL' ? 'NZ + AU' : m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 -mt-1">
        {basis === 'confirmed'
          ? 'Confirmed stock: opening (received) + genuinely received POs + no-PO production builds. Open POs & transfers are not carried across.'
          : 'With open orders: also counts every open PO and transfer (overdue ones roll into this week) — use this to see what needs closing out.'}
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-270px)]">
          <table className="text-[11px] tabular-nums border-separate border-spacing-0 whitespace-nowrap">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 top-0 z-30 bg-emerald-800 text-white text-left px-3 py-1.5 min-w-[196px]">Product</th>
                <th rowSpan={2} className="sticky top-0 z-20 bg-emerald-800 text-white text-right px-2 py-1.5 border-r-2 border-white/30">Stock<br />today</th>
                {mGroups.map((g, i) => (
                  <th key={i} colSpan={g.span} className="sticky top-0 z-20 bg-emerald-700 text-emerald-50 text-center px-2 py-1 text-[9.5px] uppercase tracking-wide border-l border-white/20">{g.label}</th>
                ))}
                <th rowSpan={2} className="sticky right-0 top-0 z-30 bg-emerald-800 text-white text-center px-2 py-1.5 border-l-2 border-white/30 min-w-[100px]">Runs out</th>
              </tr>
              <tr>
                {data.weeks.map((w, i) => (
                  <th key={i} className={`sticky top-[29px] z-20 bg-emerald-700 text-emerald-50 text-right px-2 py-1 font-medium border-l border-white/10 ${w.current ? 'shadow-[inset_0_-2px_0_#38bdf8]' : ''}`}>
                    {w.current ? `to ${w.endLabel}` : w.label}{w.current && <span className="block text-[8px] font-normal text-sky-200">this week</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 && (
                <tr><td colSpan={colCount} className="px-4 py-10 text-center text-sm text-gray-500">No stock to project.</td></tr>
              )}
              {ordered.map(({ header, r, p }) => (
                <Fragment key={`${r.product_id}-${r.market}`}>
                  {header && (
                    <tr><td colSpan={colCount} className="sticky left-0 bg-gray-100 text-[9.5px] font-extrabold uppercase tracking-wider text-gray-600 px-3 py-1 border-y border-gray-200">{header}</td></tr>
                  )}
                  <tr className="group">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                      <span className={`inline-block text-[8px] font-extrabold px-1.5 rounded mr-1.5 align-middle ${r.market === 'AU' ? 'bg-sky-100 text-sky-800' : 'bg-gray-900 text-white'}`}>{r.market === 'AU' ? 'AUS' : 'NZ'}</span>
                      <span className="font-medium align-middle">{r.name}</span>
                      <span className="block text-[9px] text-gray-400 font-mono ml-6">{r.sku}</span>
                    </td>
                    <td className="bg-gray-50 font-bold text-right px-2 py-1.5 border-r-2 border-gray-200 border-b border-gray-100 text-[12px]">{nf(r.onHand)}</td>
                    {p.cells.map((c, i) => {
                      const t = tone(c.closing, r.avgWeekly, p.noStock)
                      return (
                        <td key={i} className={`align-top text-right px-2 py-1 border-l border-b border-gray-100 leading-tight ${t.wrap}`}>
                          <span className={`block font-bold ${t.bal}`}>{nf(c.closing)}</span>
                          {p.noStock
                            ? (i === 0 && <span className="block text-[9px] text-slate-400">no stock</span>)
                            : (c.demand > 0 && <span className="block text-[9px] text-slate-500">−{nf(c.demand)}</span>)}
                          {c.detail.map((d, j) => (
                            <span key={j} className="block text-[9px] font-extrabold text-sky-600" title={d.date ? `due ${fmtDate(d.date)}` : (d.source === 'planned' ? 'planned build — no PO yet' : '')}>
                              ▲ +{nf(d.units)} {incLabel(d)}
                            </span>
                          ))}
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-10 bg-white group-hover:bg-gray-50 text-center px-2 py-1.5 border-l-2 border-gray-200 border-b border-gray-100">
                      {p.noStock
                        ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-400 text-white">no stock</span>
                        : p.coverWeeks == null
                          ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">{data.horizonWeeks}+ wks</span>
                          : <>
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${p.coverWeeks <= 2 ? 'bg-rose-600' : p.coverWeeks <= 4 ? 'bg-amber-500' : 'bg-gray-500'}`}>{p.coverWeeks} wk{p.coverWeeks === 1 ? '' : 's'}</span>
                              <span className="block text-[9px] text-gray-500 mt-0.5">~{p.runsOut}</span>
                            </>}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-200 align-middle mr-1" />&gt; 2 wks cover</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 align-middle mr-1" />≤ 2 wks</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-rose-100 align-middle mr-1" />stocked out</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-slate-50 border border-slate-200 align-middle mr-1" />no stock held</span>
        <span><span className="text-sky-600 font-bold">▲ +units</span> stock in · <span className="text-slate-500">−units</span> sales out</span>
      </div>
    </div>
  )
}
