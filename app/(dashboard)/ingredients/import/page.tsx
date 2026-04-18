'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { importIngredients, type ImportRow, type ImportResult } from '../actions'

// ============================================================
// Column mapping
// Source spreadsheet headers → internal field names
// ============================================================
const COLUMN_MAP: Record<string, keyof ImportRow> = {
  'SKU CODE':           'sku_code',
  'INGREDIENT':         'name',
  'CONFIRMED SUPPLIER': 'confirmed_supplier',
  'LEAD TIME':          'lead_time',
  'STATUS':             'status',
  'PRICE':              'price',
  'PRICE ':             'price',  // trailing space variant from the source file
  'FREIGHT':            'freight',
  'TOTAL LOADED $':     'total_loaded_cost',
  'UNIT_OF_MEASURE':    'unit_of_measure',
  'UNIT OF MEASURE':    'unit_of_measure',
}

type ParsedRow = ImportRow & { _rowNum: number; _errors: string[] }

// ============================================================
// CSV parser — handles quoted fields and commas inside quotes
// ============================================================
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let cur = ''
  let inQuote = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      row.push(cur); cur = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      rows.push(row); row = []
    } else {
      cur += ch
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

function normaliseHeader(h: string): string {
  return h.trim().toUpperCase().replace(/\s+/g, ' ')
}

function parseNumericCell(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? null : n
}

function parseRows(raw: string[][]): ParsedRow[] {
  if (raw.length < 2) return []

  const headers = raw[0].map(normaliseHeader)
  const fieldForCol: Array<keyof ImportRow | null> = headers.map(
    (h) => COLUMN_MAP[h] ?? null
  )

  return raw.slice(1).map((cells, idx) => {
    const row: Partial<ImportRow> = {}
    cells.forEach((val, ci) => {
      const field = fieldForCol[ci]
      if (!field) return
      if (field === 'price' || field === 'freight' || field === 'total_loaded_cost') {
        row[field] = parseNumericCell(val)
      } else {
        (row as Record<string, unknown>)[field] = val?.trim() || undefined
      }
    })

    const errors: string[] = []
    if (!row.sku_code?.trim()) errors.push('Missing SKU Code')
    if (!row.name?.trim()) errors.push('Missing Ingredient name')

    return { ...row, _rowNum: idx + 2, _errors: errors } as ParsedRow
  }).filter((r) => r.sku_code || r.name) // skip fully blank rows
}

// ============================================================
// XLSX parsing — loaded lazily via dynamic import
// ============================================================
async function parseXLSX(buffer: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })
  return data as string[][]
}

// ============================================================
// Template download — generates a CSV with the correct headers
// ============================================================
function downloadTemplate() {
  const headers = ['SKU CODE', 'Ingredient', 'Confirmed Supplier', 'lead time', 'Status', 'Price', 'Freight', 'Total loaded $']
  const example = ['ING-ORG-EXAMPLE', 'Example Ingredient', 'Example Supplier', '2 weeks', 'confirmed', '10.00', '1.50', '11.50']
  const csv = [headers, example].map((row) => row.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ingredients-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// Component
// ============================================================
type Stage = 'upload' | 'preview' | 'result'

export default function ImportIngredientsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const validRows = rows.filter((r) => r._errors.length === 0)
  const invalidRows = rows.filter((r) => r._errors.length > 0)

  // ── File selected ──────────────────────────────────────────
  async function handleFile(file: File) {
    setParseError(null)
    setRows([])
    try {
      let raw: string[][]
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text()
        raw = parseCSV(text)
      } else {
        const buffer = await file.arrayBuffer()
        raw = await parseXLSX(buffer)
      }
      const parsed = parseRows(raw)
      if (parsed.length === 0) {
        setParseError('No data rows found. Check that your file uses the correct headers.')
        return
      }
      setRows(parsed)
      setStage('preview')
    } catch (e) {
      setParseError('Could not parse the file. Please check it is a valid CSV or XLSX.')
      console.error(e)
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Import ─────────────────────────────────────────────────
  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const importData: ImportRow[] = validRows.map(({ _rowNum: _, _errors: __, ...r }) => r)
      const res = await importIngredients(importData)
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
    if (fileRef.current) fileRef.current.value = ''
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/ingredients" className="hover:text-gray-900">Ingredients</Link>
        <span>/</span>
        <span className="text-gray-900">Import</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import Ingredients</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV or XLSX file. Existing ingredients are updated by SKU Code; new ones are created.
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
        >
          Download template
        </button>
      </div>

      {/* ── STAGE: UPLOAD ─────────────────────────────────── */}
      {stage === 'upload' && (
        <div
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors"
        >
          <p className="text-sm text-gray-600 mb-3">
            Drag and drop a CSV or XLSX file here, or
          </p>
          <label className="cursor-pointer inline-block px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors">
            Choose file
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
          <p className="text-xs text-gray-400 mt-3">
            Accepted formats: CSV, XLSX
          </p>

          {parseError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* ── STAGE: PREVIEW ────────────────────────────────── */}
      {stage === 'preview' && (
        <div>
          {/* Summary banner */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4 text-sm">
            <span>
              <span className="font-semibold text-gray-900">{rows.length}</span>
              <span className="text-gray-500"> rows parsed</span>
            </span>
            <span className="text-gray-300">|</span>
            <span>
              <span className="font-semibold text-green-700">{validRows.length}</span>
              <span className="text-gray-500"> will be imported</span>
            </span>
            {invalidRows.length > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <span>
                  <span className="font-semibold text-red-600">{invalidRows.length}</span>
                  <span className="text-gray-500"> have errors and will be skipped</span>
                </span>
              </>
            )}
          </div>

          {/* Preview table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Row</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">SKU Code</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Ingredient</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Supplier</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Lead Time</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Status</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600">Price</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600">Freight</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600">Total</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => {
                    const hasError = row._errors.length > 0
                    return (
                      <tr
                        key={row._rowNum}
                        className={hasError ? 'bg-red-50' : 'hover:bg-gray-50'}
                      >
                        <td className="px-3 py-2 text-gray-400">{row._rowNum}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{row.sku_code || <span className="text-red-400">—</span>}</td>
                        <td className="px-3 py-2 text-gray-900">{row.name || <span className="text-red-400">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{row.confirmed_supplier || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.lead_time || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.status || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-900 tabular-nums">
                          {row.price !== null && row.price !== undefined ? `$${Number(row.price).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 tabular-nums">
                          {row.freight !== null && row.freight !== undefined ? `$${Number(row.freight).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                          {row.total_loaded_cost !== null && row.total_loaded_cost !== undefined ? `$${Number(row.total_loaded_cost).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-red-600">
                          {hasError ? row._errors.join(', ') : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Choose a different file
            </button>

            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing
                ? 'Importing…'
                : `Import ${validRows.length} ingredient${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── STAGE: RESULT ─────────────────────────────────── */}
      {stage === 'result' && result && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-5 text-center">
              <p className="text-3xl font-semibold text-green-700">{result.created}</p>
              <p className="text-sm text-green-600 mt-1">Created</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-center">
              <p className="text-3xl font-semibold text-blue-700">{result.updated}</p>
              <p className="text-sm text-blue-600 mt-1">Updated</p>
            </div>
            <div className={`rounded-lg p-5 text-center border ${result.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-3xl font-semibold ${result.failed > 0 ? 'text-red-700' : 'text-gray-400'}`}>{result.failed}</p>
              <p className={`text-sm mt-1 ${result.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>Failed</p>
            </div>
          </div>

          {/* Row-level errors */}
          {result.errors.length > 0 && (
            <div className="bg-white border border-red-200 rounded-lg overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-red-100 bg-red-50">
                <p className="text-sm font-medium text-red-700">Rows that failed</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Row</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">SKU Code</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.errors.map((err, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-gray-500">{err.row}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{err.sku_code}</td>
                      <td className="px-4 py-2 text-red-600">{err.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Import another file
            </button>
            <Link
              href="/ingredients"
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
            >
              View ingredients
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
