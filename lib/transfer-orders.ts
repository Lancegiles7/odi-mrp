/**
 * Per-product SRT pack info for transfer orders. A snack can be moved as
 * individual units or as SRTs (shelf-ready trays). Each product with an
 * SRT-type packaging has a pack size = units per SRT, derived from
 * product_packaging.quantity_per_unit (SRTs per product, e.g. 0.2 → 5 units).
 */
import { createClient } from '@/lib/supabase/server'

export interface SrtInfo { name: string; unitsPerSrt: number }

export async function loadSrtByProduct(): Promise<Record<string, SrtInfo>> {
  const supabase = createClient()
  const { data: srtPkg } = await supabase.from('packaging')
    .select('id, name').eq('type', 'SRT') as { data: Array<{ id: string; name: string }> | null }
  const ids = (srtPkg ?? []).map((p) => p.id)
  if (!ids.length) return {}
  const nameById = new Map((srtPkg ?? []).map((p) => [p.id, p.name]))

  const { data: pp } = await supabase.from('product_packaging')
    .select('product_id, packaging_id, quantity_per_unit')
    .in('packaging_id', ids) as { data: Array<{ product_id: string; packaging_id: string; quantity_per_unit: number }> | null }

  const out: Record<string, SrtInfo> = {}
  for (const r of pp ?? []) {
    const qpu = Number(r.quantity_per_unit)   // SRTs per product
    if (!(qpu > 0)) continue
    out[r.product_id] = {
      name: nameById.get(r.packaging_id) ?? 'SRT',
      unitsPerSrt: Math.max(1, Math.round(1 / qpu)),
    }
  }
  return out
}
