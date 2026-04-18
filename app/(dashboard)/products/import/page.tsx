'use client'

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { importProductsAndBoms } from '../actions'
import type { ImportProductInput, ImportResult } from '../actions'

// ─── Parser constants ────────────────────────────────────────────────────────
// The BOM spreadsheet has products side-by-side, each 9 columns wide.
// Column layout within each block (0-based offset from block start):
//   0: Label column (e.g. "Product Type", "Product Name", etc.)
//   1: Product value / ingredient SKU
//   2: Ingredient Name
//   3: Quantity (g)
//   4: Price per kg
//   5: % of pack
//   6: $/unit
//   7: Serve amount
//   8: Unit of Measure flag / is_organic hint

const BLOCK_WIDTH = 9

// Row offsets from the top of a block (0-based):
//   Row 0: "Product Type" header row → product_type in col+1
//   Row 1: "Product Name" → name in col+1
//   Row 2: "SKU Code" (optional) → sku_code
//   Row 3: "Hero Call Out" → hero_call_out
//   Row 4: "Back of Pack" → back_of_pack
//   Row 5: "Serving Size" → serving_size
//   Row 6: "Pack Size (g)" or "Size" → size_g
//   Row 7: "RRP" → rrp
//   Row 8: "Packaging" → packaging
//   Row 9: "Toll" → toll
//   Row 10: "Margin" → margin
//   Row 11: "Other" → other
//   Row 12: "Currency Exchange" → currency_exchange
//   Row 13: "Freight" → freight
// After row 13: ingredient lines until empty ingredient name

const PRODUCT_HEADER_ROW_LABELS: Record<string, keyof ImportProductInput> = {
  'product type':      'product_type',
  'product name':      'name',
  'sku code':          'sku_code',
  'hero call out':     'hero_call_out',
  'back of pack':      'back_of_pack',
  'serving size':      'serving_size',
  'pack size':         'size_g',
  'size':              'size_g',
  'rrp':               'rrp',
  'packaging':         'packaging',
  'toll':              'toll',
  'margin':            'margin',
  'other':             'other',
  'currency exchange': 'currency_exchange',
  'freight':           'freight',
}

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

function normaliseLabel(val: unknown): string {
  return toStr(val).toLowerCase().trim()
}

/**
 * Auto-generate a product SKU from name, type, and size.
 * e.g. "Odi Baby Broccoli Puree" + "Sachet" + 20g → "ODI-BROC-SACHET-20G"
 */
function generateSku(name: string, productType?: string | null, sizeG?: number | null): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  // Take first meaningful word fragment (up to 4 chars)
  const nameFragment = words.slice(0, 3).map((w) => w.slice(0, 4)).join('-')
  const typeFragment = productType
    ? productType.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    : ''
  const sizeFragment = sizeG ? `${Math.round(sizeG)}G` : ''
  return ['ODI', nameFragment, typeFragment, sizeFragment].filter(Boolean).join('-')
}

/**
 * Detect if an ingredient row is non-organic based on its SKU / name.
 * Clues: "Non Organic" prefix in SKU, or common non-organic ingredients.
 */
function detectIsOrganic(sku: string, name: string): boolean {
  const combined = `${sku} ${name}`.toLowerCase()
  const nonOrganicClues = ['non organic', 'non-organic', 'sea salt', 'iodised', 'iodized', 'vitamin', 'vit ', 'mineral', 'additive']
  return !nonOrganicClues.some((clue) => combined.includes(clue))
}

interface ParsedProduct extends ImportProductInput {
  _generated_sku: boolean
}

function parseSheet(workbook: XLSX.WorkBook): ParsedProduct[] {
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  if (!raw.length) return []

  // Find all columns that start a product block by scanning row 0 for "Product Type"
  const blockStartCols: number[] = []
  const firstRow = raw[0] ?? []
  for (let col = 0; col < firstRow.length; col++) {
    if (normaliseLabel(firstRow[col]) === 'product type') {
      blockStartCols.push(col)
    }
  }

  const products: ParsedProduct[] = []

  for (const startCol of blockStartCols) {
    // Extract header rows into a map: label → value
    const headerMap: Record<string, unknown> = {}
    let ingredientStartRow = 1 // will be overridden

    for (let rowIdx = 0; rowIdx < raw.length; rowIdx++) {
      const row = raw[rowIdx]
      const label = normaliseLabel(row?.[startCol])
      const value = row?.[startCol + 1]

      if (label && PRODUCT_HEADER_ROW_LABELS[label]) {
        headerMap[PRODUCT_HEADER_ROW_LABELS[label]] = value
        ingredientStartRow = rowIdx + 1
      }
    }

    // Skip if no product name
    const productName = toStr(headerMap['name'])
    if (!productName) continue

    const productType = toStr(headerMap['product_type']) || undefined
    const sizeG = toNum(headerMap['size_g'])
    const rawSku = toStr(headerMap['sku_code'])
    const skuCode = rawSku || generateSku(productName, productType, sizeG)
    const generatedSku = !rawSku

    // Collect ingredient rows (everything after last header row until empty ingredient SKU)
    const bomItems: ImportProductInput['bom_items'] = []
    let sortOrder = 0

    for (let rowIdx = ingredientStartRow; rowIdx < raw.length; rowIdx++) {
      const row = raw[rowIdx]
      if (!row) continue

      const ingSkuRaw = toStr(row[startCol + 1])
      const ingName   = toStr(row[startCol + 2])
      const qtyRaw    = toNum(row[startCol + 3])
      const priceRaw  = toNum(row[startCol + 4])

      // Stop at empty row (no sku and no name)
      if (!ingSkuRaw && !ingName) break

      // Skip sub-header / total rows
      const skuLower = ingSkuRaw.toLowerCase()
      if (skuLower === 'sku code' || skuLower === 'ingredient' || skuLower === 'total') continue

      if (!ingName || qtyRaw == null) continue

      // Handle auto-generated SKU for non-organic markers
      let ingredientSku = ingSkuRaw
      if (!ingredientSku || ingredientSku.toLowerCase().startsWith('non organic') || ingredientSku.toLowerCase().startsWith('non-organic')) {
        // Generate a simple SKU from name
        ingredientSku = ingName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).slice(0, 3).join('-')
      }

      const isOrganic = detectIsOrganic(ingSkuRaw, ingName)

      bomItems.push({
        ingredient_sku_code: ingredientSku,
        ingredient_name: ingName,
        quantity_g: qtyRaw,
        price_per_kg: priceRaw,
        is_organic: isOrganic,
        sort_order: sortOrder++,
      })
    }

    products.push({
      sku_code:          skuCode,
      name:              productName,
      product_type:      productType || null,
      size_g:            sizeG,
      hero_call_out:     toStr(headerMap['hero_call_out']) || null,
      back_of_pack:      toStr(headerMap['back_of_pack']) || null,
      serving_size:      toNum(headerMap['serving_size']),
      rrp:               toNum(headerMap['rrp']),
      packaging:         toNum(headerMap['packaging']),
      toll:              toNum(headerMap['toll']),
      margin:            toNum(headerMap['margin']),
      other:             toNum(headerMap['other']),
      currency_exchange: toNum(headerMap['currency_exchange']),
      freight:           toNum(headerMap['freight']),
      bom_items:         bomItems,
      _generated_sku:    generatedSku,
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
          setParseError('No products found. Check that row 1 contains "Product Type" column headers.')
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
            Upload your BOM spreadsheet. Products are laid out side-by-side — each block is 9 columns wide.
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
            Drag and drop your <span className="font-medium">.xlsx</span> or <span className="font-medium">.csv</span> file here
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

        <div className="mt-6 text-sm text-gray-500">
          <p className="font-medium text-gray-700 mb-2">Expected format</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Row 1 starts each product block with <code className="bg-gray-100 px-1 rounded">Product Type</code></li>
            <li>Products sit side by side, each occupying 9 columns</li>
            <li>Ingredient rows follow the product header rows</li>
            <li>Non-organic ingredients should have "Non Organic" in the SKU or name</li>
          </ul>
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
                  {p._generated_sku && (
                    <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">auto SKU</span>
                  )}
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

  // Done
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
        <a
          href="/products"
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
        >
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
