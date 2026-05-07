import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { rollingMonths, monthLabel } from '@/lib/demand'
import { getPlanningAnchor } from '@/lib/settings'

export const metadata: Metadata = { title: 'Dashboard' }

interface BudgetSnapshot {
  id: string
  source_filename: string
  uploaded_at: string
  uploaded_by: string | null
}

interface BudgetItem {
  section: 'pnl' | 'd2c' | 'retail'
  metric: string
  region: 'nz' | 'au' | 'total'
  channel: string | null
  year_month: string | null
  fiscal_year: number | null
  value: number | null
}

// ============================================================
// Formatting helpers
// ============================================================
function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${Math.round(abs)}`
}

function fmtMoneyExact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString()
}

function fmtMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', '-')
}

// ============================================================
// Item lookup
// ============================================================
function key(it: BudgetItem): string {
  return [it.section, it.metric, it.region, it.channel ?? '', it.year_month ?? '', it.fiscal_year ?? ''].join('|')
}

class Lookup {
  private byKey: Map<string, number>
  constructor(items: BudgetItem[]) {
    this.byKey = new Map()
    for (const it of items) if (it.value != null) this.byKey.set(key(it as BudgetItem), it.value)
  }
  monthly(section: BudgetItem['section'], metric: string, region: BudgetItem['region'], month: string, channel: string | null = null): number | null {
    return this.byKey.get([section, metric, region, channel ?? '', month, ''].join('|')) ?? null
  }
  fy(section: BudgetItem['section'], metric: string, region: BudgetItem['region'], fy: number, channel: string | null = null): number | null {
    return this.byKey.get([section, metric, region, channel ?? '', '', fy].join('|')) ?? null
  }
}

// ============================================================
// Page
// ============================================================
function fyMonths(fy: number): string[] {
  // FY27 = Apr 2026 → Mar 2027 ; FY28 = Apr 2027 → Mar 2028 ; etc.
  const startYear = 2000 + fy - 1   // FY27 → 2026
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const m = new Date(Date.UTC(startYear, 3 + i, 1))
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}-01`)
  }
  return out
}

export default async function DashboardPage({ searchParams }: { searchParams: { fy?: string } }) {
  const supabase = createClient()

  const selectedFy = searchParams.fy === '28' ? 28 : searchParams.fy === '29' ? 29 : 27
  const monthsForFy = fyMonths(selectedFy)

  // Latest budget snapshot
  const { data: snap } = await supabase
    .from('budget_snapshots')
    .select('id, source_filename, uploaded_at, uploaded_by')
    .eq('is_current', true)
    .maybeSingle() as { data: BudgetSnapshot | null }

  let items: BudgetItem[] = []
  if (snap) {
    const { data } = await supabase
      .from('budget_line_items')
      .select('section, metric, region, channel, year_month, fiscal_year, value')
      .eq('snapshot_id', snap.id) as { data: BudgetItem[] | null }
    items = (data ?? []).map((it) => ({
      ...it,
      year_month: it.year_month ? it.year_month.slice(0, 10) : null,
    }))
  }

  const L = new Lookup(items)

  // ── Live MRP snapshot data
  const planningAnchor = await getPlanningAnchor()
  const months = rollingMonths(undefined, planningAnchor)
  const firstMonth = months[0]
  const [{ count: openPoCount }, { data: openPoLines }, { count: productCount }] = await Promise.all([
    supabase.from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'submitted', 'partially_received']),
    supabase.from('purchase_order_lines')
      .select('quantity_ordered, quantity_received, unit_cost, purchase_order_id, purchase_orders(status)') as { data: Array<{ quantity_ordered: number; quantity_received: number; unit_cost: number | null; purchase_order_id: string; purchase_orders: { status: string } | null }> | null },
    supabase.from('products')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('is_active', true),
  ])
  const openPoValue = (openPoLines ?? [])
    .filter((l) => l.purchase_orders?.status && ['draft', 'submitted', 'partially_received'].includes(l.purchase_orders.status))
    .reduce((s, l) => s + (Number(l.unit_cost ?? 0) * Math.max(0, Number(l.quantity_ordered) - Number(l.quantity_received))), 0)

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {snap
              ? <>Budget · <span className="font-medium">{snap.source_filename}</span> · uploaded {new Date(snap.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</>
              : <>No budget snapshot loaded — upload one to populate this page.</>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {snap && (
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
              {[27, 28, 29].map((fy) => (
                <Link
                  key={fy}
                  href={fy === 27 ? '/' : `/?fy=${fy}`}
                  className={`px-3 py-1.5 font-medium ${fy !== 27 ? 'border-l border-gray-300' : ''} ${
                    selectedFy === fy ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  FY{fy} monthly
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/budget/import"
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50"
          >
            {snap ? '↑ Re-upload XLSX' : '↑ Upload budget XLSX'}
          </Link>
        </div>
      </header>

      {!snap && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-sm text-gray-700 mb-3">
            No budget loaded yet. Upload your FY budget workbook (the one with the &quot;Copy of …&quot; presentation tabs)
            to see the P&amp;L breakdown, D2C orders, and retail orders.
          </p>
          <Link href="/budget/import" className="inline-block px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800">
            Upload XLSX
          </Link>
        </div>
      )}

      {/* TOP TILES */}
      {snap && (
        <div className="grid grid-cols-5 gap-3">
          <Tile label="Gross revenue FY27"
                value={fmtMoney(L.fy('pnl', 'gross_revenue_total', 'total', 27))}
                sub={`D2C ${fmtMoney(L.fy('pnl', 'gross_revenue_d2c', 'total', 27))} · B2B ${fmtMoney(L.fy('pnl', 'gross_revenue_b2b', 'total', 27))}`} />
          <Tile label="Net revenue FY27"
                value={fmtMoney(L.fy('pnl', 'net_revenue_total', 'total', 27))}
                sub={(() => {
                  const fy27 = L.fy('pnl', 'net_revenue_total', 'total', 27) ?? 0
                  const fy29 = L.fy('pnl', 'net_revenue_total', 'total', 29) ?? 0
                  if (!fy27) return ''
                  return `→ FY29 ${fmtMoney(fy29)} (${(fy29 / fy27).toFixed(1)}x)`
                })()} />
          <Tile label="Gross profit %"
                value={fmtPct(L.fy('pnl', 'gp_pct', 'total', 27))}
                sub={`→ ${fmtPct(L.fy('pnl', 'gp_pct', 'total', 29))} by FY29`} />
          <Tile label="Marketing %"
                value={(() => {
                  const m = L.fy('pnl', 'marketing', 'total', 27) ?? 0
                  const r = L.fy('pnl', 'net_revenue_total', 'total', 27) ?? 1
                  return fmtPct(m / r)
                })()}
                sub={`${fmtMoney(L.fy('pnl', 'marketing', 'total', 27))} FY27`} />
          <Tile label="EBITDA FY27"
                value={fmtMoney(L.fy('pnl', 'ebitda', 'total', 27))}
                sub={(() => {
                  const fy29 = L.fy('pnl', 'ebitda', 'total', 29)
                  return `FY29 ${fmtMoney(fy29)}`
                })()}
                accent={(L.fy('pnl', 'ebitda', 'total', 27) ?? 0) < 0 ? 'red' : undefined} />
        </div>
      )}

      {/* SECTION 1 — P&L BREAKDOWN */}
      {snap && monthsForFy.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">1 · P&amp;L breakdown</h2>
              <p className="text-xs text-gray-500 mt-0.5">Total Business · monthly · NZ + AU consolidated</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 1500 }}>
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="text-left px-3 py-2 font-medium w-[180px] sticky left-0 z-20 bg-gray-50">Line item</th>
                  {monthsForFy.map((m) => (
                    <th key={m} className="text-right px-2 py-2 font-medium">{fmtMonth(m)}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium bg-gray-100 border-l border-gray-200">FY27</th>
                  <th className="text-right px-3 py-2 font-medium bg-gray-100">FY28</th>
                  <th className="text-right px-3 py-2 font-medium bg-gray-100">FY29</th>
                </tr>
              </thead>
              <tbody className="text-xs tabular-nums text-gray-700">
                <PnLRow label="Gross revenue"        L={L} months={monthsForFy} metric="gross_revenue_total" emphasis />
                <PnLRow label="— D2C"                L={L} months={monthsForFy} metric="gross_revenue_d2c" indent />
                <PnLRow label="— B2B / retail"       L={L} months={monthsForFy} metric="gross_revenue_b2b" indent />
                <PnLRow label="Net revenue"          L={L} months={monthsForFy} metric="net_revenue_total" emphasis />
                <PnLRow label="Total COGs"           L={L} months={monthsForFy} metric="total_cogs" />
                <PnLRow label="Gross profit"         L={L} months={monthsForFy} metric="gross_profit" emphasisGood />
                <PnLRow label="GP %"                 L={L} months={monthsForFy} metric="gp_pct" pct emphasisGood indent />
                <PnLRow label="Marketing"            L={L} months={monthsForFy} metric="marketing" />
                <PnLRow label="OPEX"                 L={L} months={monthsForFy} metric="opex" />
                <PnLRow label="EBITDA"               L={L} months={monthsForFy} metric="ebitda" emphasisBad bold />
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION 2 — ORDERS BREAKDOWN */}
      {snap && monthsForFy.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold">2 · Orders breakdown</h2>
            <p className="text-xs text-gray-500 mt-0.5">Monthly · D2C + retail · NZ + AU split · grand total. Forecasting view.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 1500 }}>
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="text-left px-3 py-2 font-medium w-[200px] sticky left-0 z-20 bg-gray-50">Channel</th>
                  {monthsForFy.map((m) => (
                    <th key={m} className="text-right px-2 py-2 font-medium">{fmtMonth(m)}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium bg-gray-100 border-l border-gray-200">FY27</th>
                  <th className="text-right px-3 py-2 font-medium bg-gray-100">FY28</th>
                  <th className="text-right px-3 py-2 font-medium bg-gray-100">FY29</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-gray-700">
                {/* D2C */}
                <SectionHeader label="D2C — direct-to-consumer orders" cols={monthsForFy.length} colour="emerald" />
                <D2CRow label="D2C — NZ"   L={L} months={monthsForFy} region="nz" />
                <D2CRow label="D2C — AU"   L={L} months={monthsForFy} region="au" />
                <D2CTotalRow label="D2C TOTAL" L={L} months={monthsForFy} />

                {/* RETAIL */}
                <SectionHeader label="Retail — store orders (active store-months)" cols={monthsForFy.length} colour="blue" />

                {RETAILER_TYPES.map((rt) => (
                  <RetailGroup key={rt.channel} L={L} months={monthsForFy} channel={rt.channel} title={rt.label} />
                ))}

                <RetailTotalRow L={L} months={monthsForFy} />

                {/* GRAND TOTAL */}
                <GrandTotalRow L={L} months={monthsForFy} />
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 text-[11px] text-gray-600">
            Retail &ldquo;orders&rdquo; uses active store-months (1 order per active store per month). D2C uses customer order count.
          </div>
        </section>
      )}

      {/* SECTION 3 — LIVE MRP SNAPSHOT */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold">3 · Live MRP snapshot</h2>
          <p className="text-xs text-gray-500 mt-0.5">Operational reality — pulled from current MRP data</p>
        </div>
        <div className="grid grid-cols-4 gap-0">
          <MrpTile label="Active products" value={fmtCount(productCount ?? 0)} sub="in catalogue" href="/products" />
          <MrpTile label="Open POs" value={(openPoCount ?? 0).toString()} sub={fmtMoneyExact(openPoValue)} href="/purchase-orders" />
          <MrpTile label="Planning anchor" value={monthLabel(firstMonth)} sub="rolling 12-mo view starts here" href="/production" />
          <MrpTile label="Ingredient demand" value="Open" sub="forecast & arrivals tracked" href="/ingredients/demand" />
        </div>
      </section>
    </div>
  )
}

// ============================================================
// Tiles
// ============================================================
function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'red' }) {
  const cls = accent === 'red'
    ? 'p-3 bg-red-50 border border-red-200 rounded-md'
    : 'p-3 bg-white border border-gray-200 rounded-md'
  const lblCls = accent === 'red' ? 'text-red-700' : 'text-gray-500'
  const valCls = accent === 'red' ? 'text-red-800' : 'text-gray-900'
  return (
    <div className={cls}>
      <div className={`text-[11px] uppercase font-semibold ${lblCls}`}>{label}</div>
      <div className={`text-lg font-semibold ${valCls}`}>{value}</div>
      {sub && <div className={`text-[11px] ${lblCls}`}>{sub}</div>}
    </div>
  )
}

function MrpTile({ label, value, sub, href }: { label: string; value: string; sub?: string; href: string }) {
  return (
    <Link href={href} className="p-4 border-r border-gray-100 last:border-r-0 hover:bg-gray-50 block">
      <div className="text-[11px] uppercase font-semibold text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </Link>
  )
}

// ============================================================
// P&L row
// ============================================================
function PnLRow({
  label, L, months, metric,
  pct = false, emphasis = false, emphasisGood = false, emphasisBad = false, indent = false, bold = false,
}: {
  label: string; L: Lookup; months: string[]; metric: string;
  pct?: boolean; emphasis?: boolean; emphasisGood?: boolean; emphasisBad?: boolean; indent?: boolean; bold?: boolean
}) {
  const fmt = pct ? fmtPct : fmtMoney
  const rowCls =
    emphasisGood ? 'border-t border-gray-100 bg-emerald-50' :
    emphasisBad  ? 'border-t-2 border-gray-200 bg-red-50 font-semibold' :
                   'border-t border-gray-100'
  // Sticky cells must have an opaque bg of their own — bg-inherit on a
  // sticky cell does NOT pull the row's background, so we set it explicitly.
  const stickyBg =
    emphasisGood ? 'bg-emerald-50' :
    emphasisBad  ? 'bg-red-50'     :
                   'bg-white'
  const lblCls = (emphasis || bold || emphasisGood || emphasisBad)
    ? `font-medium ${emphasisGood ? 'text-emerald-900' : emphasisBad ? 'text-red-900' : 'text-gray-900'}`
    : (indent ? 'text-gray-600 pl-6' : 'text-gray-700')
  const fyCls = emphasisGood ? 'bg-emerald-100 border-emerald-200' : emphasisBad ? 'bg-red-100 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200'
  return (
    <tr className={rowCls}>
      <td className={`px-3 py-1.5 sticky left-0 z-10 ${stickyBg} ${lblCls}`}>{label}</td>
      {months.map((m) => {
        const v = L.monthly('pnl', metric, 'total', m)
        return <td key={m} className="px-2 py-1.5 text-right">{fmt(v)}</td>
      })}
      <td className={`px-3 py-1.5 text-right font-semibold border-l ${fyCls}`}>{fmt(L.fy('pnl', metric, 'total', 27))}</td>
      <td className={`px-3 py-1.5 text-right ${fyCls}`}>{fmt(L.fy('pnl', metric, 'total', 28))}</td>
      <td className={`px-3 py-1.5 text-right ${fyCls}`}>{fmt(L.fy('pnl', metric, 'total', 29))}</td>
    </tr>
  )
}

// ============================================================
// Orders rows
// ============================================================
function SectionHeader({ label, cols, colour }: { label: string; cols: number; colour: 'emerald' | 'blue' }) {
  const rowBg  = colour === 'emerald' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'
  const cellBg = colour === 'emerald' ? 'bg-emerald-50' : 'bg-blue-50'
  return (
    <tr className={`border-t border-gray-200 ${rowBg}`}>
      <td colSpan={cols + 4} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold sticky left-0 z-10 ${cellBg}`}>{label}</td>
    </tr>
  )
}

function D2CRow({ label, L, months, region }: { label: string; L: Lookup; months: string[]; region: 'nz' | 'au' }) {
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-1.5 pl-8 text-gray-700 sticky left-0 z-10 bg-white hover:bg-gray-50">{label}</td>
      {months.map((m) => (
        <td key={m} className="px-2 py-1.5 text-right">{fmtCount(L.monthly('d2c', 'orders', region, m))}</td>
      ))}
      <td className="px-3 py-1.5 text-right bg-gray-50 border-l border-gray-200">{fmtCount(L.fy('d2c', 'orders', region, 27))}</td>
      <td className="px-3 py-1.5 text-right bg-gray-50">{fmtCount(L.fy('d2c', 'orders', region, 28))}</td>
      <td className="px-3 py-1.5 text-right bg-gray-50">{fmtCount(L.fy('d2c', 'orders', region, 29))}</td>
    </tr>
  )
}

function D2CTotalRow({ label, L, months }: { label: string; L: Lookup; months: string[] }) {
  const sum = (m: string) => (L.monthly('d2c', 'orders', 'nz', m) ?? 0) + (L.monthly('d2c', 'orders', 'au', m) ?? 0)
  const fy = (y: number) => (L.fy('d2c', 'orders', 'nz', y) ?? 0) + (L.fy('d2c', 'orders', 'au', y) ?? 0)
  return (
    <tr className="border-t border-gray-200 bg-emerald-50/30 font-semibold">
      <td className="px-3 py-1.5 text-emerald-900 sticky left-0 z-10 bg-emerald-50">{label}</td>
      {months.map((m) => <td key={m} className="px-2 py-1.5 text-right">{fmtCount(sum(m))}</td>)}
      <td className="px-3 py-1.5 text-right bg-emerald-100 border-l border-emerald-200">{fmtCount(fy(27))}</td>
      <td className="px-3 py-1.5 text-right bg-emerald-100">{fmtCount(fy(28))}</td>
      <td className="px-3 py-1.5 text-right bg-emerald-100">{fmtCount(fy(29))}</td>
    </tr>
  )
}

const RETAILER_TYPES = [
  { channel: 'woolworths', label: 'Woolworths' },
  { channel: 'grocery',    label: 'Grocery' },
  { channel: 'pharmacy',   label: 'Pharmacy' },
  { channel: 'other',      label: 'Other (Baby/P&C)' },
] as const

function RetailGroup({ L, months, channel, title }: { L: Lookup; months: string[]; channel: string; title: string }) {
  const sumMonth = (m: string) => (L.monthly('retail', 'active_stores', 'nz', m, channel) ?? 0) + (L.monthly('retail', 'active_stores', 'au', m, channel) ?? 0)
  // Retail FY total = sum of monthly (store-months)
  const fyTotal = (year: number, region: 'nz' | 'au') => {
    if (year === 27) {
      return months.reduce((s, m) => s + (L.monthly('retail', 'active_stores', region, m, channel) ?? 0), 0)
    }
    // For FY28/29 we don't have month-by-month; estimate as end-of-FY × 12 (rough — better to refine)
    return (L.fy('retail', 'active_stores_end', region, year, channel) ?? 0) * 12
  }
  const fyTotalBoth = (y: number) => fyTotal(y, 'nz') + fyTotal(y, 'au')

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50">
        <td className="px-3 py-1.5 pl-8 text-gray-700 sticky left-0 z-10 bg-white hover:bg-gray-50">{title} — NZ</td>
        {months.map((m) => <td key={m} className="px-2 py-1.5 text-right">{fmtCount(L.monthly('retail', 'active_stores', 'nz', m, channel))}</td>)}
        <td className="px-3 py-1.5 text-right bg-gray-50 border-l border-gray-200">{fmtCount(fyTotal(27, 'nz'))}</td>
        <td className="px-3 py-1.5 text-right bg-gray-50">{fmtCount(fyTotal(28, 'nz'))}</td>
        <td className="px-3 py-1.5 text-right bg-gray-50">{fmtCount(fyTotal(29, 'nz'))}</td>
      </tr>
      <tr className="border-t border-gray-100 hover:bg-gray-50">
        <td className="px-3 py-1.5 pl-8 text-gray-700 sticky left-0 z-10 bg-white hover:bg-gray-50">{title} — AU</td>
        {months.map((m) => <td key={m} className="px-2 py-1.5 text-right">{fmtCount(L.monthly('retail', 'active_stores', 'au', m, channel))}</td>)}
        <td className="px-3 py-1.5 text-right bg-gray-50 border-l border-gray-200">{fmtCount(fyTotal(27, 'au'))}</td>
        <td className="px-3 py-1.5 text-right bg-gray-50">{fmtCount(fyTotal(28, 'au'))}</td>
        <td className="px-3 py-1.5 text-right bg-gray-50">{fmtCount(fyTotal(29, 'au'))}</td>
      </tr>
      <tr className="border-t border-gray-200 bg-blue-50/30 font-semibold">
        <td className="px-3 py-1.5 text-blue-900 pl-6 sticky left-0 z-10 bg-blue-50">{title} TOTAL</td>
        {months.map((m) => <td key={m} className="px-2 py-1.5 text-right">{fmtCount(sumMonth(m))}</td>)}
        <td className="px-3 py-1.5 text-right bg-blue-100 border-l border-blue-200">{fmtCount(fyTotalBoth(27))}</td>
        <td className="px-3 py-1.5 text-right bg-blue-100">{fmtCount(fyTotalBoth(28))}</td>
        <td className="px-3 py-1.5 text-right bg-blue-100">{fmtCount(fyTotalBoth(29))}</td>
      </tr>
    </>
  )
}

function RetailTotalRow({ L, months }: { L: Lookup; months: string[] }) {
  const sumMonth = (m: string) => RETAILER_TYPES.reduce(
    (s, rt) => s + (L.monthly('retail', 'active_stores', 'nz', m, rt.channel) ?? 0) + (L.monthly('retail', 'active_stores', 'au', m, rt.channel) ?? 0),
    0,
  )
  const fyTotal = (year: number) => RETAILER_TYPES.reduce((s, rt) => {
    return s + ['nz', 'au'].reduce((s2, region) => {
      if (year === 27) {
        return s2 + months.reduce((sx, m) => sx + (L.monthly('retail', 'active_stores', region as 'nz' | 'au', m, rt.channel) ?? 0), 0)
      }
      return s2 + (L.fy('retail', 'active_stores_end', region as 'nz' | 'au', year, rt.channel) ?? 0) * 12
    }, 0)
  }, 0)
  return (
    <tr className="border-t-2 border-blue-200 bg-blue-100/60 font-semibold">
      <td className="px-3 py-2 text-blue-900 sticky left-0 z-10 bg-blue-100">RETAIL TOTAL</td>
      {months.map((m) => <td key={m} className="px-2 py-2 text-right">{fmtCount(sumMonth(m))}</td>)}
      <td className="px-3 py-2 text-right bg-blue-200 border-l border-blue-300">{fmtCount(fyTotal(27))}</td>
      <td className="px-3 py-2 text-right bg-blue-200">{fmtCount(fyTotal(28))}</td>
      <td className="px-3 py-2 text-right bg-blue-200">{fmtCount(fyTotal(29))}</td>
    </tr>
  )
}

function GrandTotalRow({ L, months }: { L: Lookup; months: string[] }) {
  const d2c = (m: string) => (L.monthly('d2c', 'orders', 'nz', m) ?? 0) + (L.monthly('d2c', 'orders', 'au', m) ?? 0)
  const retail = (m: string) => RETAILER_TYPES.reduce(
    (s, rt) => s + (L.monthly('retail', 'active_stores', 'nz', m, rt.channel) ?? 0) + (L.monthly('retail', 'active_stores', 'au', m, rt.channel) ?? 0),
    0,
  )
  const monthSum = (m: string) => d2c(m) + retail(m)
  const fyD2c = (y: number) => (L.fy('d2c', 'orders', 'nz', y) ?? 0) + (L.fy('d2c', 'orders', 'au', y) ?? 0)
  const fyRetail = (year: number) => RETAILER_TYPES.reduce((s, rt) => {
    return s + ['nz', 'au'].reduce((s2, region) => {
      if (year === 27) {
        return s2 + months.reduce((sx, m) => sx + (L.monthly('retail', 'active_stores', region as 'nz' | 'au', m, rt.channel) ?? 0), 0)
      }
      return s2 + (L.fy('retail', 'active_stores_end', region as 'nz' | 'au', year, rt.channel) ?? 0) * 12
    }, 0)
  }, 0)
  const fyTotal = (y: number) => fyD2c(y) + fyRetail(y)
  return (
    <tr className="border-t-2 border-gray-400 bg-gray-900 text-white font-semibold">
      <td className="px-3 py-2.5 sticky left-0 z-10 bg-gray-900">GRAND TOTAL ORDERS</td>
      {months.map((m) => <td key={m} className="px-2 py-2.5 text-right">{fmtCount(monthSum(m))}</td>)}
      <td className="px-3 py-2.5 text-right bg-gray-800 border-l border-gray-700">{fmtCount(fyTotal(27))}</td>
      <td className="px-3 py-2.5 text-right bg-gray-800">{fmtCount(fyTotal(28))}</td>
      <td className="px-3 py-2.5 text-right bg-gray-800">{fmtCount(fyTotal(29))}</td>
    </tr>
  )
}
