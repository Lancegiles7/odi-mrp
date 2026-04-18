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
    .select('full_name, role_id, roles(name)')
    .eq('id', user.id)
    .single()

  const roleName = (profile?.roles as { name: string } | null)?.name ?? null

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
