'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/constants'

function parseRate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return isNaN(n) ? null : n
}

/**
 * Update the app_settings singleton. Admin-only. RLS on the table
 * will reject non-admin writes as a second line of defence.
 */
export async function updateSettings(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Confirm admin role at the action layer too, so non-admin submits
  // get a redirect rather than a silent RLS failure.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, role_id, roles(name)')
    .eq('id', user.id)
    .single() as { data: { id: string; role_id: string; roles: { name: string } | null } | null }

  const roleName = profile?.roles?.name ?? null
  if (roleName !== ROLES.ADMIN) redirect('/?error=forbidden')

  const fxRateRaw   = parseRate(formData.get('fx_rate'))
  const gstNzRaw    = parseRate(formData.get('gst_nz_pct_input'))    // submitted as percent (e.g. 15)
  const gstAuRaw    = parseRate(formData.get('gst_au_pct_input'))

  const fxRate    = fxRateRaw != null && fxRateRaw > 0 ? fxRateRaw : 1
  // Incoming percents → fractions, clamped to [0, 1]
  const gstNzPct  = gstNzRaw != null ? Math.max(0, Math.min(1, gstNzRaw / 100)) : 0
  const gstAuPct  = gstAuRaw != null ? Math.max(0, Math.min(1, gstAuRaw / 100)) : 0

  const { error } = await supabase
    .from('app_settings')
    .update({
      fx_rate:    fxRate,
      gst_nz_pct: gstNzPct,
      gst_au_pct: gstAuPct,
      updated_by: profile?.id ?? null,
    })
    .eq('id', 1)

  if (error) {
    redirect('/settings?error=server')
  }

  // Recalculations cascade from the settings change — revalidate the
  // product list and any product detail pages that display COS/FX.
  revalidatePath('/settings')
  revalidatePath('/products')
  revalidatePath('/products', 'layout')
  redirect('/settings?saved=1')
}

/**
 * Advance the planning window by one month. If no anchor is set yet,
 * we anchor on today's month first (so completing it advances to next).
 */
export async function completeCurrentPlanningMonth(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: current } = await supabase
    .from('app_settings')
    .select('planning_start_month')
    .eq('id', 1)
    .maybeSingle() as { data: { planning_start_month: string | null } | null }

  // Resolve the current anchor (UTC date)
  const anchor: Date = current?.planning_start_month
    ? (() => {
        const [y, m] = current.planning_start_month.slice(0, 10).split('-').map(Number)
        return new Date(Date.UTC(y, m - 1, 1))
      })()
    : (() => {
        const now = new Date()
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      })()

  // Advance by one month
  const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1))
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`

  const { error } = await supabase
    .from('app_settings')
    .update({ planning_start_month: nextKey })
    .eq('id', 1)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/demand')
  revalidatePath('/production')
  revalidatePath('/ingredients/demand')
  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Move the planning window back by one month (undo a "complete").
 * Refuses to roll the anchor before today's calendar month so we can't
 * surface months that are already in the past from the system clock's view.
 */
export async function reopenPreviousPlanningMonth(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: current } = await supabase
    .from('app_settings')
    .select('planning_start_month')
    .eq('id', 1)
    .maybeSingle() as { data: { planning_start_month: string | null } | null }

  if (!current?.planning_start_month) {
    return { ok: false, error: 'No completed months to reopen.' }
  }

  const [y, m] = current.planning_start_month.slice(0, 10).split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 2, 1))

  const now = new Date()
  const todayMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  // If reopening would take us at or below today's month, just clear the override.
  const newValue = prev.getTime() <= todayMonth.getTime()
    ? null
    : `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-01`

  const { error } = await supabase
    .from('app_settings')
    .update({ planning_start_month: newValue })
    .eq('id', 1)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/demand')
  revalidatePath('/production')
  revalidatePath('/ingredients/demand')
  revalidatePath('/settings')
  return { ok: true }
}
