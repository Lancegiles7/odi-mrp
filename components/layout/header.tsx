import Link from 'next/link'
import { logout } from '@/app/(auth)/login/actions'
import { formatRoleLabel } from '@/lib/utils'

interface HeaderProps {
  userName: string
  userRole: string | null
}

export function Header({ userName, userRole }: HeaderProps) {
  return (
    <header className="h-14 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Left: breadcrumb slot (populated per-page in future) */}
      <div />

      {/* Right: name → profile link + sign out */}
      <div className="flex items-center gap-5">
        <Link href="/profile" className="text-right group" title="Edit your profile">
          <p className="text-sm font-medium text-gray-900 leading-tight group-hover:text-gray-700 transition-colors">
            {userName}
          </p>
          {userRole && (
            <p className="text-xs text-gray-400 leading-tight mt-0.5">
              {formatRoleLabel(userRole)}
            </p>
          )}
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
