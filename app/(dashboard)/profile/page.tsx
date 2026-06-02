import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/profile/profile-form'

export const metadata: Metadata = { title: 'My profile' }

export default async function MyProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, role_id, roles(name)')
    .eq('id', user.id)
    .single() as { data: { full_name: string; role_id: string; roles: { name: string } | null } | null }

  const roleName = profile?.roles?.name ?? null

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">My profile</h1>
      <p className="text-sm text-gray-500 mb-6">Update your name or change your password.</p>

      <ProfileForm
        email={user.email ?? ''}
        fullName={profile?.full_name ?? ''}
        roleName={roleName}
      />
    </div>
  )
}
