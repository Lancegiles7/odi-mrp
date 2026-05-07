'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { commitBudgetSnapshot } from './actions'
import { parseBudgetXlsx, type BudgetParseResult } from '@/lib/budget-parser'

type Stage = 'upload' | 'preview' | 'result'

export default function BudgetImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage]   = useState<Stage>('upload')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<BudgetParseResult | null>(null)
  const [fileName, setFileName] = useState<string>('')

  async function handleFile(file: File) {
    setParseError(null)
    setResult(null)
    setFileName(file.name)
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const r = await parseBudgetXlsx(buf)
      setResult(r)
      setStage('preview')
    } catch (e) {
      console.error(e)
      setParseError('Could not parse the file. Make sure it has the "Copy of …" presentation tabs.')
    } finally {
      setParsing(false)
    }
  }

  async function handleCommit() {
    if (!result) return
    setImporting(true)
    try {
      const res = await commitBudgetSnapshot(fileName, result.items)
      if (!res.ok) {
        setParseError(res.error ?? 'Save failed')
        return
      }
      setStage('result')
      // Redirect to dashboard
      router.push('/?budget_uploaded=1')
      router.refresh()
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStage('upload')
    setResult(null)
    setParseError(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // Aggregate preview by section
  const sectionCounts = new Map<string, number>()
  for (const it of result?.items ?? []) {
    const k = `${it.section}/${it.metric}`
    sectionCounts.set(k, (sectionCounts.get(k) ?? 0) + 1)
  }

  return (
    <div className="max-w-5xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-900">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900">Import budget</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Import FY budget</h1>
        <p className="text-sm text-gray-500 mt-1">
          Reads the &quot;Copy of …&quot; presentation tabs in your FY budget XLSX and stores the latest snapshot for the dashboard.
        </p>
      </div>

      {stage === 'upload' && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center bg-white">
          <p className="text-sm text-gray-600 mb-3">
            Select your FY budget workbook
          </p>
          <label className="cursor-pointer inline-block px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800">
            {parsing ? 'Parsing…' : 'Choose XLSX'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              disabled={parsing}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
          {parseError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 text-left">
              {parseError}
            </div>
          )}
        </div>
      )}

      {stage === 'preview' && result && (
        <div className="space-y-5">
          <div className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <div className="flex-1">
              <div className="font-medium">{fileName}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {result.items.length} rows · {result.meta.months_fy27.length} FY27 months
              </div>
            </div>
            <button onClick={reset} className="text-xs text-gray-600 underline">Choose different file</button>
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
              <p className="font-medium mb-1">Save failed:</p>
              <p className="text-xs whitespace-pre-wrap">{parseError}</p>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
              <p className="font-medium mb-1">Parsing issues:</p>
              <ul className="list-disc ml-5 text-xs">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
              <p className="font-medium mb-1">Warnings:</p>
              <ul className="list-disc ml-5 text-xs">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 text-xs text-gray-600 bg-gray-50">
              Preview — line items extracted from the workbook
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
                  <th className="text-left font-medium px-4 py-2">Section / metric</th>
                  <th className="text-right font-medium px-4 py-2">Rows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...sectionCounts.entries()].sort().map(([k, n]) => (
                  <tr key={k}>
                    <td className="px-4 py-1.5 font-mono">{k}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={importing || result.errors.length > 0}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {importing ? 'Saving snapshot…' : `Save snapshot (${result.items.length} rows)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
