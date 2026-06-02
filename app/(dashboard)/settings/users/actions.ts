'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLES } from '@/lib/constants'

/**
 * User-management server actions, admin-only.
 *
 * - inviteUser:   sends a Supabase invite email + creates a user_profiles row
 * - updateUser:   updates full_name / role_id / is_active for an existing user
 * - resendInvite: resends the invite email (Supabase generates a new link)
 * - hardDeleteUser: only allowed if no records reference the user as
 *                   created_by (we list the tables to check). Otherwise the
 *                   admin must deactivate instead — preserves audit trail.
 *
 * All actions go through requireAdmin() so a non-admin server-side caller
 * is rejected even if they somehow bypass the UI.
 */

interface AdminContext {
  supabase:   ReturnType<typeof createClient>
  profileId:  string
  userId:     string
}

async function requireAdmin(): Promise<AdminContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, roles(name)')
    .eq('id', user.id)
    .single() as { data: { id: string; roles: { name: string } | null } | null }

  if (profile?.roles?.name !== ROLES.ADMIN) redirect('/?error=forbidden')
  return { supabase, profileId: profile.id, userId: user.id }
}

// ────────────────────────────────────────────────────────────
// Invite a new user
// ────────────────────────────────────────────────────────────
export async function inviteUser(formData: FormData): Promise<{ ok: boolean; error?: string; userId?: string }> {
  await requireAdmin()

  const fullName = ((formData.get('full_name') as string | null) ?? '').trim()
  const email    = ((formData.get('email') as string | null) ?? '').trim().toLowerCase()
  const roleId   = ((formData.get('role_id') as string | null) ?? '').trim()

  if (!fullName) return { ok: false, error: 'Full name is required' }
  if (!email)    return { ok: false, error: 'Email is required' }
  if (!roleId)   return { ok: false, error: 'Role is required' }

  let admin
  try { admin = createAdminClient() }
  catch (e) { return { ok: false, error: (e as Error).message } }

  // Send the invite — Supabase emails the user a magic link to /auth/callback,
  // which routes to /reset-password where they set their initial password.
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  })

  if (inviteErr || !invited?.user) {
    // Most common failure: user already exists in auth.users. Surface clearly.
    return { ok: false, error: inviteErr?.message ?? 'Invite failed' }
  }

  // Create the user_profiles row (RLS bypass via service role).
  const { error: profileErr } = await admin
    .from('user_profiles')
    .insert({
      id:        invited.user.id,
      full_name: fullName,
      role_id:   roleId,
      is_active: true,
    } as never)

  if (profileErr) {
    // Roll back the auth invite so the system doesn't end up with an
    // orphaned auth user with no profile (which would prevent re-inviting).
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => {})
    return { ok: false, error: `Profile create failed: ${profileErr.message}` }
  }

  revalidatePath('/settings/users')
  return { ok: true, userId: invited.user.id }
}

// ────────────────────────────────────────────────────────────
// Update an existing user's profile
// ────────────────────────────────────────────────────────────
export async function updateUser(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { userId: actingUserId } = await requireAdmin()

  const id        = ((formData.get('id') as string | null) ?? '').trim()
  const fullName  = ((formData.get('full_name') as string | null) ?? '').trim()
  const roleId    = ((formData.get('role_id') as string | null) ?? '').trim()
  const isActive  = formData.get('is_active') === 'on'

  if (!id)       return { ok: false, error: 'Missing user id' }
  if (!fullName) return { ok: false, error: 'Full name is required' }
  if (!roleId)   return { ok: false, error: 'Role is required' }

  // Belt-and-braces: don't let an admin demote themselves and lock everyone
  // out. (They can still demote via DB if truly needed.)
  if (id === actingUserId) {
    // Look up the requested role to see if it's still admin.
    const supabase = createClient()
    const { data: targetRole } = await supabase
      .from('roles').select('name').eq('id', roleId).maybeSingle() as { data: { name: string } | null }
    if (targetRole?.name !== ROLES.ADMIN) {
      return { ok: false, error: 'You can\'t change your own role away from Admin. Ask another admin to do it.' }
    }
    if (!isActive) {
      return { ok: false, error: 'You can\'t deactivate yourself.' }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_profiles')
    .update({ full_name: fullName, role_id: roleId, is_active: isActive } as never)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/users')
  revalidatePath(`/settings/users/${id}`)
  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// Resend the invite email
// ────────────────────────────────────────────────────────────
export async function resendInvite(userId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  if (!userId) return { ok: false, error: 'Missing user id' }

  let admin
  try { admin = createAdminClient() }
  catch (e) { return { ok: false, error: (e as Error).message } }

  // Fetch the user's email from auth (we don't store email on user_profiles).
  const { data: u, error: fetchErr } = await admin.auth.admin.getUserById(userId)
  if (fetchErr || !u?.user?.email) return { ok: false, error: fetchErr?.message ?? 'User not found' }

  const { error } = await admin.auth.admin.inviteUserByEmail(u.user.email)
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// Hard-delete a user (only if no records reference them)
// ────────────────────────────────────────────────────────────
const TABLES_WITH_CREATED_BY = [
  'products', 'ingredients', 'suppliers', 'purchase_orders', 'boms', 'stock_movements',
  // History tables added later — all reference user_profiles via created_by / changed_by.
  'product_opening_stock_history', 'demand_opening_stock_history', 'demand_cell_comments',
  'ingredient_price_history',
  // Reference data
  'po_issuers', 'po_companies',
] as const

export async function hardDeleteUser(userId: string): Promise<{ ok: boolean; error?: string; references?: { table: string; count: number }[] }> {
  const { userId: actingUserId } = await requireAdmin()
  if (!userId) return { ok: false, error: 'Missing user id' }
  if (userId === actingUserId) return { ok: false, error: 'You can\'t delete yourself.' }

  const admin = createAdminClient()

  // Count references across every table that tracks a created_by / changed_by.
  // We only check columns we know exist — the cheapest correct guard.
  const references: { table: string; count: number }[] = []
  for (const table of TABLES_WITH_CREATED_BY) {
    // Try created_by; if the table uses a different column, the query returns
    // count=0 (we ignore errors silently — worst case the delete is blocked
    // anyway by FK constraints).
    const { count, error } = await admin
      .from(table as never)
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId) as unknown as { count: number | null; error: { message: string } | null }
    if (error) continue
    if ((count ?? 0) > 0) references.push({ table, count: count! })
  }

  // Also check changed_by columns on the history tables.
  const historyTables = ['product_opening_stock_history', 'demand_opening_stock_history']
  for (const table of historyTables) {
    const { count, error } = await admin
      .from(table as never)
      .select('*', { count: 'exact', head: true })
      .eq('changed_by', userId) as unknown as { count: number | null; error: { message: string } | null }
    if (error) continue
    if ((count ?? 0) > 0) {
      const existing = references.find((r) => r.table === table)
      if (existing) existing.count += count!
      else          references.push({ table, count: count! })
    }
  }

  if (references.length > 0) {
    const total = references.reduce((s, r) => s + r.count, 0)
    return {
      ok: false,
      error: `Cannot delete: this user is referenced by ${total} record${total === 1 ? '' : 's'} across ${references.length} table${references.length === 1 ? '' : 's'}. Deactivate them instead to preserve the audit trail.`,
      references,
    }
  }

  // Delete the auth user — the user_profiles row is removed via the ON DELETE
  // CASCADE on user_profiles.id → auth.users(id).
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) return { ok: false, error: delErr.message }

  revalidatePath('/settings/users')
  return { ok: true }
}
