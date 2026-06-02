import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLES } from '@/lib/constants'
import { UserAvatar } from '@/components/users/user-avatar'
import { InviteUserButton } from '@/components/users/invite-user-button'

export const metadata: Metadata = { title: 'Users' }

interface ProfileRow {
  id:         string
  full_name:  string
  role_id:    string
  is_active:  boolean
  created_at: string
  roles:      { name: string } | null
}
interface RoleOpt { id: string; name: string }
interface AuthDetails { email: string; last_sign_in_at: string | null; invited_at: string | null; confirmed_at: string | null }

function roleChipClasses(role: string | null): string {
  switch (role) {
    case ROLES.ADMIN:        return 'bg-purple-100 text-purple-800'
    case ROLES.OPERATIONS:   return 'bg-blue-100 text-blue-800'
    case ROLES.SUPPLY_CHAIN: return 'bg-emerald-100 text-emerald-800'
    case ROLES.FINANCE:      return 'bg-amber-100 text-amber-800'
    case ROLES.READ_ONLY:    return 'bg-gray-100 text-gray-700'
    default:                 return 'bg-gray-100 text-gray-500'
  }
}

function avatarColour(role: string | null): 'purple' | 'blue' | 'emerald' | 'amber' | 'gray' {
  switch (role) {
    case ROLES.ADMIN:        return 'purple'
    case ROLES.OPERATIONS:   return 'blue'
    case ROLES.SUPPLY_CHAIN: return 'emerald'
    case ROLES.FINANCE:      return 'amber'
    default:                 return 'gray'
  }
}

function formatRoleLabel(name: string | null): string {
  if (!name) return '—'
  return name.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-NZ', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default async function UsersPage({ searchParams }: { searchParams: { invited?: string; error?: string } }) {
  // Admin-only gate
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase
    .from('user_profiles').select('id, roles(name)').eq('id', user.id).single() as { data: { id: string; roles: { name: string } | null } | null }
  if (me?.roles?.name !== ROLES.ADMIN) redirect('/?error=forbidden')

  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from('user_profiles')
      .select('id, full_name, role_id, is_active, created_at, roles(name)')
      .order('is_active', { ascending: false })
      .order('full_name') as unknown as Promise<{ data: ProfileRow[] | null }>,
    supabase.from('roles')
      .select('id, name')
      .order('name') as unknown as Promise<{ data: RoleOpt[] | null }>,
  ])

  // Fetch email + last sign-in details via the admin API (no auth.users view
  // exposed through the anon client).
  const authDetailsById = new Map<string, AuthDetails>()
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of data?.users ?? []) {
      authDetailsById.set(u.id, {
        email:           u.email ?? '',
        last_sign_in_at: u.last_sign_in_at ?? null,
        invited_at:      u.invited_at ?? null,
        confirmed_at:    u.confirmed_at ?? null,
      })
    }
  } catch {
    /* Service role key not set — show the page but with blank emails. The
       InviteUserButton will surface a clearer error if the admin tries to
       actually invite someone. */
  }

  const rows = profiles ?? []
  const activeCount   = rows.filter((r) => r.is_active).length
  const inactiveCount = rows.length - activeCount

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/settings" className="hover:text-gray-900">Settings</Link>
            <span>/</span>
            <span className="text-gray-900">Users</span>
          </nav>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} active{inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ''} · {rows.length} total
          </p>
        </div>
        <InviteUserButton roles={roles ?? []} />
      </div>

      {searchParams.invited && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm text-emerald-800">
          Invite sent. They&rsquo;ll receive an email with a link to set their password.
        </div>
      )}
      {searchParams.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-5 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium w-[140px]">Role</th>
              <th className="text-left px-3 py-2 font-medium w-[140px]">Status</th>
              <th className="text-left px-3 py-2 font-medium w-[160px]">Last sign-in</th>
              <th className="w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {rows.map((r) => {
              const auth = authDetailsById.get(r.id)
              const roleName = r.roles?.name ?? null
              const isMe = r.id === user.id
              const isInvitedPending = auth ? !auth.confirmed_at : false
              return (
                <tr key={r.id} className={`border-t border-gray-100 hover:bg-gray-50 ${r.is_active ? '' : 'opacity-60'}`}>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={r.full_name} colour={avatarColour(roleName)} />
                      <div className="font-medium">
                        {r.full_name}
                        {isMe && <span className="ml-1 text-[10px] text-gray-400">(you)</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{auth?.email ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded font-medium text-[11px] ${roleChipClasses(roleName)}`}>
                      {formatRoleLabel(roleName)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {!r.is_active ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>
                    ) : isInvitedPending ? (
                      <>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Invited</span>
                        <div className="text-[10px] text-gray-500 mt-0.5">not yet accepted</div>
                      </>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-[12px]">{formatWhen(auth?.last_sign_in_at ?? null)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={`/settings/users/${r.id}`} className="text-xs text-blue-600 hover:underline font-medium">Edit</Link>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
