'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Self-service profile actions — every authenticated user can use these
 * regardless of role. RLS still protects against tampering: the
 * user_profiles update is scoped to `auth.uid()` and Supabase's
 * `updateUser` mutates only the signed-in user's password.
 */

export async function updateMyProfile(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = ((formData.get('full_name') as string | null) ?? '').trim()
  if (!fullName) return { ok: false, error: 'Full name is required' }

  const { error } = await supabase
    .from('user_profiles')
    .update({ full_name: fullName } as never)
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }

  // Header re-renders with the new name on next nav — revalidate the layout
  // by touching the dashboard root + profile pages.
  revalidatePath('/profile')
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function changeMyPassword(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const newPassword     = ((formData.get('new_password') as string | null) ?? '').trim()
  const confirmPassword = ((formData.get('confirm_password') as string | null) ?? '').trim()

  if (newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters' }
  if (newPassword !== confirmPassword) return { ok: false, error: 'Passwords don\'t match' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}
