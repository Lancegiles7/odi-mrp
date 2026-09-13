'use client'

import { Fragment, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setStockAdjustment } from '@/app/(dashboard)/stock-movements/actions'
import type { IngStockLedger, IngStockRow, IngMarketRow, IngCell } from '@/lib/ingredient-stock-movements'

const nf = (n: number) => (n === 0 ? '—' : Number(n.toFixed(n < 100 && n % 1 !== 0 ? 2 : 0)).toLocaleString())
const money = (n: number, cur: 'NZ$' | 'A$') => (n ? `${cur}${Math.round(n).toLocaleString()}` : '—')
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

interface Props {
  ledger: IngStockLedger
  group: 'flat' | 'supplier'
}

export function IngredientStockTable({ ledger, group }: Props) {
  const { rows, months } = ledger
  const seedLabel = 'End Jul'

  const groups = useMemo(() => {
    if (group !== 'supplier') return [{ key: 'all', name: null as string | null, rows }]
    const by = new Map<string, IngStockRow[]>()
    for (const r of rows) {
      const k = r.supplier_name
      if (!by.has(k)) by.set(k, [])
      by.get(k)!.push(r)
    }
    return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, rs]) => ({ key: name, name, rows: rs }))
  }, [group, rows])

  const minWidth = 240 + 74 + months.length * 6 * 58

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          <Link href="/stock-movements?view=ingredients"
            className={`px-3 py-1.5 font-medium ${group === 'flat' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>By ingredient</Link>
          <Link href="/stock-movements?view=ingredients&group=supplier"
            className={`px-3 py-1.5 font-medium border-l border-gray-300 ${group === 'supplier' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>By supplier</Link>
        </div>
        <span className="text-xs text-gray-500">
          Opening + received − used − wastage = system · enter your month-end count to override · click a row to see the SKUs using it
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
          Nothing to show yet — set an end-of-July count on an ingredient, or once production plans and POs exist the ledger fills in.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-230px)]">
            <table className="text-xs tabular-nums border-separate border-spacing-0" style={{ minWidth }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-40 bg-gray-50 h-7 border-b border-gray-200" />
                  <th className="sticky left-[240px] top-0 z-40 bg-gray-50 h-7 border-b border-r-2 border-gray-300 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Opening<div className="text-[8px] font-normal normal-case text-gray-400">{seedLabel}</div></th>
                  {months.map((m, i) => (
                    <th key={m} colSpan={6} className={`sticky top-0 z-30 h-7 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border-b border-gray-200 ${i > 0 ? 'border-l-2 border-emerald-200' : ''}`}>{label(m)}</th>
                  ))}
                </tr>
                <tr>
                  <th className="sticky left-0 top-7 z-40 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[240px] min-w-[240px]">Ingredient</th>
                  <th className="sticky left-[240px] top-7 z-40 bg-gray-50 border-b border-r-2 border-gray-300" />
                  {months.map((m, i) => (
                    <Fragment key={m}>
                      <th className={`top-7 sticky z-30 bg-gray-50 px-1.5 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase border-b border-gray-200 ${i > 0 ? 'border-l-2 border-emerald-200' : ''}`}>In</th>
                      <th className="top-7 sticky z-30 bg-gray-50 px-1.5 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase border-b border-gray-200">Used</th>
                      <th className="top-7 sticky z-30 bg-gray-50 px-1.5 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase border-b border-gray-200">Waste</th>
                      <th className="top-7 sticky z-30 bg-gray-50 px-1.5 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase border-b border-gray-200">Sys</th>
                      <th className="top-7 sticky z-30 bg-gray-50 px-1.5 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase border-b border-gray-200">Actual</th>
                      <th className="top-7 sticky z-30 bg-gray-50 px-1.5 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase border-b border-gray-200">Value</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    {g.name && (
                      <tr>
                        <td colSpan={2 + months.length * 6} className="sticky left-0 bg-gray-100/70 px-3 py-1.5 text-[11px] font-bold text-gray-700 border-y border-gray-200">{g.name} · {g.rows.length}</td>
                      </tr>
                    )}
                    {g.rows.map((r) => (
                      <IngredientRows key={r.entity_id} row={r} months={months} uomLabel={r.uom} />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function IngredientRows({ row, months, uomLabel }: { row: IngStockRow; months: string[]; uomLabel: string }) {
  const [open, setOpen] = useState(false)
  // Combined drivers per product per month (NZ + AU) for the expand.
  const drivers = useMemo(() => {
    const byProduct = new Map<string, { sku: string; name: string; byMonth: Record<string, number> }>()
    for (const m of months) {
      for (const mk of [row.nz, row.au]) {
        for (const d of mk.cells[m]?.drivers ?? []) {
          if (!byProduct.has(d.product_id)) byProduct.set(d.product_id, { sku: d.sku, name: d.name, byMonth: {} })
          const p = byProduct.get(d.product_id)!
          p.byMonth[m] = (p.byMonth[m] ?? 0) + d.used
        }
      }
    }
    return Array.from(byProduct.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [row, months])

  return (
    <>
      <MarketRow row={row} market="NZ" data={row.nz} cur="NZ$" months={months} uomLabel={uomLabel}
        head={<button onClick={() => setOpen((v) => !v)} className="text-gray-400 hover:text-gray-700 mr-1">{open ? '▾' : '▸'}</button>} showName />
      <MarketRow row={row} market="AU" data={row.au} cur="A$" months={months} uomLabel={uomLabel} />
      <MarketRow row={row} market="TOTAL" data={row.total} cur="NZ$" months={months} uomLabel={uomLabel} isTotal />
      {open && drivers.map((d) => (
        <tr key={d.sku} className="text-[11px]">
          <td className="sticky left-0 bg-emerald-50/40 pl-9 pr-3 py-1 text-gray-600 border-b border-gray-100">└ {d.name} <span className="text-gray-400 font-mono text-[9px]">{d.sku}</span></td>
          <td className="sticky left-[240px] bg-emerald-50/40 border-b border-r-2 border-gray-300" />
          {months.map((m, i) => (
            <Fragment key={m}>
              <td className={`bg-emerald-50/30 border-b border-gray-100 ${i > 0 ? 'border-l-2 border-emerald-200' : ''}`} />
              <td className="bg-emerald-50/30 border-b border-gray-100 px-1.5 text-right text-blue-700">{d.byMonth[m] ? nf(d.byMonth[m]) : ''}</td>
              <td colSpan={4} className="bg-emerald-50/30 border-b border-gray-100" />
            </Fragment>
          ))}
        </tr>
      ))}
    </>
  )
}

function MarketRow({ row, market, data, cur, months, uomLabel, head, showName, isTotal }: {
  row: IngStockRow; market: 'NZ' | 'AU' | 'TOTAL'; data: IngMarketRow; cur: 'NZ$' | 'A$'
  months: string[]; uomLabel: string; head?: React.ReactNode; showName?: boolean; isTotal?: boolean
}) {
  const badge = market === 'NZ'
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-white">NZ</span>
    : market === 'AU'
      ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">AUS</span>
      : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">TOTAL</span>
  const bg = market === 'AU' ? 'bg-sky-50/30' : isTotal ? 'bg-gray-50' : 'bg-white'
  const editable = market !== 'TOTAL'
  const rowBorder = isTotal ? 'border-b-2 border-gray-300' : 'border-b border-gray-100'

  return (
    <tr className={`${bg}`}>
      <td className={`sticky left-0 z-10 ${bg} px-3 py-1 ${rowBorder}`}>
        <div className="flex items-center gap-1.5">
          {showName ? head : <span className="w-4" />}
          {badge}
          {showName
            ? <span className="font-medium text-gray-900 truncate max-w-[150px]">{row.name}</span>
            : <span className="text-gray-400 text-[10px] truncate max-w-[150px]">{row.name}</span>}
        </div>
        {showName && <div className="text-[9px] font-mono text-gray-400 pl-[26px]">{row.sku} · {uomLabel}</div>}
      </td>
      {/* Opening (end-July count) */}
      <td className={`sticky left-[240px] z-10 ${bg} px-1.5 py-1 text-right border-r-2 border-gray-300 ${rowBorder} text-gray-500`}>
        {editable
          ? <ManualCell entity={row.entity_id} market={market} month="2026-07-01" field="count" units={data.opening || null} comment={data.openingComment} tone="count" uom={uomLabel} />
          : nf(data.opening)}
      </td>
      {months.map((m, i) => {
        const c = data.cells[m]
        return (
          <Fragment key={m}>
            <td className={`px-1.5 py-1 text-right text-emerald-700 ${rowBorder} ${i > 0 ? 'border-l-2 border-emerald-100' : ''}`}>{nf(c.inbound)}</td>
            <td className={`px-1.5 py-1 text-right text-blue-700 ${rowBorder}`}>{nf(c.used)}</td>
            <td className={`px-1 py-0.5 text-right ${rowBorder}`}>
              {editable ? <ManualCell entity={row.entity_id} market={market} month={m} field="wastage" units={c.wastage || null} comment={c.wastageComment} tone="waste" uom={uomLabel} /> : nf(c.wastage)}
            </td>
            <td className={`px-1.5 py-1 text-right text-gray-400 ${rowBorder}`}>{c.counted != null ? <s>{nf(c.system)}</s> : nf(c.system)}</td>
            <td className={`px-1 py-0.5 text-right ${rowBorder}`}>
              {editable
                ? <ManualCell entity={row.entity_id} market={market} month={m} field="count" units={c.counted} comment={c.countComment} tone="count" uom={uomLabel} placeholderVal={c.system} />
                : <span className="font-semibold">{nf(c.eom)}</span>}
            </td>
            <td className={`px-1.5 py-1 text-right text-emerald-800 ${rowBorder} ${isTotal ? 'font-semibold' : ''}`}>{money(c.value, cur)}</td>
          </Fragment>
        )
      })}
    </tr>
  )
}

/** Editable number + comment popover. Sends units and comment together so the
 *  server keeps both in step. */
function ManualCell({ entity, market, month, field, units, comment, tone, uom, placeholderVal }: {
  entity: string; market: 'NZ' | 'AU'; month: string; field: 'wastage' | 'count'
  units: number | null; comment: string | null; tone: 'waste' | 'count'; uom: string; placeholderVal?: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [val, setVal] = useState<string>(units == null ? '' : String(units))
  const [cmt, setCmt] = useState<string>(comment ?? '')
  const [openC, setOpenC] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  function save(nextVal: string, nextCmt: string) {
    const u = nextVal.trim() === '' ? null : Number(nextVal)
    if (u != null && !Number.isFinite(u)) return
    start(async () => {
      await setStockAdjustment({ entity_type: 'ingredient', entity_id: entity, year_month: month, market, field, units: u, comment: nextCmt.trim() || null })
      router.refresh()
    })
  }
  const hasComment = (comment ?? '').trim().length > 0
  const border = tone === 'waste' ? 'border-rose-200 focus:border-rose-400' : 'border-violet-200 focus:border-violet-400'
  const text = tone === 'waste' ? 'text-rose-700' : (units != null ? 'text-violet-700 font-semibold' : 'text-gray-500')

  return (
    <span className="inline-flex items-center gap-0.5 justify-end">
      <input value={val} disabled={pending} inputMode="decimal"
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if ((val.trim() === '' ? null : Number(val)) !== units) save(val, cmt) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        placeholder={placeholderVal != null && placeholderVal !== 0 ? String(Math.round(placeholderVal)) : (tone === 'waste' ? '0' : '—')}
        className={`w-12 text-right text-[11px] tabular-nums bg-white border rounded px-1 py-0.5 ${border} ${text} placeholder:text-gray-300`} />
      <button ref={btnRef} type="button" title={hasComment ? comment! : 'Add a note'}
        onClick={() => { const r = btnRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 240) }); setOpenC(true) }}
        className={`text-[9px] w-4 h-4 rounded border inline-flex items-center justify-center ${hasComment ? 'bg-violet-50 border-violet-300 text-violet-600' : 'border-gray-200 text-gray-300 hover:text-gray-500'}`}>✎</button>
      {openC && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpenC(false); if (cmt !== (comment ?? '')) save(val, cmt) }} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left }} className="z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5">
            <div className="text-[10px] font-semibold text-gray-600 mb-1">{tone === 'waste' ? 'Why wasted' : 'Why the count differs'}</div>
            <textarea value={cmt} onChange={(e) => setCmt(e.target.value)} autoFocus
              placeholder={tone === 'waste' ? 'e.g. spoiled at Brand Nation' : 'e.g. recount — 5kg short'}
              className="w-full text-xs border border-gray-200 rounded p-1.5 min-h-[52px] resize-y" />
            <div className="flex justify-end mt-1.5">
              <button type="button" onClick={() => { setOpenC(false); save(val, cmt) }} className="text-[11px] font-medium px-2.5 py-1 rounded bg-gray-900 text-white">Save</button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}
