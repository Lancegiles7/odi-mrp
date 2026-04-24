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
