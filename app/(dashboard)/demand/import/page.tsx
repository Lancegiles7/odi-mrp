'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { commitDemandImport, latestDemandMonth, type DemandImportPayload, type DemandImportResult } from './actions'
import type { DemandChannel } from '@/lib/types/database.types'

type Stage = 'upload' | 'preview' | 'result'

interface ParsedRow {
  sheet_group: string
  product_name: string
  channel: DemandChannel
  year_month: string
  units: number
}

/**
 * The Units sheet layout we parse (based on the actual FY26 Budget workbook):
 *   - Month labels on row 3 from column E onwards (Apr-26 → Mar-29 in the
 *     current workbook: FY27, FY28, FY29). Every dated column is read; the
 *     preview lets you pick which financial years to import.
 *   - 4 channel sections at fixed starting rows:
 *       Ecomm NZ   rows 76–145
 *       Retail NZ  rows 148–217
 *       Ecomm AU   rows 220–289
 *       Retail AU  rows 292–361
 *   - Inside each section, subgroup headers live in column B, individual
 *     product rows in column C, and monthly units from column E.
 */
const SECTIONS: Array<{ channel: DemandChannel; startRow: number; endRow: number }> = [
  { channel: 'ecomm_nz',  startRow: 76,  endRow: 145 },
  { channel: 'retail_nz', startRow: 148, endRow: 217 },
  { channel: 'ecomm_au',  startRow: 220, endRow: 289 },
  { channel: 'retail_au', startRow: 292, endRow: 361 },
]

const MONTH_COL_START = 5   // E
const MONTH_ROW       = 3
const MAX_MONTHS      = 60  // safety cap on header columns scanned

/** Odi FY runs Apr–Mar and is named by the year it ends: 2027-06-01 → 'FY28'. */
function fyOf(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `FY${String(m >= 4 ? y + 1 : y).slice(2)}`
}

function colIndexToKey(colIdx: number): string {
  // 1 → A, 2 → B, …, 27 → AA
  let n = colIdx
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function yearMonthFromDate(v: unknown): string | null {
  // SheetJS with cellDates:true creates Date objects using LOCAL time
  // constructors. In timezones ahead of UTC (e.g. NZ, UTC+12/13) using
  // UTC getters on such a Date returns the previous day — and therefore
  // the previous month at month boundaries, shifting "April 1" to
  // "March 31". We use local getters to match SheetJS's intent.
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  }
  if (typeof v === 'string') {
    const parsed = new Date(v)
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear()
      const m = String(parsed.getMonth() + 1).padStart(2, '0')
      return `${y}-${m}-01`
    }
  }
  if (typeof v === 'number') {
    // Excel serial date: 45748 = April 1, 2026. Anchor in local time to
    // stay consistent with cellDates:true producing local Date objects.
    const d = new Date(1899, 11, 30 + v)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  }
  return null
}

export default function DemandImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<DemandImportResult | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [selectedFys, setSelectedFys] = useState<Set<string>>(new Set())

  async function handleFile(file: File) {
    setParseError(null)
    setRows([])
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'units')
      if (!sheetName) {
        setParseError('Could not find a sheet named "Units" in the workbook.')
        return
      }
      const ws = wb.Sheets[sheetName]

      // The Units tab uses end-of-month dates as column markers, but the
      // headers are read by COLUMN POSITION (E=month 0, F=month 1, …).
      // Some cells (e.g. "30 Apr" for May) are off by a day, so we trust
      // only E3's date as the anchor and derive the rest by incrementing.
      const anchorRef = colIndexToKey(MONTH_COL_START) + MONTH_ROW
      const anchorKey = yearMonthFromDate(ws[anchorRef]?.v)
      if (!anchorKey) {
        setParseError(`Could not read first month at ${anchorRef}. Expected a date on row 3.`)
        return
      }
      const [anchorY, anchorM] = anchorKey.split('-').map(Number)
      // Count dated header columns from E onwards — the budget carries
      // several years, not just the first 12 months.
      let monthCount = 0
      while (monthCount < MAX_MONTHS && yearMonthFromDate(ws[colIndexToKey(MONTH_COL_START + monthCount) + MONTH_ROW]?.v)) monthCount++
      const months: string[] = []
      for (let c = 0; c < monthCount; c++) {
        const d = new Date(anchorY, anchorM - 1 + c, 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        months.push(`${y}-${m}-01`)
      }

      const parsed: ParsedRow[] = []
      for (const section of SECTIONS) {
        let currentGroup = ''
        for (let r = section.startRow; r <= section.endRow; r++) {
          const bRef = 'B' + r
          const cRef = 'C' + r
          const bVal = ws[bRef]?.v
          const cVal = ws[cRef]?.v

          // Subgroup header in column B (Sachets, Tubs, …)
          if (typeof bVal === 'string' && bVal.trim() && !cVal) {
            const lower = bVal.trim().toLowerCase()
            if (lower !== 'total' && lower !== 'orders') {
              currentGroup = bVal.trim()
            }
            continue
          }
          // Product row — column C has the name
          if (typeof cVal !== 'string' || !cVal.trim()) continue

          const productName = cVal.trim()
          for (let mIdx = 0; mIdx < months.length; mIdx++) {
            const ref = colIndexToKey(MONTH_COL_START + mIdx) + r
            const val = ws[ref]?.v
            const num = typeof val === 'number' ? val : Number(val ?? 0)
            if (!Number.isFinite(num) || num <= 0) continue
            parsed.push({
              sheet_group:  currentGroup,
              product_name: productName,
              channel:      section.channel,
              year_month:   months[mIdx],
              units:        Math.round(num),
            })
          }
        }
      }

      if (parsed.length === 0) {
        setParseError('Parsed the sheet but found no non-zero demand rows.')
        return
      }

      // Pre-tick only the years after the demand already loaded, so adding
      // FY28 doesn't reload (and overwrite) FY27. Any year can be ticked.
      const latest = await latestDemandMonth()
      const fys = Array.from(new Set(parsed.map((r) => fyOf(r.year_month))))
      const fresh = fys.filter((fy) => !latest || parsed.some((r) => fyOf(r.year_month) === fy && r.year_month > latest)
        && !parsed.some((r) => fyOf(r.year_month) === fy && r.year_month <= latest))
      setSelectedFys(new Set(fresh.length ? fresh : fys))
      setRows(parsed)
      setStage('preview')
    } catch (e) {
      console.error(e)
      setParseError('Could not read the file. Please check it is a valid XLSX.')
    }
  }

  async function handleImport() {
    setImporting(true)
    try {
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      const source = `import:${y}-${m}-${d}`

      const payload: DemandImportPayload = { source, rows: selectedRows }
      const res = await commitDemandImport(payload)
      setResult(res)
      setStage('result')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStage('upload')
    setRows([])
    setParseError(null)
    setResult(null)
    setFileName('')
    setSelectedFys(new Set())
    if (fileRef.current) fileRef.current.value = ''
  }

  // Per-FY summary for the year picker, then only the ticked years flow on.
  const fySummary = new Map<string, { cells: number; units: number; first: string; last: string }>()
  for (const r of rows) {
    const fy = fyOf(r.year_month)
    const e = fySummary.get(fy) ?? { cells: 0, units: 0, first: r.year_month, last: r.year_month }
    e.cells++; e.units += r.units
    if (r.year_month < e.first) e.first = r.year_month
    if (r.year_month > e.last) e.last = r.year_month
    fySummary.set(fy, e)
  }
  const selectedRows = rows.filter((r) => selectedFys.has(fyOf(r.year_month)))
  function toggleFy(fy: string) {
    setSelectedFys((prev) => {
      const next = new Set(prev)
      if (next.has(fy)) next.delete(fy); else next.add(fy)
      return next
    })
  }

  // Aggregate preview by product
  const byProduct = new Map<string, { group: string; channels: Set<string>; total: number }>()
  for (const r of selectedRows) {
    const key = r.product_name
    if (!byProduct.has(key)) byProduct.set(key, { group: r.sheet_group, channels: new Set(), total: 0 })
    const p = byProduct.get(key)!
    p.channels.add(r.channel)
    p.total += r.units
  }

  return (
    <div className="max-w-5xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/demand" className="hover:text-gray-900">Demand</Link>
        <span>/</span>
        <span className="text-gray-900">Import</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Import demand from XLSX</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reads the &ldquo;Units&rdquo; tab · parses 4 channels × every month in the sheet · pick which financial years · previews before committing · preserves manually-edited cells.
          </p>
        </div>
      </div>

      {stage === 'upload' && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center bg-white">
          <p className="text-sm text-gray-600 mb-3">
            Select your Budget workbook (must contain a &ldquo;Units&rdquo; tab)
          </p>
          <label className="cursor-pointer inline-block px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800">
            Choose XLSX
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
          {parseError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {parseError}
            </div>
          )}
        </div>
      )}

      {stage === 'preview' && (
        <div className="space-y-5">
          <div className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <div className="flex-1">
              <div className="font-medium">{fileName}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {selectedRows.length.toLocaleString()} non-zero cells across {byProduct.size} products
              </div>
            </div>
            <button onClick={reset} className="text-xs text-gray-600 underline">Choose different file</button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-medium text-gray-700 mb-2">Financial years to import</div>
            <div className="flex flex-wrap gap-2">
              {Array.from(fySummary.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([fy, info]) => {
                const on = selectedFys.has(fy)
                return (
                  <label key={fy} className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleFy(fy)} />
                    <span className="font-semibold">{on ? '✓ ' : ''}{fy}</span>
                    <span className={`text-xs ${on ? 'text-gray-300' : 'text-gray-500'}`}>
                      {monthShort(info.first)}–{monthShort(info.last)} · {info.units.toLocaleString()} units
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Years you leave unticked aren&apos;t touched. Ticking a year that&apos;s already loaded replaces its imported figures (edited cells are still kept).
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 text-xs text-gray-600 bg-gray-50">
              Preview — unmatched product names will be created as <span className="font-medium">inactive placeholders</span> (you can activate them later by adding a BOM).
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
                  <th className="text-left font-medium px-4 py-2">Product</th>
                  <th className="text-left font-medium px-4 py-2">Sheet group</th>
                  <th className="text-left font-medium px-4 py-2">Channels</th>
                  <th className="text-right font-medium px-4 py-2">Total units (ticked years)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from(byProduct.entries())
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([name, info]) => (
                    <tr key={name}>
                      <td className="px-4 py-1.5">{name}</td>
                      <td className="px-4 py-1.5 text-gray-500">{info.group}</td>
                      <td className="px-4 py-1.5 text-gray-500 text-xs">
                        {Array.from(info.channels).join(', ')}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{info.total.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
            <span>Re-import behaviour: cells you&apos;ve manually edited (amber on the demand page) are skipped. Pipefill is never touched by import.</span>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selectedRows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Import ${selectedRows.length.toLocaleString()} cells`}
            </button>
          </div>
        </div>
      )}

      {stage === 'result' && result && (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Matched products"    value={result.matched_products} />
            <Stat label="New placeholders"    value={result.created_placeholders} />
            <Stat label="Cells imported"      value={result.cells_inserted} accent="green" />
            <Stat label="Skipped (edited)"    value={result.cells_skipped_edited} accent="amber" />
          </div>

          {result.errors.length > 0 && (() => {
            const warnings = result.errors.filter((e) => e.product === '(dedupe)')
            const blockers = result.errors.filter((e) => e.product !== '(dedupe)')
            return (
              <>
                {warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
                    <p className="font-medium">Warning</p>
                    <ul className="list-disc ml-5 mt-1">
                      {warnings.map((e, i) => <li key={i}>{e.error}</li>)}
                    </ul>
                    <p className="text-xs mt-2 text-amber-700">These cells are still imported — duplicates are collapsed to the last value seen in the sheet.</p>
                  </div>
                )}
                {blockers.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
                    <p className="font-medium">{blockers.length} error{blockers.length === 1 ? '' : 's'}:</p>
                    <ul className="list-disc ml-5 mt-1">
                      {blockers.slice(0, 8).map((e, i) => (
                        <li key={i}><span className="font-mono text-xs">{e.product}</span> — {e.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )
          })()}

          <div className="flex gap-2">
            <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Import another
            </button>
            <Link href="/demand" className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800">
              View demand →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function monthShort(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'green' | 'amber' }) {
  const cls = accent === 'green'
    ? 'p-3 bg-green-50 border border-green-200 rounded-md text-center'
    : accent === 'amber'
      ? 'p-3 bg-amber-50 border border-amber-200 rounded-md text-center'
      : 'p-3 bg-gray-50 border border-gray-200 rounded-md text-center'
  const lblCls = accent === 'green' ? 'text-green-700' : accent === 'amber' ? 'text-amber-700' : 'text-gray-600'
  const valCls = accent === 'green' ? 'text-green-800' : accent === 'amber' ? 'text-amber-800' : 'text-gray-900'
  return (
    <div className={cls}>
      <div className={`text-[11px] uppercase font-semibold ${lblCls}`}>{label}</div>
      <div className={`text-2xl font-semibold ${valCls}`}>{value.toLocaleString()}</div>
    </div>
  )
}
