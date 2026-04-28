// One-shot script: read SOH xlsx, match by sku_code, report matches.
// Pass `--write` to actually update opening_stock_override.
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tiny .env.local loader (avoids a dotenv dependency).
function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv(path.join(__dirname, '..', '.env.local'))

const url   = process.env.NEXT_PUBLIC_SUPABASE_URL
const key   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing Supabase env vars in .env.local')
  process.exit(1)
}
const sb = createClient(url, key)

const FILE = '/Users/lancegiles/Downloads/SOH Ingredients_Packaging 28.4.26.xlsx'
const WRITE = process.argv.includes('--write')

// Read xlsx
const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

// Ingredient rows: between header row 0 and the blank row before "PACKAGING"
const sohRows = []
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  if (!r || !r[0]) continue
  // Stop at the packaging header
  if (typeof r[1] === 'string' && r[1].trim().toUpperCase() === 'PACKAGING') break
  if (typeof r[0] === 'string' && r[0].trim().toUpperCase() === 'SKU') continue
  const sku = String(r[0]).trim()
  const name = r[1] ? String(r[1]).trim() : ''
  const soh = Number(r[2])
  if (!Number.isFinite(soh)) continue
  sohRows.push({ sku, name, soh })
}

// Pull all ingredient sku_codes
const { data: ings, error } = await sb
  .from('ingredients')
  .select('id, sku_code, name, unit_of_measure, opening_stock_override')
if (error) {
  console.error('DB error:', error.message)
  process.exit(1)
}

// Match (case-insensitive trimmed)
const bySku = new Map(ings.map((i) => [i.sku_code.trim().toLowerCase(), i]))
const matches = []
const misses  = []
for (const row of sohRows) {
  const m = bySku.get(row.sku.toLowerCase())
  if (m) matches.push({ ...row, ingredient: m })
  else   misses.push(row)
}

console.log(`\nIngredient rows in file: ${sohRows.length}`)
console.log(`Matched in DB:           ${matches.length}`)
console.log(`Unmatched (skip):        ${misses.length}\n`)

if (misses.length > 0) {
  console.log('--- UNMATCHED (will be skipped) ---')
  for (const m of misses) console.log(`  ${m.sku}  ·  ${m.name}  ·  SOH ${m.soh}`)
  console.log('')
}

console.log('--- WILL UPDATE ---')
console.log('SKU'.padEnd(28), 'Name'.padEnd(38), 'Old'.padStart(10), 'New'.padStart(10), 'UoM')
console.log('-'.repeat(98))
for (const m of matches) {
  const oldVal = m.ingredient.opening_stock_override
  console.log(
    m.sku.padEnd(28),
    (m.ingredient.name ?? '').slice(0, 36).padEnd(38),
    String(oldVal ?? '—').padStart(10),
    String(m.soh).padStart(10),
    m.ingredient.unit_of_measure ?? '',
  )
}
console.log('')

if (!WRITE) {
  console.log('DRY RUN — pass --write to apply changes.')
  process.exit(0)
}

console.log('WRITING…')
let ok = 0, fail = 0
for (const m of matches) {
  const { error: e } = await sb
    .from('ingredients')
    .update({ opening_stock_override: m.soh })
    .eq('id', m.ingredient.id)
  if (e) { console.error('FAIL', m.sku, e.message); fail++ } else { ok++ }
}
console.log(`Done: ${ok} updated, ${fail} failed.`)
