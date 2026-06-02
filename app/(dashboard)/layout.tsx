import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-braces guard — middleware handles this, but be explicit
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, role_id, is_active, roles(name)')
    .eq('id', user.id)
    .single() as unknown as { data: { full_name: string; role_id: string; is_active: boolean; roles: { name: string } | null } | null }

  // Deactivated users are signed out immediately and bounced to the login
  // page with a clear message. (Belt-and-braces — RLS would block their
  // queries anyway, but it's nicer to fail fast at the front door.)
  if (profile && !profile.is_active) {
    await supabase.auth.signOut()
    redirect('/login?error=deactivated')
  }

  const roleName = profile?.roles?.name ?? null

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar userRole={roleName} />

      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          userName={profile?.full_name ?? user.email ?? ''}
          userRole={roleName}
        />

        <main className="flex-1 overflow-auto p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  )
}
