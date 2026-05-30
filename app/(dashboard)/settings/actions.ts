'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/constants'
import { computeLoadedNzd, type FxRates } from '@/lib/packaging-cost'
import { recomputeProductPackagingCost } from '@/app/(dashboard)/packaging/actions'

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

  const gstNzRaw    = parseRate(formData.get('gst_nz_pct_input'))    // submitted as percent (e.g. 15)
  const gstAuRaw    = parseRate(formData.get('gst_au_pct_input'))

  // Incoming percents → fractions, clamped to [0, 1]
  const gstNzPct  = gstNzRaw != null ? Math.max(0, Math.min(1, gstNzRaw / 100)) : 0
  const gstAuPct  = gstAuRaw != null ? Math.max(0, Math.min(1, gstAuRaw / 100)) : 0

  // Single FX source — the multi-currency table.
  const fxAud = parseRate(formData.get('fx_rate_aud'))
  const fxUsd = parseRate(formData.get('fx_rate_usd'))
  const fxEur = parseRate(formData.get('fx_rate_eur'))
  const fxGbp = parseRate(formData.get('fx_rate_gbp'))
  const fxRates = {
    NZD: 1.0,
    AUD: fxAud != null && fxAud > 0 ? fxAud : 1.20,
    USD: fxUsd != null && fxUsd > 0 ? fxUsd : 1.62,
    EUR: fxEur != null && fxEur > 0 ? fxEur : 1.78,
    GBP: fxGbp != null && fxGbp > 0 ? fxGbp : 2.05,
  }

  // Keep the legacy single fx_rate column in sync with AUD so any
  // older code path / report still resolves the same value.
  const fxRate = fxRates.AUD

  const { error } = await supabase
    .from('app_settings')
    .update({
      fx_rate:    fxRate,
      fx_rates:   fxRates,
      gst_nz_pct: gstNzPct,
      gst_au_pct: gstAuPct,
      updated_by: profile?.id ?? null,
    })
    .eq('id', 1)

  if (error) {
    redirect('/settings?error=server')
  }

  // Re-stamp every stored loaded cost using the new FX rates. Packaging
  // and ingredients each store a NZD-loaded cost on the row; changing
  // FX in Settings would otherwise leave those values stale (we saw
  // this with AUD pouches keeping their old 1.0833-based total). This
  // is idempotent — items that already match are skipped — so saving
  // Settings with no actual change does no DB writes.
  await refreshAllLoadedCosts(supabase, fxRates)

  // Recalculations cascade from the settings change — revalidate the
  // product list and any product detail pages that display COS/FX.
  revalidatePath('/settings')
  revalidatePath('/products')
  revalidatePath('/products', 'layout')
  redirect('/settings?saved=1')
}

/**
 * Re-derive packaging.total_loaded_cost_nzd and ingredients.total_loaded_cost
 * for every item, using the supplied FX rate table. For packaging, also
 * recomputes the cached product.packaging total on each product whose
 * BOM links to a packaging item that actually changed.
 */
async function refreshAllLoadedCosts(
  supabase: ReturnType<typeof createClient>,
  fxRates: FxRates,
): Promise<void> {
  // ── Packaging ───────────────────────────────────────────────
  const { data: pkgRows } = await supabase
    .from('packaging')
    .select('id, price, currency, fx_rate_override, freight_per_unit_nzd, total_loaded_cost_nzd') as unknown as {
      data: Array<{
        id: string
        price: number | null
        currency: string | null
        fx_rate_override: number | null
        freight_per_unit_nzd: number | null
        total_loaded_cost_nzd: number | null
      }> | null
    }

  const changedPackagingIds: string[] = []
  for (const p of pkgRows ?? []) {
    const fresh = computeLoadedNzd({
      price:                p.price,
      currency:             p.currency,
      fx_rate_override:     p.fx_rate_override,
      freight_per_unit_nzd: p.freight_per_unit_nzd,
    }, fxRates)
    const rounded = Math.round(fresh * 10000) / 10000
    const stored  = Number(p.total_loaded_cost_nzd ?? 0)
    if (Math.abs(rounded - stored) >= 0.00005) {
      await supabase.from('packaging').update({ total_loaded_cost_nzd: rounded }).eq('id', p.id)
      changedPackagingIds.push(p.id)
    }
  }

  // Recompute product.packaging on every product linked to a changed packaging item.
  if (changedPackagingIds.length > 0) {
    const { data: affectedLinks } = await supabase
      .from('product_packaging')
      .select('product_id')
      .in('packaging_id', changedPackagingIds) as { data: Array<{ product_id: string }> | null }
    const productIds = Array.from(new Set((affectedLinks ?? []).map((r) => r.product_id)))
    for (const pid of productIds) {
      await recomputeProductPackagingCost(supabase, pid)
    }
  }

  // ── Ingredients ─────────────────────────────────────────────
  const { data: ingRows } = await supabase
    .from('ingredients')
    .select('id, price, currency, fx_rate_override, freight, total_loaded_cost') as unknown as {
      data: Array<{
        id: string
        price: number | null
        currency: string | null
        fx_rate_override: number | null
        freight: number | null
        total_loaded_cost: number | null
      }> | null
    }

  for (const i of ingRows ?? []) {
    // Reuse the same formula — `freight_per_unit_nzd` here just maps
    // to the ingredient's `freight` column (which is already NZD).
    const fresh = computeLoadedNzd({
      price:                i.price,
      currency:             i.currency,
      fx_rate_override:     i.fx_rate_override,
      freight_per_unit_nzd: i.freight,
    }, fxRates)
    const rounded = Math.round(fresh * 10000) / 10000
    const stored  = Number(i.total_loaded_cost ?? 0)
    if (Math.abs(rounded - stored) >= 0.00005) {
      await supabase.from('ingredients').update({ total_loaded_cost: rounded }).eq('id', i.id)
    }
  }
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
