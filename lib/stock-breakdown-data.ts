/**
 * Breakdown — per-product × channel sales, one month at a time.
 *
 * Reads the final monthly actuals (product_actuals) + write-offs for closed
 * months, and the provisional interim_sales snapshot for the current open month
 * (shown as "MTD"). Units only for v1 — a $ view needs per-channel wholesale
 * pricing (retail sells below RRP), which the aggregate Budget vs Actual models
 * but isn't held per SKU yet.
 */
import { createClient } from '@/lib/supabase/server'

export interface BreakdownRow {
  product_id: string
  sku: string
  name: string
  group: string | null
  nz_d2c: number
  au_d2c: number
  nz_retail: number
  au_retail: number
  nz_samples: number
  au_samples: number
  expo_nz: number
  expo_au: number
  writeoff: number
}
export interface BreakdownData {
  months: { key: string; label: string; mtd: boolean }[]
  byMonth: Record<string, BreakdownRow[]>
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const norm = (d: string) => d.slice(0, 7) + '-01'
const monthLabel = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const mktIsAu = (m: string | null) => (m ?? 'NZ').toUpperCase() === 'AU'

const SALES_CHANNELS = ['nz_d2c', 'au_d2c', 'nz_retail', 'au_retail', 'nz_samples', 'au_samples'] as const
type Chan = typeof SALES_CHANNELS[number]
const emptyRow = (): Record<Chan, number> & { writeoff: number; expo_nz: number; expo_au: number } =>
  ({ nz_d2c: 0, au_d2c: 0, nz_retail: 0, au_retail: 0, nz_samples: 0, au_samples: 0, writeoff: 0, expo_nz: 0, expo_au: 0 })

export async function loadStockBreakdown(): Promise<BreakdownData> {
  const supabase = createClient()

  const [{ data: products }, { data: actuals }, { data: writeoffs }, { data: interim }, { data: expo }] = await Promise.all([
    supabase.from('products').select('id, sku_code, name, product_type').is('deleted_at', null).eq('is_active', true) as unknown as
      Promise<{ data: Array<{ id: string; sku_code: string; name: string; product_type: string | null }> | null }>,
    supabase.from('product_actuals').select('product_id, year_month, units, channel') as unknown as
      Promise<{ data: Array<{ product_id: string; year_month: string; units: number; channel: string | null }> | null }>,
    supabase.from('product_writeoffs').select('product_id, year_month, units, market') as unknown as
      Promise<{ data: Array<{ product_id: string; year_month: string; units: number; market: string | null }> | null }>,
    supabase.from('interim_sales').select('product_id, channel, units, period_start, as_of_date').order('as_of_date', { ascending: false }) as unknown as
      Promise<{ data: Array<{ product_id: string; channel: string; units: number; period_start: string; as_of_date: string }> | null }>,
    supabase.from('expo_sales').select('product_id, market, year_month, units') as unknown as
      Promise<{ data: Array<{ product_id: string; market: string; year_month: string; units: number }> | null }>,
  ])

  const prodById = new Map((products ?? []).map((p) => [p.id, p]))

  // month -> product -> tallies
  const months = new Map<string, Map<string, ReturnType<typeof emptyRow>>>()
  const bump = (month: string, pid: string, patch: (r: ReturnType<typeof emptyRow>) => void) => {
    if (!prodById.has(pid)) return
    if (!months.has(month)) months.set(month, new Map())
    const pm = months.get(month)!
    if (!pm.has(pid)) pm.set(pid, emptyRow())
    patch(pm.get(pid)!)
  }

  for (const a of actuals ?? []) {
    const ch = (a.channel ?? '') as Chan
    if (!SALES_CHANNELS.includes(ch)) continue
    bump(norm(a.year_month), a.product_id, (r) => { r[ch] += Number(a.units) })
  }
  for (const w of writeoffs ?? []) {
    bump(norm(w.year_month), w.product_id, (r) => { r.writeoff += Number(w.units) })
  }
  for (const e of expo ?? []) {
    const au = mktIsAu(e.market)
    bump(norm(e.year_month), e.product_id, (r) => { if (au) r.expo_au += Number(e.units); else r.expo_nz += Number(e.units) })
  }

  // Current open month from the latest interim snapshot (shown as MTD).
  const period = interim?.[0]?.period_start ?? null
  const asOf = interim?.[0]?.as_of_date ?? null
  const mtdKey = period ? norm(period) : null
  if (mtdKey && asOf) {
    for (const r of interim ?? []) {
      if (r.period_start !== period || r.as_of_date !== asOf) continue
      const ch = r.channel as Chan
      if (!SALES_CHANNELS.includes(ch)) continue
      bump(mtdKey, r.product_id, (row) => { row[ch] += Number(r.units) })
    }
  }

  // Assemble, newest month first; MTD month pinned on top.
  const monthKeys = Array.from(months.keys()).sort((a, b) => b.localeCompare(a))
  const byMonth: Record<string, BreakdownRow[]> = {}
  for (const m of monthKeys) {
    const pm = months.get(m)!
    const rows: BreakdownRow[] = []
    for (const [pid, t] of Array.from(pm.entries())) {
      const p = prodById.get(pid)!
      rows.push({ product_id: pid, sku: p.sku_code, name: p.name, group: p.product_type, ...t })
    }
    rows.sort((a, b) => (b.nz_d2c + b.au_d2c + b.nz_retail + b.au_retail) - (a.nz_d2c + a.au_d2c + a.nz_retail + a.au_retail))
    byMonth[m] = rows
  }
  const monthList = monthKeys.map((k) => ({ key: k, label: monthLabel(k) + (k === mtdKey ? ' · MTD' : ''), mtd: k === mtdKey }))

  return { months: monthList, byMonth }
}
