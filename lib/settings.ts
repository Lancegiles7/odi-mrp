/**
 * Global application settings (singleton row in app_settings).
 * Defaults below are also defaults in migration 006.
 */

import { createClient } from '@/lib/supabase/server'
import type { AppSettings } from '@/lib/types/database.types'
import { rollingMonths, monthKey } from '@/lib/demand'

export const DEFAULT_FX_RATE = 1.2
export const DEFAULT_GST_NZ = 0.15
export const DEFAULT_GST_AU = 0.10

export type FxRatesJson = { NZD: number; AUD: number; USD: number; EUR: number; GBP: number }
// AUD here is the single source of truth for AUD → NZD across the app
// (costing reads it; loaded-cost converters read it). 1.20 matches the
// rate Odi has been keying off in the legacy fx_rate field.
export const DEFAULT_FX_RATES: FxRatesJson = { NZD: 1.0, AUD: 1.20, USD: 1.62, EUR: 1.78, GBP: 2.05 }

export type SettingsSnapshot = Pick<AppSettings, 'fx_rate' | 'gst_nz_pct' | 'gst_au_pct' | 'planning_start_month' | 'updated_at' | 'updated_by'> & {
  fx_rates: FxRatesJson
}

/**
 * Read the settings singleton. Returns DB defaults if the row is
 * missing (shouldn't happen — migration seeds it — but we never want
 * costing to crash if someone cleared the table).
 */
export async function getAppSettings(): Promise<SettingsSnapshot> {
  const supabase = createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('fx_rate, gst_nz_pct, gst_au_pct, planning_start_month, updated_at, updated_by, fx_rates')
    .eq('id', 1)
    .maybeSingle() as { data: (SettingsSnapshot & { fx_rates: FxRatesJson | null }) | null }

  if (!data) {
    return {
      fx_rate: DEFAULT_FX_RATE,
      gst_nz_pct: DEFAULT_GST_NZ,
      gst_au_pct: DEFAULT_GST_AU,
      planning_start_month: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
      fx_rates: DEFAULT_FX_RATES,
    }
  }
  return { ...data, fx_rates: { ...DEFAULT_FX_RATES, ...(data.fx_rates ?? {}) } }
}

/**
 * Resolve the rolling-window anchor (first month of the planning view).
 * Returns the first day of either:
 *   - app_settings.planning_start_month, when set, OR
 *   - today's calendar month, otherwise.
 * Always returns a Date at UTC midnight on day 1.
 */
export async function getPlanningAnchor(): Promise<Date> {
  const settings = await getAppSettings()
  if (settings.planning_start_month) {
    const key = settings.planning_start_month.slice(0, 10)
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1))
  }
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// ============================================================
// Planning window — which months the planning screens show.
//
// Normally that's the rolling 12 months from the anchor (see
// getPlanningAnchor): completing a month moves the anchor forward and the
// closed month disappears. `history` mode prepends the closed months back
// to the start of the financial year so they can be LOOKED AT — those
// months are display-only, and the live/editable window is unchanged.
// ============================================================

/** Odi's financial year starts 1 April (0-based month index). */
export const FY_START_MONTH_INDEX = 3

/** First day of the financial year that `today` falls in (UTC). */
export function fiscalYearStart(today: Date = new Date()): Date {
  const y = today.getUTCFullYear()
  const inNewFy = today.getUTCMonth() >= FY_START_MONTH_INDEX
  return new Date(Date.UTC(inNewFy ? y : y - 1, FY_START_MONTH_INDEX, 1))
}

/** Financial-year label for a month key, named by the year it ends: '2027-06-01' → 'FY28'. */
export function fyLabel(monthKeyStr: string): string {
  const [y, m] = monthKeyStr.split('-').map(Number)
  const endYear = m - 1 >= FY_START_MONTH_INDEX ? y + 1 : y
  return `FY${String(endYear).slice(2)}`
}

/**
 * Live planning months: at least 12 from the anchor, then run on to the end of
 * that financial year so a whole FY is always in view (e.g. Sep 26 → Mar 28,
 * all of FY28). Between 12 and 23 months.
 */
export function planningForwardMonths(anchor: Date): string[] {
  const minEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 11, 1))
  const fyEnd  = new Date(Date.UTC(fiscalYearStart(minEnd).getUTCFullYear() + 1, FY_START_MONTH_INDEX - 1, 1))
  const n = (fyEnd.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (fyEnd.getUTCMonth() - anchor.getUTCMonth()) + 1
  return rollingMonths(n, anchor)
}

export interface PlanningWindow {
  /** Every month to render, oldest first. */
  months: string[]
  /** First month of the live planning window — where editing starts. */
  anchorMonth: string
  /** Closed months shown only in history mode. Display-only. */
  lockedMonths: string[]
  /** True when the caller asked for history AND there is history to show. */
  isHistory: boolean
  /** False when the anchor is already at/behind the FY start (nothing to show). */
  canShowHistory: boolean
  /** First month of the current financial year. */
  fyStartMonth: string
}

export async function getPlanningWindow(showHistory = false): Promise<PlanningWindow> {
  const anchor  = await getPlanningAnchor()
  const fyStart = fiscalYearStart()
  const forward = planningForwardMonths(anchor)

  const base = {
    anchorMonth:  forward[0],
    canShowHistory: fyStart.getTime() < anchor.getTime(),
    fyStartMonth: monthKey(fyStart),
  }

  if (!showHistory || !base.canShowHistory) {
    return { ...base, months: forward, lockedMonths: [], isHistory: false }
  }

  const locked: string[] = []
  for (
    let d = fyStart;
    d.getTime() < anchor.getTime();
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  ) {
    locked.push(monthKey(d))
  }

  return { ...base, months: [...locked, ...forward], lockedMonths: locked, isHistory: true }
}
