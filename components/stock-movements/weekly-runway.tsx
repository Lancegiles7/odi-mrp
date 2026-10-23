'use client'

import { Fragment, useState } from 'react'
import type { WeeklyRunwayData, RunwayRow, RunwayCell, RunwayIncoming, Market } from '@/lib/weekly-runway-data'

const nf = (n: number) => Math.round(n).toLocaleString('en-NZ')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso: string | null) => {
  if (!iso || iso.length < 10) return ''
  return `${Number(iso.slice(8, 10))} ${MON3[Number(iso.slice(5, 7)) - 1] ?? ''}`
}

/** Colour by cover: red ≤ 0, amber ≤ 2 weeks of demand, else green. */
function tone(c: RunwayCell, avgWeekly: number): string {
  if (c.closing <= 0) return 'bg-rose-100 text-rose-800 font-bold'
  if (avgWeekly > 0 && c.closing <= 2 * avgWeekly) return 'bg-amber-100 text-amber-800 font-semibold'
  return 'bg-emerald-50 text-emerald-900'
}

function incomingLabel(d: RunwayIncoming): string {
  if (d.kind === 'planned') return `No PO · planned build +${nf(d.units)} (last week of month)`
  return `${d.po ?? 'Receipt'} +${nf(d.units)}${d.date ? ` · due ${fmtDate(d.date)}` : ''}`
}

export function WeeklyRunway({ data }: { data: WeeklyRunwayData }) {
  const [market, setMarket] = useState<'ALL' | Market>('ALL')
  const [tip, setTip] = useState<{ x: number; y: number; detail: RunwayIncoming[] } | null>(null)
  const rows = data.rows.filter((r) => market === 'ALL' || r.market === market)

  // Month header groups (consecutive weeks sharing a month).
  const groups: { label: string; span: number }[] = []
  for (const w of data.weeks) {
    const last = groups[groups.length - 1]
    if (last && last.label === w.monthLabel) last.span++
    else groups.push({ label: w.monthLabel, span: 1 })
  }

  const atRisk = rows.filter((r) => r.coverWeeks != null).length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Projected closing stock per week from {data.asOf ? fmtDate(data.asOf) : 'now'} · {data.horizonWeeks} weeks ·
          {' '}<span className="font-semibold text-rose-700">{atRisk}</span> line{atRisk === 1 ? '' : 's'} forecast to run out
        </p>
        <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5 gap-0.5 text-xs">
          {(['ALL', 'NZ', 'AU'] as const).map((m) => (
            <button key={m} onClick={() => setMarket(m)}
              className={`px-3 py-1 rounded-md font-medium ${market === m ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {m === 'ALL' ? 'NZ + AU' : m}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-240px)]">
          <table className="text-[11px] tabular-nums border-separate border-spacing-0 whitespace-nowrap">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 top-0 z-30 bg-emerald-800 text-white text-left px-3 py-1.5 min-w-[210px]">Product</th>
                <th rowSpan={2} className="sticky top-0 z-20 bg-emerald-800 text-white text-right px-2 py-1.5 border-r-2 border-white/30">On hand<br />now</th>
                {groups.map((g, i) => (
                  <th key={i} colSpan={g.span} className="sticky top-0 z-20 bg-emerald-700 text-emerald-50 text-center px-2 py-1 text-[9.5px] uppercase tracking-wide border-l border-white/20">{g.label}</th>
                ))}
                <th rowSpan={2} className="sticky right-0 top-0 z-30 bg-emerald-800 text-white text-center px-2 py-1.5 border-l-2 border-white/30 min-w-[108px]">Runs out</th>
              </tr>
              <tr>
                {data.weeks.map((w, i) => (
                  <th key={i} className={`sticky top-[29px] z-20 bg-emerald-700 text-emerald-50 text-right px-2 py-1 font-medium border-l border-white/10 ${w.current ? 'shadow-[inset_0_-2px_0_#7dd3fc]' : ''}`}>
                    {w.label}{w.current && <span className="block text-[8px] font-normal text-sky-200">now</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={data.weeks.length + 3} className="px-4 py-10 text-center text-sm text-gray-500">No stock to project.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={`${r.product_id}-${r.market}`} className="group">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                    <span className={`inline-block text-[8.5px] font-extrabold px-1.5 rounded mr-1.5 align-middle ${r.market === 'AU' ? 'bg-sky-100 text-sky-800' : 'bg-gray-900 text-white'}`}>{r.market === 'AU' ? 'AUS' : 'NZ'}</span>
                    <span className="font-medium align-middle">{r.name}</span>
                    <span className="block text-[9px] text-gray-400 font-mono ml-7">{r.sku}</span>
                  </td>
                  <td className="bg-gray-50 font-bold text-right px-2 py-1.5 border-r-2 border-gray-200 border-b border-gray-100">{nf(r.onHand)}</td>
                  {r.weeks.map((c, i) => {
                    const hasInc = c.detail.length > 0
                    return (
                      <td key={i}
                        onMouseEnter={hasInc ? (e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.right, y: b.bottom, detail: c.detail }) } : undefined}
                        onMouseLeave={hasInc ? () => setTip(null) : undefined}
                        className={`relative text-right px-2 py-1.5 border-l border-b border-gray-100 ${tone(c, r.avgWeekly)} ${hasInc ? 'cursor-help' : ''}`}>
                        {nf(c.closing)}
                        {hasInc && <span className="absolute top-0 left-0.5 text-sky-600 text-[9px] leading-none">▲</span>}
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 bg-white group-hover:bg-gray-50 text-center px-2 py-1.5 border-l-2 border-gray-200 border-b border-gray-100">
                    {r.coverWeeks == null
                      ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">{data.horizonWeeks}+ wks</span>
                      : <>
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${r.coverWeeks <= 2 ? 'bg-rose-600' : r.coverWeeks <= 4 ? 'bg-amber-500' : 'bg-gray-500'} text-white`}>{r.coverWeeks} wk{r.coverWeeks === 1 ? '' : 's'}</span>
                          <span className="block text-[9px] text-gray-500 mt-0.5">out ~{r.runsOut}</span>
                        </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-200 align-middle mr-1" />&gt; 2 weeks cover</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 align-middle mr-1" />≤ 2 weeks cover</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-rose-100 align-middle mr-1" />stocked out (≤ 0)</span>
        <span><span className="text-sky-600">▲</span> incoming — hover for PO / build detail</span>
      </div>

      {tip && (
        <div style={{ position: 'fixed', left: tip.x, top: tip.y + 4, transform: 'translateX(-100%)', zIndex: 60 }}
          className="w-64 bg-slate-900 text-slate-100 rounded-lg shadow-xl p-3 text-left pointer-events-none">
          <div className="text-[11px] font-bold text-white border-b border-slate-700 pb-1.5 mb-1.5">Incoming this week</div>
          {tip.detail.map((d, i) => (
            <div key={i} className="text-[11px] py-0.5 flex items-start gap-1.5">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${d.kind === 'planned' ? 'bg-slate-700 text-slate-300' : 'bg-sky-900 text-sky-200'}`}>{d.kind === 'planned' ? 'NO PO' : 'PO'}</span>
              <span className="text-slate-200">{incomingLabel(d)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
