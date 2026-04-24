/**
 * Global application settings (singleton row in app_settings).
 * Defaults below are also defaults in migration 006.
 */

import { createClient } from '@/lib/supabase/server'
import type { AppSettings } from '@/lib/types/database.types'

export const DEFAULT_FX_RATE = 1.2
export const DEFAULT_GST_NZ = 0.15
export const DEFAULT_GST_AU = 0.10

export type SettingsSnapshot = Pick<AppSettings, 'fx_rate' | 'gst_nz_pct' | 'gst_au_pct' | 'updated_at' | 'updated_by'>

/**
 * Read the settings singleton. Returns DB defaults if the row is
 * missing (shouldn't happen — migration seeds it — but we never want
 * costing to crash if someone cleared the table).
 */
export async function getAppSettings(): Promise<SettingsSnapshot> {
  const supabase = createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('fx_rate, gst_nz_pct, gst_au_pct, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()

  if (!data) {
    return {
      fx_rate: DEFAULT_FX_RATE,
      gst_nz_pct: DEFAULT_GST_NZ,
      gst_au_pct: DEFAULT_GST_AU,
      updated_at: new Date().toISOString(),
      updated_by: null,
    }
  }
  return data
}
