'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateDemandCell } from '@/app/(dashboard)/demand/actions'
import type { DemandChannel } from '@/lib/types/database.types'
import { DEMAND_CHANNELS, NZ_CHANNEL_SET, AUS_CHANNEL_SET, type ChannelCountry } from '@/lib/constants'
import { monthLabel } from '@/lib/demand'

export interface DemandCell {
  units: number
  edited: boolean
}

/** Map: monthKey → channel → {units, edited}. */
export type DemandProductData = Record<string, Partial<Record<DemandChannel, DemandCell>>>

/** Page-level filter: 'all' shows both countries with a grand total at the
 *  bottom; 'NZ' / 'AUS' shows only one country's channels and total. */
export type CountryFilter = 'all' | ChannelCountry

interface Props {
  productId: string
  productName: string
  skuCode: string
  months: string[]
  initialData: DemandProductData
  collapsed?: boolean
  /** Country filter — driven by the URL on the page. Defaults to 'all'. */
  countryFilter?: CountryFilter
}

const NZ_CHANNELS_ORDERED  = DEMAND_CHANNELS.filter((c) => c.country === 'NZ')
const AUS_CHANNELS_ORDERED = DEMAND_CHANNELS.filter((c) => c.country === 'AUS')

function matchesFilter(channel: string, filter: CountryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'NZ')  return NZ_CHANNEL_SET.has(channel)
  return AUS_CHANNEL_SET.has(channel)
}

export function DemandProductTable({
  productId, productName, skuCode, months, initialData, collapsed = true,
  countryFilter = 'all',
}: Props) {
  const [open, setOpen] = useState(!collapsed)
  const [data, setData] = useState<DemandProductData>(initialData)
  const [saving, setSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Year total respects the country filter so the header number lines up
  // with what's actually shown in the table below.
  const yearTotal = useMemo(() => {
    let s = 0
    for (const m of months) {
      const byCh = data[m] ?? {}
      for (const [ch, v] of Object.entries(byCh)) {
        if (!matchesFilter(ch, countryFilter)) continue
        s += v?.units ?? 0
      }
    }
    return s
  }, [data, months, countryFilter])

  function cellValue(month: string, channel: DemandChannel): DemandCell {
    return data[month]?.[channel] ?? { units: 0, edited: false }
  }

  function countryTotal(month: string, country: ChannelCountry): number {
    const byCh = data[month] ?? {}
    const channels = country === 'NZ' ? NZ_CHANNELS_ORDERED : AUS_CHANNELS_ORDERED
    let s = 0
    for (const c of channels) s += byCh[c.value as DemandChannel]?.units ?? 0
    return s
  }

  function grandTotal(month: string): number {
    const byCh = data[month] ?? {}
    let s = 0
    for (const v of Object.values(byCh)) s += v?.units ?? 0
    return s
  }

  function setCell(month: string, channel: DemandChannel, units: number) {
    setData((prev) => {
      const next = { ...prev }
      const byCh = { ...(next[month] ?? {}) }
      byCh[channel] = { units, edited: true }
      next[month] = byCh
      return next
    })
  }

  function commit(month: string, channel: DemandChannel, raw: string) {
    const units = raw.trim() === '' ? 0 : Math.max(0, Math.round(Number(raw)))
    if (!Number.isFinite(units)) return
    setCell(month, channel, units)
    setError(null)
    setSaving(async () => {
      const res = await updateDemandCell(productId, month, channel, units)
      if (!res.ok) setError(res.error ?? 'Save failed')
    })
  }

  /** Renders one editable channel row. Pipefill rows get a subtle blue
   *  tint to mark them as manually-entered (vs imported from the XLSX). */
  function renderChannelRow(ch: typeof DEMAND_CHANNELS[number]) {
    return (
      <tr
        key={ch.value}
        className={`border-t border-gray-50 ${ch.isPipefill ? 'bg-blue-50/40' : ''}`}
      >
        <td className={`px-4 py-1.5 ${ch.isPipefill ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
          {ch.label}
        </td>
        {months.map((m) => {
          const cell = cellValue(m, ch.value as DemandChannel)
          return (
            <td key={m} className="px-1 py-1">
              <input
                type="number"
                min={0}
                defaultValue={cell.units || ''}
                onBlur={(e) => commit(m, ch.value as DemandChannel, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                placeholder="0"
                className={`w-full text-right px-1.5 py-1 text-xs tabular-nums border rounded ${
                  cell.edited
                    ? 'bg-amber-50 border-amber-300'
                    : ch.isPipefill
                      ? 'bg-white border-blue-200'
                      : 'bg-white border-transparent hover:border-gray-200 focus:border-gray-400'
                }`}
              />
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs">{open ? '▼' : '▶'}</span>
          <span className="font-mono text-xs text-gray-600">{skuCode}</span>
          <Link
            href={`/products/${productId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-sm hover:underline"
          >
            {productName}
          </Link>
        </div>
        <div className="text-xs text-gray-500">
          Yr total <span className="font-semibold text-gray-900 tabular-nums">{yearTotal.toLocaleString()}</span>
          {saving && <span className="ml-2 text-gray-400">saving…</span>}
        </div>
      </button>

      {open && (
        <>
          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{error}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
                  <th className="text-left font-medium px-4 py-1.5 w-[140px]">Channel</th>
                  {months.map((m) => (
                    <th key={m} className="text-right font-medium px-2 py-1.5 min-w-[64px]">{monthLabel(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-xs tabular-nums">
                {/* NZ block — shown unless filtered to AUS only */}
                {countryFilter !== 'AUS' && (
                  <>
                    <tr className="bg-emerald-50/40 border-t border-emerald-100">
                      <td colSpan={1 + months.length} className="px-4 py-1 text-left text-[10px] uppercase tracking-wider font-semibold text-emerald-800 border-l-2 border-emerald-700">
                        New Zealand
                      </td>
                    </tr>
                    {NZ_CHANNELS_ORDERED.map((ch) => renderChannelRow(ch))}
                    <tr className="bg-emerald-50 border-t border-emerald-200 font-semibold text-emerald-900">
                      <td className="px-4 py-1.5">NZ Total</td>
                      {months.map((m) => (
                        <td key={m} className="px-2 py-1.5 text-right tabular-nums">
                          {countryTotal(m, 'NZ').toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* AUS block — shown unless filtered to NZ only */}
                {countryFilter !== 'NZ' && (
                  <>
                    <tr className="bg-amber-50/40 border-t border-amber-100">
                      <td colSpan={1 + months.length} className="px-4 py-1 text-left text-[10px] uppercase tracking-wider font-semibold text-amber-900 border-l-2 border-amber-600">
                        Australia
                      </td>
                    </tr>
                    {AUS_CHANNELS_ORDERED.map((ch) => renderChannelRow(ch))}
                    <tr className="bg-amber-50 border-t border-amber-200 font-semibold text-amber-900">
                      <td className="px-4 py-1.5">AUS Total</td>
                      {months.map((m) => (
                        <td key={m} className="px-2 py-1.5 text-right tabular-nums">
                          {countryTotal(m, 'AUS').toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* Grand Total — only meaningful when both countries are shown */}
                {countryFilter === 'all' && (
                  <tr className="border-t-2 border-gray-300 bg-gray-900 text-white font-semibold">
                    <td className="px-4 py-2 text-[11px] uppercase tracking-wider">Grand Total</td>
                    {months.map((m) => (
                      <td key={m} className="px-2 py-2 text-right tabular-nums">
                        {grandTotal(m).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
