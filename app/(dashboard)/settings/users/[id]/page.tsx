import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLES } from '@/lib/constants'
import { EditUserForm } from '@/components/users/edit-user-form'

export const metadata: Metadata = { title: 'Edit user' }

interface PageProps {
  params: { id: string }
  searchParams: { saved?: string; error?: string }
}

interface ProfileRow {
  id:         string
  full_name:  string
  role_id:    string
  is_active:  boolean
  created_at: string
  roles:      { id: string; name: string } | null
}
interface RoleOpt { id: string; name: string }

export default async function EditUserPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase
    .from('user_profiles').select('id, roles(name)').eq('id', user.id).single() as { data: { id: string; roles: { name: string } | null } | null }
  if (me?.roles?.name !== ROLES.ADMIN) redirect('/?error=forbidden')

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('user_profiles')
      .select('id, full_name, role_id, is_active, created_at, roles(id, name)')
      .eq('id', params.id)
      .maybeSingle() as unknown as Promise<{ data: ProfileRow | null }>,
    supabase.from('roles').select('id, name').order('name') as unknown as Promise<{ data: RoleOpt[] | null }>,
  ])

  if (!profile) notFound()

  // Email + sign-in info from auth (service role required).
  let email = ''
  let lastSignIn: string | null = null
  let invitePending = false
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.getUserById(profile.id)
    email        = data?.user?.email ?? ''
    lastSignIn   = data?.user?.last_sign_in_at ?? null
    invitePending = data?.user ? !data.user.confirmed_at : false
  } catch {
    /* service role key not set — still render the page with editable role/active */
  }

  return (
    <div className="max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/settings" className="hover:text-gray-900">Settings</Link>
        <span>/</span>
        <Link href="/settings/users" className="hover:text-gray-900">Users</Link>
        <span>/</span>
        <span className="text-gray-900">{profile.full_name}</span>
      </nav>

      <h1 className="text-2xl font-semibold mb-5">{profile.full_name}</h1>

      <EditUserForm
        userId={profile.id}
        currentUserId={user.id}
        roles={roles ?? []}
        initial={{
          full_name: profile.full_name,
          role_id:   profile.role_id,
          role_name: profile.roles?.name ?? null,
          is_active: profile.is_active,
          email,
          last_sign_in_at: lastSignIn,
          invite_pending:  invitePending,
        }}
        savedAt={searchParams.saved === '1'}
        initialError={searchParams.error ?? null}
      />
    </div>
  )
}
