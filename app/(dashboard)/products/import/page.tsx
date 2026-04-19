'use client'

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { importProductsAndBoms } from '../actions'
import type { ImportProductInput, ImportResult } from '../actions'

// ─── Parser ──────────────────────────────────────────────────────────────────
//
// Spreadsheet layout (0-indexed rows, each product block is 9 columns wide):
//
// Within each block, col 0 = label, col 1 = product value / ingredient name
//
// Row 0-1: empty
// Row 2:  col 0 = "Product Type",  col 1 = type value (e.g. "Sachet")
// Row 3:  col 0 = "SKU",           col 1 = product name (e.g. "Odi Baby Puree...")
// Row 4:  col 0 = "Size (G)",      col 2 = size value (e.g. 20)
// Row 5:  col 0 = "Ingredients",   col 1 = "SKU Code" (header row)
//
// Row 2 also has: col 3 = "Hero Call out", col 4 = hero value
//                 col 6 = "RRP",            col 7 = rrp value
// Row 3 also has: col 3 = "Back of pack",  col 4 = back of pack value
//                 col 6 = "COS",            col 7 = cos value
// Row 4 also has: col 3 = "Serving Size",  col 5 = serving size value
//
// Ingredient rows (row 6 until label col = "Total"):
//   col 0 = ingredient name
//   col 1 = ingredient SKU code
//   col 2 = quantity_g
//   col 6 = price_per_kg
//
// After "Total" row:
//   "Packaging"            → col 7
//   "Toll"                 → col 7
//   "Margin"               → col 7
//   "Other"                → col 7
//   "Currency Exchange..." → col 7
//   "Freight"              → col 7
//
// Products repeat horizontally every 9 columns (block starts at col 1, 10, 19, 28, 37…)
// Products also repeat vertically — next block starts ~18 rows after previous block's "Product Type"

function round2(n: number) { return Math.round(n * 100) / 100 }

function toNum(val: unknown): number | null {
  if (val == null || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : round2(n)
}

function toStr(val: unknown): string {
  if (val == null) return ''
  return String(val).trim()
}

function norm(val: unknown): string {
  return toStr(val).toLowerCase().replace(/\s+/g, ' ').trim()
}

function generateSku(name: string, productType?: string | null, sizeG?: number | null): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  const nameFragment = words.slice(0, 3).map((w) => w.slice(0, 4)).join('-')
  const typeFragment = productType ? productType.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : ''
  const sizeFragment = sizeG ? `${Math.round(sizeG)}G` : ''
  return ['ODI', nameFragment, typeFragment, sizeFragment].filter(Boolean).join('-')
}

function detectIsOrganic(sku: string, name: string): boolean {
  const combined = `${sku} ${name}`.toLowerCase()
  const nonOrganicClues = ['non organic', 'non-organic', 'sea salt', 'iodised', 'iodized', 'vitamin', 'vit ', 'mineral']
  return !nonOrganicClues.some((clue) => combined.includes(clue))
}

interface ParsedProduct extends ImportProductInput {
  _generated_sku: boolean
}

function parseSheet(workbook: XLSX.WorkBook): ParsedProduct[] {
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  // Read as 2D array with no headers, fill missing cells with null
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  if (!raw.length) return []

  const numRows = raw.length
  const numCols = raw[0] ? raw[0].length : 0

  // Find all (row, col) positions where "Product Type" appears
  const blockStarts: Array<{ row: number; col: number }> = []
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (norm(raw[r]?.[c]) === 'product type') {
        blockStarts.push({ row: r, col: c })
      }
    }
  }

  const products: ParsedProduct[] = []

  for (const { row: r0, col: c0 } of blockStarts) {
    // c0 = label column, c0+1 = value column for most fields
    const productType = toStr(raw[r0]?.[c0 + 1])     // Row 0 of block, col+1
    const productName = toStr(raw[r0 + 1]?.[c0 + 1]) // Row 1 = "SKU" row, col+1 = name
    if (!productName) continue

    // Size: row+2, col+2
    const sizeG = toNum(raw[r0 + 2]?.[c0 + 2])
    // Serving size: row+2, col+5
    const servingSize = toNum(raw[r0 + 2]?.[c0 + 5])

    // Hero call out: row+0, col+4
    const heroCallOut = toStr(raw[r0]?.[c0 + 4]) || null
    // Back of pack: row+1, col+4
    const backOfPack = toStr(raw[r0 + 1]?.[c0 + 4]) || null
    // RRP: row+0, col+7
    const rrp = toNum(raw[r0]?.[c0 + 7])

    // Ingredient rows start at row+4 (row+3 is the "Ingredients / SKU Code" header)
    const ingStartRow = r0 + 4
    const bomItems: ImportProductInput['bom_items'] = []
    let sortOrder = 0

    // Cost fields — collected after "Total" row
    let packaging: number | null = null
    let toll: number | null = null
    let margin: number | null = null
    let other: number | null = null
    let currencyExchange: number | null = null
    let freight: number | null = null

    let pastTotal = false

    for (let r = ingStartRow; r < numRows; r++) {
      const labelCol = toStr(raw[r]?.[c0])
      const labelNorm = norm(raw[r]?.[c0])

      // Stop if we hit the next "Product Type" block in the same column
      if (r > r0 && labelNorm === 'product type') break
      // Also stop if we've gone 30 rows past the block start with nothing useful
      if (r > r0 + 40) break

      if (!pastTotal) {
        if (labelNorm === 'total') {
          pastTotal = true
          continue
        }

        // Skip the header row ("Ingredients" / "SKU Code")
        if (labelNorm === 'ingredients' || labelNorm === 'sku code') continue

        const ingName = toStr(raw[r]?.[c0])
        const ingSkuRaw = toStr(raw[r]?.[c0 + 1])
        const qtyG = toNum(raw[r]?.[c0 + 2])
        const pricePerKg = toNum(raw[r]?.[c0 + 6])

        if (!ingName || qtyG == null || qtyG === 0) continue

        // Generate SKU if missing
        let ingSku = ingSkuRaw
        if (!ingSku || ingSku.toLowerCase().startsWith('non organic') || ingSku.toLowerCase().startsWith('non-organic')) {
          ingSku = ingName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).slice(0, 3).join('-')
        }

        const isOrganic = detectIsOrganic(ingSkuRaw, ingName)

        bomItems.push({
          ingredient_sku_code: ingSku,
          ingredient_name: ingName,
          quantity_g: qtyG,
          price_per_kg: pricePerKg,
          is_organic: isOrganic,
          sort_order: sortOrder++,
        })
      } else {
        // Cost rows — value is in col+7
        const val = toNum(raw[r]?.[c0 + 7])
        if (labelNorm === 'packaging') packaging = val
        else if (labelNorm === 'toll') toll = val
        else if (labelNorm.startsWith('margin')) margin = val
        else if (labelNorm === 'other' || labelNorm.startsWith('other')) other = val
        else if (labelNorm.startsWith('currency exchange')) currencyExchange = val
        else if (labelNorm === 'freight') freight = val
        else if (labelNorm === 'grand total') break // done with this block
      }
    }

    if (bomItems.length === 0) continue // skip empty blocks

    const skuCode = generateSku(productName, productType, sizeG)

    products.push({
      sku_code:          skuCode,
      name:              productName,
      product_type:      productType || null,
      size_g:            sizeG,
      hero_call_out:     heroCallOut,
      back_of_pack:      backOfPack,
      serving_size:      servingSize,
      rrp,
      packaging,
      toll,
      margin,
      other,
      currency_exchange: currencyExchange,
      freight,
      bom_items:         bomItems,
      _generated_sku:    true,
    })
  }

  return products
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'importing' | 'done'

export default function ImportBomPage() {
  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ParsedProduct[]>([])
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setParseError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const products = parseSheet(wb)
        if (products.length === 0) {
          setParseError('No products found. Check that the spreadsheet contains "Product Type" cells.')
          return
        }
        setParsed(products)
        setStep('preview')
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse file')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  async function handleImport() {
    setStep('importing')
    const res = await importProductsAndBoms(parsed)
    setResult(res)
    setStep('done')
  }

  if (step === 'upload') {
    return (
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Import BOM</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload your BOM spreadsheet. Products can be laid out side-by-side or stacked vertically.
          </p>
        </div>

        {parseError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {parseError}
          </div>
        )}

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors"
        >
          <p className="text-sm text-gray-600 mb-4">
            Drag and drop your <span className="font-medium">.xlsx</span> file here
          </p>
          <label className="cursor-pointer">
            <span className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Choose file
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </label>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Preview import</h1>
            <p className="text-sm text-gray-500 mt-1">
              {parsed.length} product{parsed.length !== 1 ? 's' : ''} found in <span className="font-medium">{fileName}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setParsed([]); setStep('upload') }}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
            >
              Import {parsed.length} product{parsed.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {parsed.map((p, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                  <span className="ml-2 text-xs font-mono text-gray-500">{p.sku_code}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {p.product_type && <span>{p.product_type}</span>}
                  {p.size_g && <span>{p.size_g}g</span>}
                  {p.rrp && <span>RRP ${p.rrp}</span>}
                  <span className="text-gray-400">{p.bom_items.length} ingredients</span>
                </div>
              </div>

              {p.bom_items.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">SKU</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Ingredient</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">Qty (g)</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">$/kg</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Organic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {p.bom_items.map((item, j) => (
                      <tr key={j} className="hover:bg-gray-50">
                        <td className="px-4 py-1.5 font-mono text-gray-500">{item.ingredient_sku_code}</td>
                        <td className="px-4 py-1.5 text-gray-900">{item.ingredient_name}</td>
                        <td className="px-4 py-1.5 text-right text-gray-700 tabular-nums">{item.quantity_g}</td>
                        <td className="px-4 py-1.5 text-right text-gray-700 tabular-nums">
                          {item.price_per_kg != null ? `$${item.price_per_kg}` : '—'}
                        </td>
                        <td className="px-4 py-1.5">
                          {item.is_organic !== false ? (
                            <span className="text-green-700">Organic</span>
                          ) : (
                            <span className="text-orange-600">Non-Organic</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleImport}
            className="px-6 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
          >
            Import {parsed.length} product{parsed.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'importing') {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-gray-500">Importing products and BOMs…</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Import complete</h1>

      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Products created</p>
              <p className="text-2xl font-semibold text-gray-900">{result.products_created}</p>
            </div>
            <div>
              <p className="text-gray-500">Products updated</p>
              <p className="text-2xl font-semibold text-gray-900">{result.products_updated}</p>
            </div>
            <div>
              <p className="text-gray-500">Ingredients created</p>
              <p className="text-2xl font-semibold text-gray-900">{result.ingredients_created}</p>
            </div>
            <div>
              <p className="text-gray-500">BOM items created</p>
              <p className="text-2xl font-semibold text-gray-900">{result.bom_items_created}</p>
            </div>
          </div>

          {result.failed > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm font-medium text-red-700 mb-2">{result.failed} failed</p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-600">
                    <span className="font-medium">{e.product}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <a href="/products" className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800">
          View products
        </a>
        <button
          onClick={() => { setParsed([]); setResult(null); setStep('upload') }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Import another file
        </button>
      </div>
    </div>
  )
}
