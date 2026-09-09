import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import {
  ENTITY_LABELS, ENTITY_BADGE, fieldLabel, fmtAmount, fmtPct, pctChange,
  isBaseline, changeTone, type PriceChange, type PriceEntity,
} from '@/lib/price-history'

export const metadata: Metadata = { title: 'Price changes' }

interface PageProps {
  searchParams: { type?: string; days?: string; q?: string; baseline?: string }
}

const DAY_OPTIONS = [
  { value: '30',  label: 'Last 30 days' },
  { value: '90',  label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
]

export default async function PriceChangesPage({ searchParams }: PageProps) {
  const supabase = createClient()

  const type     = (searchParams.type ?? 'all')
  const days     = searchParams.days ?? '90'
  const query    = (searchParams.q ?? '').trim().toLowerCase()
  const showBase = searchParams.baseline === '1'

  let rows = supabase
    .from('price_history')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(1000)
  if (type !== 'all') rows = rows.eq('entity_type', type)
  if (days !== 'all') {
    const since = new Date(Date.now() - Number(days) * 86400_000).toISOString()
    rows = rows.gte('changed_at', since)
  }

  const [{ data: changes }, { data: ingredients }, { data: packaging }, { data: products }, { data: profiles }] =
    await Promise.all([
      rows as unknown as Promise<{ data: PriceChange[] | null }>,
      supabase.from('ingredients').select('id, name') as unknown as Promise<{ data: Array<{ id: string; name: string }> | null }>,
      supabase.from('packaging').select('id, name, sku_code') as unknown as Promise<{ data: Array<{ id: string; name: string; sku_code: string | null }> | null }>,
      supabase.from('products').select('id, name, sku_code') as unknown as Promise<{ data: Array<{ id: string; name: string; sku_code: string | null }> | null }>,
      supabase.from('user_profiles').select('id, full_name') as unknown as Promise<{ data: Array<{ id: string; full_name: string | null }> | null }>,
    ])

  // entity_id points at one of three tables, so build one lookup for all.
  const named = new Map<string, { name: string; sku: string | null; href: string }>()
  for (const i of ingredients ?? []) named.set(i.id, { name: i.name, sku: null, href: `/ingredients/${i.id}` })
  for (const p of packaging ?? [])   named.set(p.id, { name: p.name, sku: p.sku_code, href: `/packaging/${p.id}` })
  for (const p of products ?? [])    named.set(p.id, { name: p.name, sku: p.sku_code, href: `/products/${p.id}` })
  const userName = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? 'Unknown user']))

  const all = changes ?? []
  const visible = all.filter((c) => {
    if (!showBase && isBaseline(c)) return false
    if (!query) return true
    const item = named.get(c.entity_id)
    return `${item?.name ?? ''} ${item?.sku ?? ''} ${fieldLabel(c.field)} ${c.reason ?? ''}`
      .toLowerCase().includes(query)
  })

  const baselineCount = all.filter(isBaseline).length
  const realChanges   = all.length - baselineCount

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ type, days, ...(query ? { q: query } : {}), ...(showBase ? { baseline: '1' } : {}) })
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k)
    return `/price-changes?${p.toString()}`
  }

  return (
    <div className="max-w-[1400px] space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Price changes</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Every change to a price as entered — ingredients, packaging and finished goods. Recorded by the
          database itself, so imports and direct edits are captured as well as changes made on screen.
          Landed costs aren&rsquo;t listed: they move whenever the exchange rate does.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
          {(['all', 'ingredient', 'packaging', 'product'] as const).map((t) => (
            <Link key={t} href={link({ type: t })}
              className={`px-3 py-1.5 font-medium border-l first:border-l-0 border-gray-300 ${
                type === t ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {t === 'all' ? 'All' : ENTITY_LABELS[t as PriceEntity]}
            </Link>
          ))}
        </div>

        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
          {DAY_OPTIONS.map((d) => (
            <Link key={d.value} href={link({ days: d.value })}
              className={`px-3 py-1.5 font-medium border-l first:border-l-0 border-gray-300 ${
                days === d.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {d.label}
            </Link>
          ))}
        </div>

        <form className="flex items-center gap-1.5" action="/price-changes">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="days" value={days} />
          {showBase && <input type="hidden" name="baseline" value="1" />}
          <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search item or reason…"
            className="border border-gray-300 rounded px-2 py-1.5 w-56" />
        </form>

        <Link href={link({ baseline: showBase ? '' : '1' })}
          className={`px-3 py-1.5 rounded-md border font-medium ${
            showBase ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
          {showBase ? 'Hiding nothing' : `Show opening prices (${baselineCount})`}
        </Link>

        <span className="ml-auto text-gray-500">
          {visible.length} of {realChanges} change{realChanges === 1 ? '' : 's'}
        </span>
      </div>

      {/* Log */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[1000px]">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-4 py-2.5 w-[105px]">Date</th>
              <th className="text-left px-3 py-2.5 w-[110px]">Type</th>
              <th className="text-left px-3 py-2.5">Item</th>
              <th className="text-left px-3 py-2.5 w-[130px]">What changed</th>
              <th className="text-right px-3 py-2.5 w-[95px]">From</th>
              <th className="text-right px-3 py-2.5 w-[95px]">To</th>
              <th className="text-right px-3 py-2.5 w-[75px]">Change</th>
              <th className="text-left px-3 py-2.5 w-[180px]">Reason</th>
              <th className="text-left px-4 py-2.5 w-[130px]">Who</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 tabular-nums">
            {visible.map((c) => {
              const item = named.get(c.entity_id)
              const pct  = pctChange(c)
              return (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDate(c.changed_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${ENTITY_BADGE[c.entity_type]}`}>
                      {ENTITY_LABELS[c.entity_type]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {item ? (
                      <Link href={item.href} className="hover:underline">
                        {item.name}
                        {item.sku && <span className="font-mono text-gray-400 ml-1.5">{item.sku}</span>}
                      </Link>
                    ) : <span className="text-gray-400 italic">deleted item</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{fieldLabel(c.field)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {isBaseline(c) ? <span className="text-gray-300">—</span> : c.old_text ?? fmtAmount(c.old_value, c.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{c.new_text ?? fmtAmount(c.new_value, c.currency)}</td>
                  <td className={`px-3 py-2 text-right ${changeTone(c.field, pct)}`}>
                    {isBaseline(c) ? <span className="text-gray-400 text-[10px]">opening</span> : fmtPct(pct)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {c.reason ?? <span className="text-gray-300 italic">not given</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {c.changed_by ? (userName.get(c.changed_by) ?? 'Unknown user') : <span className="text-gray-400">System</span>}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                  No price changes match these filters.
                  {!showBase && baselineCount > 0 && (
                    <> {baselineCount} opening price{baselineCount === 1 ? ' is' : 's are'} hidden — <Link href={link({ baseline: '1' })} className="text-blue-600 hover:underline">show them</Link>.</>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
