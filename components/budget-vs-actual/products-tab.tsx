'use client'

import { Fragment, useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CountedEomInput } from './counted-eom-input'
import { ActualCellInput, OpeningCellInput } from './actual-cell-input'
import { varBadgeClass, type ProductRow } from '@/lib/budget-vs-actual'
import { setProductWriteoff } from '@/app/(dashboard)/reporting/budget-vs-actual/actions'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'

type Sums = ReturnType<typeof sumRows>

function sumRows(rows: ProductRow[]) {
  return rows.reduce(
    (acc, r) => ({
      opening:     acc.opening   + (r.opening ?? 0),
      bud_retail:  acc.bud_retail  + r.budget_by_channel.nz_retail,
      bud_d2c:     acc.bud_d2c     + r.budget_by_channel.nz_d2c,
      bud_samples: acc.bud_samples + r.budget_by_channel.nz_samples,
      bud_total:   acc.bud_total   + r.budget_total,
      bud_sales:   acc.bud_sales   + r.budget_sales,
      retail:      acc.retail      + r.channels.nz_retail,
      d2c:         acc.d2c         + r.channels.nz_d2c,
      samples:     acc.samples     + r.channels.nz_samples,
      writeoff:    acc.writeoff    + (r.writeoff ?? 0),
      total_out:   acc.total_out   + r.total_out,
      total_sales: acc.total_sales + r.total_sales,
      calc_eom:    acc.calc_eom    + (r.calc_eom ?? 0),
      counted_eom: acc.counted_eom + (r.counted_eom ?? 0),
    }),
    { opening: 0, bud_retail: 0, bud_d2c: 0, bud_samples: 0, bud_total: 0, bud_sales: 0,
      retail: 0, d2c: 0, samples: 0, writeoff: 0, total_out: 0, total_sales: 0, calc_eom: 0, counted_eom: 0 },
  )
}

export function ProductsTab({
  rows, year_month, isLocked, scope = 'month', ytdLabel = null,
}: {
  rows: ProductRow[]; year_month: string; isLocked: boolean
  scope?: 'month' | 'ytd'; ytdLabel?: string | null
}) {
  const isYtd = scope === 'ytd'
  // Group rows by product group, in PRODUCT_GROUPS order; unknown groups last.
  const order = PRODUCT_GROUPS.map((g) => g.value as string)
  const grouped = new Map<string, ProductRow[]>()
  for (const r of rows) {
    const key = r.group ?? '__other__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  const grand = sumRows(rows)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="relative flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100">
        <div className="text-xs text-gray-500 min-w-0">
          {isYtd
            ? <span><span className="font-semibold text-emerald-800">Year to date{ytdLabel ? ` · ${ytdLabel}` : ''}</span> — cumulative sales &amp; budget; opening is the FY-start figure, stock closes at the latest month. Read-only — switch to <em>This month</em> to edit.</span>
            : <span className="text-gray-400">Monthly figures — editable.</span>}
        </div>
        <VarianceKey />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 2000 }}>
          <thead>
            {/* Group header row */}
            <tr className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="px-3 py-1 sticky left-0 bg-gray-100 z-20 border-r-2 border-gray-300"></th>
              <th className="px-2 py-1 sticky left-[320px] bg-gray-100 z-20 border-r-2 border-gray-300"></th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-emerald-50/40">NZ Retail</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-emerald-50/40">NZ D2C</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-purple-50/60">NZ Pipefill / Samples</th>
              <th className="px-2 py-1 text-center border-r border-gray-200 bg-rose-50/60">Write-off</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-gray-100 text-gray-400">AU (soon)</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200 bg-emerald-50">Total</th>
              <th colSpan={2} className="px-2 py-1 text-center border-r border-gray-200">Variance</th>
              <th colSpan={3} className="px-2 py-1 text-center bg-amber-50/40">Stock</th>
            </tr>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 w-[320px] min-w-[320px] max-w-[320px] z-20">Product</th>
              <th className="text-right px-2 py-2 w-[80px] sticky left-[320px] bg-gray-50 z-20 border-r-2 border-gray-300" title={isYtd ? 'Opening SOH at the FY start' : 'Opening SOH for the month'}>{isYtd ? 'Open (FY)' : 'Open'}</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50/40">Act</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-emerald-50/40">Act</th>
              <th className="text-right px-2 py-2 w-[80px] bg-blue-50/40" title="Budget pipefill (covers samples + buffer)">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-purple-50/60">Act</th>
              <th className="text-right px-2 py-2 w-[110px] bg-rose-50/60" title="Units written off — click ✎ to add the reason">Units · why</th>
              <th className="text-right px-2 py-2 w-[80px] bg-gray-100 text-gray-400">Bud</th>
              <th className="text-right px-2 py-2 w-[80px] bg-gray-100 text-gray-400">Act</th>
              <th className="text-right px-2 py-2 w-[90px] bg-blue-50/40">Bud total</th>
              <th className="text-right px-2 py-2 w-[90px] bg-emerald-50">Act total</th>
              <th className="text-right px-2 py-2 w-[100px]" title="(Retail+D2C act) − (Retail+D2C bud) — sales beat or miss">Var sales</th>
              <th className="text-right px-2 py-2 w-[100px]" title="Total act − Total bud (incl pipefill/samples)">Var total</th>
              <th className="text-right px-2 py-2 w-[100px] bg-amber-50/40" title="Opening − Total out">Calc EOM</th>
              <th className="text-right px-2 py-2 w-[100px]" title="Counted closing stock (manual)">Counted EOM</th>
              <th className="text-right px-2 py-2 w-[100px]">Stock var</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={18} className="px-4 py-8 text-center text-sm text-gray-500">
                  No products yet. Add products under <em>Planning → Products / BOMs</em>.
                </td>
              </tr>
            )}
            {groupKeys.map((key) => {
              const groupRows = grouped.get(key)!
              const label = key === '__other__' ? 'Other' : (PRODUCT_GROUP_LABELS[key] ?? key)
              return (
                <Fragment key={key}>
                  <tr className="bg-gray-100/80 border-y border-gray-200">
                    <td colSpan={18} className="px-3 py-1.5 sticky left-0 bg-gray-100/80 z-10 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                      {label} <span className="ml-1 normal-case font-normal text-gray-400">{groupRows.length}</span>
                    </td>
                  </tr>
                  {groupRows.map((r) => <ProductTr key={r.product_id} r={r} year_month={year_month} isLocked={isLocked} isYtd={isYtd} />)}
                  <SummaryRow label={`${label} — subtotal`} s={sumRows(groupRows)} subtle />
                </Fragment>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <SummaryRow label="Totals" s={grand} />
            </tfoot>
          )}
        </table>
      </div>
      <div className="p-3 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
        <strong>Legend:</strong>
        <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50/40">Budget (from demand forecast)</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-50/40">Actual sales channels</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-purple-50/60">Actual samples</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50/40">Calculated</span>
        <span className="ml-3 text-gray-400">Pipefill (budget) is compared against samples (actual). Variance colour key: top-right of the table.</span>
      </div>
    </div>
  )
}

function ProductTr({ r, year_month, isLocked, isYtd }: { r: ProductRow; year_month: string; isLocked: boolean; isYtd: boolean }) {
  const noActuals = r.total_out === 0 && r.budget_total === 0
  return (
    <tr className="group border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
        <div className="font-medium text-gray-900">{r.name}</div>
        <div className="text-[10px] font-mono text-gray-500">{r.sku}</div>
      </td>
      <td className="px-1 py-1 text-right tabular-nums sticky left-[320px] bg-white group-hover:bg-gray-50 z-10 border-r-2 border-gray-300">
        {isYtd
          ? <span className="px-1 text-gray-700">{r.opening != null ? r.opening.toLocaleString() : <span className="text-gray-300">—</span>}</span>
          : <OpeningCellInput entity_id={r.product_id} year_month={year_month} initial={r.opening} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{cellOrDash(r.budget_by_channel.nz_retail)}</td>
      <td className={isYtd ? 'px-2 py-2 text-right tabular-nums bg-emerald-50/40' : 'px-1 py-1 bg-emerald-50/40'}>
        {isYtd ? cellOrDash(r.channels.nz_retail)
          : <ActualCellInput product_id={r.product_id} year_month={year_month} channel="nz_retail" initial={r.channels.nz_retail} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{cellOrDash(r.budget_by_channel.nz_d2c)}</td>
      <td className={isYtd ? 'px-2 py-2 text-right tabular-nums bg-emerald-50/40' : 'px-1 py-1 bg-emerald-50/40'}>
        {isYtd ? cellOrDash(r.channels.nz_d2c)
          : <ActualCellInput product_id={r.product_id} year_month={year_month} channel="nz_d2c" initial={r.channels.nz_d2c} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40">{cellOrDash(r.budget_by_channel.nz_samples)}</td>
      <td className={isYtd ? 'px-2 py-2 text-right tabular-nums bg-purple-50/60' : 'px-1 py-1 bg-purple-50/60'}>
        {isYtd ? cellOrDash(r.channels.nz_samples)
          : <ActualCellInput product_id={r.product_id} year_month={year_month} channel="nz_samples" initial={r.channels.nz_samples} isLocked={isLocked} />}
      </td>
      <td className={isYtd ? 'px-2 py-2 bg-rose-50/60' : 'px-1 py-1 bg-rose-50/60'}>
        <WriteoffCell
          product_id={r.product_id} year_month={year_month}
          units={r.writeoff} comment={r.writeoff_comment} name={r.name}
          auUnits={r.writeoff_au} auComment={r.writeoff_au_comment}
          isLocked={isLocked} readOnly={isYtd}
        />
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-gray-50 text-gray-300">—</td>
      <td className="px-2 py-2 text-right tabular-nums bg-gray-50 text-gray-300">—</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-medium">{r.budget_total > 0 ? r.budget_total.toLocaleString() : <span className="text-gray-300">—</span>}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-medium">
        {r.total_out > 0 ? r.total_out.toLocaleString() : <span className="text-gray-300 italic">not entered</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {noActuals ? <span className="text-gray-300">—</span> : <VarBadge actual={r.total_sales} budget={r.budget_sales} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {noActuals ? <span className="text-gray-300">—</span> : <VarBadge actual={r.total_out} budget={r.budget_total} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-medium">
        {r.calc_eom != null ? r.calc_eom.toLocaleString() : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {isYtd
          ? (r.counted_eom != null ? r.counted_eom.toLocaleString() : <span className="text-gray-300">—</span>)
          : <CountedEomInput entity_type="product" entity_id={r.product_id} year_month={year_month} initial={r.counted_eom} isLocked={isLocked} />}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {r.stock_variance != null
          ? <span className={`inline-block px-1.5 py-0.5 rounded ${Math.abs(r.stock_variance) === 0 ? 'text-gray-400' : r.stock_variance > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>{r.stock_variance > 0 ? '+' : ''}{r.stock_variance.toLocaleString()}</span>
          : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

function SummaryRow({ label, s, subtle = false }: { label: string; s: Sums; subtle?: boolean }) {
  const bg = subtle ? 'bg-gray-50' : 'bg-gray-50 border-t-2 border-gray-200'
  return (
    <tr className={`${bg} ${subtle ? 'border-t border-gray-200 text-[11px] text-gray-600' : 'text-sm'}`}>
      <td className={`px-3 py-2 sticky left-0 ${subtle ? 'bg-gray-50' : 'bg-gray-50'} font-semibold z-10`}>{label}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold sticky left-[320px] bg-gray-50 z-10 border-r-2 border-gray-300">{s.opening.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_retail.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 font-semibold">{s.retail.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_d2c.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 font-semibold">{s.d2c.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_samples.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-purple-50/60 font-semibold">{s.samples.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-rose-50/60 font-semibold">{s.writeoff > 0 ? s.writeoff.toLocaleString() : <span className="text-gray-300">—</span>}</td>
      <td colSpan={2} className="px-2 py-2 text-right tabular-nums bg-gray-100 text-gray-300">—</td>
      <td className="px-2 py-2 text-right tabular-nums bg-blue-50/40 font-semibold">{s.bud_total.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50 font-semibold">{s.total_out.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.bud_sales > 0 ? <VarBadge actual={s.total_sales} budget={s.bud_sales} /> : '—'}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.bud_total > 0 ? <VarBadge actual={s.total_out} budget={s.bud_total} /> : '—'}</td>
      <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 font-semibold">{s.calc_eom.toLocaleString()}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.counted_eom.toLocaleString()}</td>
      <td></td>
    </tr>
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

function KeySwatch({ className }: { className: string }) {
  return <span className={`mt-0.5 w-3.5 h-3.5 rounded border border-black/5 shrink-0 ${className}`} />
}

/**
 * Write-off cell: units input + a ✎ popover for the reason. Units and reason
 * are always saved together so neither clobbers the other. Read-only in YTD
 * (shows the cumulative units and reasons).
 */
function WriteoffCell({
  product_id, year_month, units, comment, name, auUnits, auComment, isLocked, readOnly,
}: {
  product_id: string; year_month: string; units: number; comment: string | null
  name: string; auUnits: number; auComment: string | null; isLocked: boolean; readOnly: boolean
}) {
  const router = useRouter()
  const [unitsVal, setUnitsVal] = useState<string>(units ? String(units) : '')
  const [commentVal, setCommentVal] = useState<string>(comment ?? '')
  const [auUnitsVal, setAuUnitsVal] = useState<string>(auUnits ? String(auUnits) : '')
  const [auCommentVal, setAuCommentVal] = useState<string>(auComment ?? '')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Re-sync the shown value when the row's data changes (e.g. after an import
  // or month switch) — the cell persists across refreshes, so without this the
  // input keeps its stale value even though the totals update.
  useEffect(() => {
    setUnitsVal(units ? String(units) : '')
    setCommentVal(comment ?? '')
    setAuUnitsVal(auUnits ? String(auUnits) : '')
    setAuCommentVal(auComment ?? '')
  }, [units, comment, auUnits, auComment, year_month, product_id])

  const hasComment = (comment ?? '').trim().length > 0
  const hasAu = (auUnits || 0) > 0

  function persist(nextUnits: string, nextComment: string) {
    if (isLocked || readOnly) return
    const u = nextUnits.trim() === '' ? 0 : Number(nextUnits)
    if (!Number.isFinite(u)) { setError('Invalid'); return }
    if ((u || 0) === (units || 0) && nextComment.trim() === (comment ?? '').trim()) return  // no change
    setError(null)
    start(async () => {
      const res = await setProductWriteoff({ product_id, year_month, units: u, comment: nextComment.trim() || null, market: 'NZ' })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      router.refresh()
    })
  }

  function persistAu(nextUnits: string, nextComment: string) {
    if (isLocked || readOnly) return
    const u = nextUnits.trim() === '' ? 0 : Number(nextUnits)
    if (!Number.isFinite(u)) { setError('Invalid'); return }
    if ((u || 0) === (auUnits || 0) && nextComment.trim() === (auComment ?? '').trim()) return  // no change
    setError(null)
    start(async () => {
      const res = await setProductWriteoff({ product_id, year_month, units: u, comment: nextComment.trim() || null, market: 'AU' })
      if (!res.ok) { setError(res.error ?? 'Save failed'); return }
      router.refresh()
    })
  }

  function openPopover() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 272) })
    setOpen(true)
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {readOnly
        ? <span className="text-right tabular-nums text-rose-800 font-medium px-1">{units > 0 ? units.toLocaleString() : <span className="text-gray-300">—</span>}</span>
        : <input
            type="number" step="any" min={0}
            value={unitsVal}
            onChange={(e) => setUnitsVal(e.target.value)}
            onBlur={() => persist(unitsVal, commentVal)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            disabled={isLocked || pending}
            placeholder={isLocked ? '—' : '0'}
            className={`w-14 text-right text-xs border rounded px-1.5 py-1 tabular-nums ${error ? 'border-red-300 bg-red-50' : 'border-gray-200'} ${isLocked ? 'bg-gray-50 text-gray-400' : 'bg-white'}`}
          />}
      {(!readOnly || hasComment || hasAu) && (
        <button
          ref={btnRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPopover())}
          title={hasComment || hasAu ? 'View / edit reason + AUS write-off' : 'Add reason / AUS write-off'}
          aria-label="Edit write-off reason and AUS write-off"
          className={`relative w-5 h-5 shrink-0 rounded border inline-flex items-center justify-center text-[10px] ${hasComment || hasAu ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-700'}`}
        >
          ✎{(hasComment || hasAu) && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500" />}
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-left">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-white">NZ</span>
              <div className="text-[11px] font-semibold text-gray-700">Why written off — {name}</div>
            </div>
            <textarea
              value={commentVal}
              onChange={(e) => setCommentVal(e.target.value)}
              disabled={readOnly || isLocked}
              placeholder={readOnly ? 'No reason recorded.' : 'e.g. Damaged in transit — insurance claim lodged'}
              className="w-full text-xs border border-gray-200 rounded p-2 min-h-[56px] resize-y disabled:bg-gray-50 disabled:text-gray-600"
            />

            {/* AUS write-off — separate country entry, feeds the Stock Movements AUS row. */}
            <div className="mt-3 pt-2.5 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">AUS</span>
                  <div className="text-[11px] font-semibold text-gray-700">AUS write-off</div>
                </div>
                <input
                  type="number" step="any" min={0}
                  value={auUnitsVal}
                  onChange={(e) => setAuUnitsVal(e.target.value)}
                  onBlur={() => persistAu(auUnitsVal, auCommentVal)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  disabled={readOnly || isLocked || pending}
                  placeholder={readOnly ? '—' : '0'}
                  className="w-16 text-right text-xs border border-gray-200 rounded px-1.5 py-1 tabular-nums disabled:bg-gray-50 disabled:text-gray-600"
                />
              </div>
              <textarea
                value={auCommentVal}
                onChange={(e) => setAuCommentVal(e.target.value)}
                disabled={readOnly || isLocked}
                placeholder={readOnly ? 'No AUS reason recorded.' : 'AUS reason (optional)'}
                className="w-full text-xs border border-gray-200 rounded p-2 min-h-[48px] resize-y disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-medium px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">Close</button>
              {!readOnly && !isLocked && (
                <button type="button" onClick={() => { persist(unitsVal, commentVal); persistAu(auUnitsVal, auCommentVal); setOpen(false) }}
                  className="text-[11px] font-medium px-2.5 py-1 rounded bg-gray-900 text-white hover:bg-gray-800">Save</button>
              )}
            </div>
          </div>
        </>
      )}
      {error && <span className="text-[9px] text-red-600">{error}</span>}
    </div>
  )
}

/** Click-to-open key explaining what the variance badge colours mean. */
function VarianceKey() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-2 py-1 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
      >
        <span className="w-3.5 h-3.5 rounded-full border border-gray-400 inline-flex items-center justify-center text-[9px] leading-none italic font-serif">i</span>
        Variance colours
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-1 z-40 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-3.5 text-left">
            <div className="text-xs font-semibold text-gray-800 mb-2.5">What the variance colours mean</div>
            <ul className="space-y-2 text-[11px] text-gray-700">
              <li className="flex items-start gap-2"><KeySwatch className="bg-gray-100" /><span><b className="text-gray-800">On target</b> — within 10% of budget, over or under.</span></li>
              <li className="flex items-start gap-2"><KeySwatch className="bg-emerald-100" /><span><b className="text-gray-800">Beat budget</b> — more than 10% above (deeper green over 25%).</span></li>
              <li className="flex items-start gap-2"><KeySwatch className="bg-amber-100" /><span><b className="text-gray-800">Under budget</b> — 10–25% short.</span></li>
              <li className="flex items-start gap-2"><KeySwatch className="bg-rose-100" /><span><b className="text-gray-800">Well under</b> — more than 25% short.</span></li>
            </ul>
            <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-[10px] text-gray-500 leading-relaxed">
              Percentage is (actual − budget) ÷ budget. Coming in over budget is never amber or red.
              <b className="text-gray-600"> Var sales</b> counts retail + D2C; <b className="text-gray-600">Var total</b> also includes samples.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
