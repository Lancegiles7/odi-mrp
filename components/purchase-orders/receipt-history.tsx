import { createClient } from '@/lib/supabase/server'
import { CoaDownload } from './coa-download'

interface Props {
  poId: string
}

interface MovementRow {
  id: string
  purchase_order_line_id: string | null
  quantity: number
  unit_of_measure: string
  unit_cost: number | null
  notes: string
  lot_number: string | null
  expiry_date: string | null
  coa_file_path: string | null
  coa_file_name: string | null
  created_at: string
}

// Receipt history for a single PO — every stock movement booked against this
// PO's lines, showing the structured lot / expiry / COA captured at receipt.
// Renders nothing until the PO has had its first receipt.
export async function ReceiptHistory({ poId }: Props) {
  const supabase = createClient()

  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('id, ingredient_id, packaging_id')
    .eq('purchase_order_id', poId) as { data: Array<{ id: string; ingredient_id: string | null; packaging_id: string | null }> | null }

  const lineIds = (lines ?? []).map((l) => l.id)
  if (lineIds.length === 0) return null

  const { data: movements } = await supabase
    .from('stock_movements')
    .select('id, purchase_order_line_id, quantity, unit_of_measure, unit_cost, notes, lot_number, expiry_date, coa_file_path, coa_file_name, created_at')
    .in('purchase_order_line_id', lineIds)
    .eq('movement_type', 'purchase_received')
    .order('created_at', { ascending: false }) as { data: MovementRow[] | null }

  if (!movements || movements.length === 0) return null

  // Labels — resolve ingredient / packaging names for the lines that received.
  const ingIds = (lines ?? []).filter((l) => l.ingredient_id).map((l) => l.ingredient_id!)
  const pakIds = (lines ?? []).filter((l) => l.packaging_id).map((l) => l.packaging_id!)

  const [{ data: ings }, { data: paks }] = await Promise.all([
    ingIds.length
      ? supabase.from('ingredients').select('id, sku_code, name').in('id', ingIds) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>
      : Promise.resolve({ data: [] as Array<{ id: string; sku_code: string; name: string }> }),
    pakIds.length
      ? supabase.from('packaging').select('id, sku_code, name').in('id', pakIds) as unknown as Promise<{ data: Array<{ id: string; sku_code: string; name: string }> | null }>
      : Promise.resolve({ data: [] as Array<{ id: string; sku_code: string; name: string }> }),
  ])

  const ingMap = new Map((ings ?? []).map((i) => [i.id, i]))
  const pakMap = new Map((paks ?? []).map((p) => [p.id, p]))
  const lineMap = new Map((lines ?? []).map((l) => [l.id, l]))

  function labelFor(lineId: string | null): { name: string; sku: string | null } {
    const line = lineId ? lineMap.get(lineId) : null
    if (line?.ingredient_id) {
      const i = ingMap.get(line.ingredient_id)
      return { name: i?.name ?? '—', sku: i?.sku_code ?? null }
    }
    if (line?.packaging_id) {
      const p = pakMap.get(line.packaging_id)
      return { name: p?.name ?? '—', sku: p?.sku_code ?? null }
    }
    return { name: '—', sku: null }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold">Receipt history</h2>
        <p className="text-xs text-gray-500 mt-0.5">Stock booked in against this PO, with lot, expiry and COA captured at receipt.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Received</th>
              <th className="text-left px-3 py-2 font-medium">Item</th>
              <th className="text-right px-3 py-2 font-medium">Qty</th>
              <th className="text-right px-3 py-2 font-medium">Invoice price</th>
              <th className="text-left px-3 py-2 font-medium">Lot #</th>
              <th className="text-left px-3 py-2 font-medium">Expiry</th>
              <th className="text-left px-3 py-2 font-medium">COA</th>
              <th className="text-left px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const item = labelFor(m.purchase_order_line_id)
              const expired = m.expiry_date
                ? new Date(m.expiry_date + 'T00:00:00').getTime() < today.getTime()
                : false
              return (
                <tr key={m.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{m.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.name}</div>
                    {item.sku && <div className="text-[10px] text-gray-500 font-mono">{item.sku}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(m.quantity).toLocaleString()} {m.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{m.unit_cost != null ? `$${Number(m.unit_cost).toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2 font-mono">{m.lot_number || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.expiry_date
                      ? <span className={expired ? 'text-red-700' : ''}>{m.expiry_date}{expired ? ' ⚠' : ''}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {m.coa_file_path && m.coa_file_name
                      ? <CoaDownload filePath={m.coa_file_path} fileName={m.coa_file_name} />
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.notes || <span className="text-gray-300">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
