/**
 * Forecast (demand) upload audit trail — reads for the Demand page.
 *
 * Each row in demand_upload_log is one run of the "MRP Units Upload" import.
 * demand_upload_changes holds the cells that actually moved on that run, so
 * the page can show "what changed vs the previous upload" without snapshotting
 * the whole forecast every time.
 */
import { createClient } from '@/lib/supabase/server'
import { monthLabel } from '@/lib/demand'

export interface DemandUpload {
  id: string
  uploaded_at: string
  uploaded_by: string | null
  uploaded_by_name: string | null
  file_name: string | null
  fiscal_years: string[]
  cells_changed: number
  cells_written: number
  cells_skipped: number
  note: string | null
}

export interface DemandUploadChange {
  product_id: string | null
  product_name: string
  channel: string
  channel_label: string
  year_month: string      // 'yyyy-mm-01'
  month_label: string     // 'Nov 2026'
  old_units: number | null
  new_units: number
  delta: number
}

export interface DemandUploadDiff {
  productsChanged: number
  unitsAdded: number
  unitsRemoved: number
  netChange: number
  changes: DemandUploadChange[]
}

/** 'retail_nz' → 'Retail NZ', 'ecomm_au' → 'Ecomm AU', 'pipefill_nz' → 'Pipefill NZ'. */
export function channelLabel(channel: string): string {
  const [kind, country] = channel.split('_')
  const kindLabel = kind === 'ecomm' ? 'Ecomm'
    : kind === 'retail' ? 'Retail'
    : kind === 'pipefill' ? 'Pipefill'
    : kind.charAt(0).toUpperCase() + kind.slice(1)
  return country ? `${kindLabel} ${country.toUpperCase()}` : kindLabel
}

async function withUploaderNames(rows: Omit<DemandUpload, 'uploaded_by_name'>[]): Promise<DemandUpload[]> {
  const supabase = createClient()
  const ids = Array.from(new Set(rows.map((r) => r.uploaded_by).filter((x): x is string => !!x)))
  const names = new Map<string, string | null>()
  if (ids.length) {
    const { data } = await supabase
      .from('user_profiles').select('id, full_name').in('id', ids) as { data: Array<{ id: string; full_name: string | null }> | null }
    for (const p of data ?? []) names.set(p.id, p.full_name)
  }
  return rows.map((r) => ({ ...r, uploaded_by_name: r.uploaded_by ? (names.get(r.uploaded_by) ?? null) : null }))
}

/** Most recent forecast upload, for the "last updated" stamp. */
export async function getLatestDemandUpload(): Promise<DemandUpload | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('demand_upload_log')
    .select('id, uploaded_at, uploaded_by, file_name, fiscal_years, cells_changed, cells_written, cells_skipped, note')
    .order('uploaded_at', { ascending: false })
    .limit(1) as { data: Omit<DemandUpload, 'uploaded_by_name'>[] | null }
  if (!data || data.length === 0) return null
  return (await withUploaderNames(data))[0]
}

/** Recent forecast uploads, newest first, for the history log. */
export async function listDemandUploads(limit = 20): Promise<DemandUpload[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('demand_upload_log')
    .select('id, uploaded_at, uploaded_by, file_name, fiscal_years, cells_changed, cells_written, cells_skipped, note')
    .order('uploaded_at', { ascending: false })
    .limit(limit) as { data: Omit<DemandUpload, 'uploaded_by_name'>[] | null }
  return withUploaderNames(data ?? [])
}

/** The cells that moved on one upload, with product names and a summary. */
export async function getDemandUploadChanges(uploadId: string): Promise<DemandUploadDiff> {
  const supabase = createClient()
  const { data: rows } = await supabase
    .from('demand_upload_changes')
    .select('product_id, channel, year_month, old_units, new_units')
    .eq('upload_id', uploadId) as {
      data: Array<{ product_id: string | null; channel: string; year_month: string; old_units: number | null; new_units: number }> | null
    }
  const list = rows ?? []

  // Resolve product names in one go.
  const pids = Array.from(new Set(list.map((r) => r.product_id).filter((x): x is string => !!x)))
  const nameById = new Map<string, string>()
  if (pids.length) {
    const { data: prods } = await supabase
      .from('products').select('id, name').in('id', pids) as { data: Array<{ id: string; name: string }> | null }
    for (const p of prods ?? []) nameById.set(p.id, p.name)
  }

  let unitsAdded = 0
  let unitsRemoved = 0
  const changes: DemandUploadChange[] = list.map((r) => {
    const delta = r.new_units - (r.old_units ?? 0)
    if (delta > 0) unitsAdded += delta
    else unitsRemoved += -delta
    const ym = typeof r.year_month === 'string' ? r.year_month.slice(0, 10) : r.year_month
    return {
      product_id: r.product_id,
      product_name: (r.product_id && nameById.get(r.product_id)) || '(unknown product)',
      channel: r.channel,
      channel_label: channelLabel(r.channel),
      year_month: ym,
      month_label: monthLabel(ym),
      old_units: r.old_units,
      new_units: r.new_units,
      delta,
    }
  })

  // Sort: product name, then month, then channel.
  changes.sort((a, b) =>
    a.product_name.localeCompare(b.product_name) ||
    a.year_month.localeCompare(b.year_month) ||
    a.channel.localeCompare(b.channel))

  return {
    productsChanged: new Set(list.map((r) => r.product_id)).size,
    unitsAdded,
    unitsRemoved,
    netChange: unitsAdded - unitsRemoved,
    changes,
  }
}
