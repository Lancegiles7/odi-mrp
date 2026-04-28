import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setNewPassword } from './actions'

export const metadata: Metadata = { title: 'Set password' }

interface PageProps {
  searchParams: { first?: string; error?: string }
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  // The user must already have a Supabase session here — exchanged from
  // the email-link code by /auth/callback. Without one, kick to login.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isFirstTime = searchParams.first === '1'
  const hasError = searchParams.error === '1'

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-md bg-gray-900 flex items-center justify-center">
              <span className="text-white text-sm font-bold">O</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">Odi MRP</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            {isFirstTime ? 'Welcome — set your password' : 'Set a new password'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isFirstTime
              ? `Choose a password for ${user.email}. You'll use it to sign in from now on.`
              : `Choose a new password for ${user.email}.`}
          </p>
        </div>

        {hasError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">
              Could not save the password. Make sure it's at least 8 characters and try again.
            </p>
          </div>
        )}

        <form action={setNewPassword} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
              placeholder="Re-enter the same password"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-800 active:bg-gray-950 transition-colors mt-2"
          >
            {isFirstTime ? 'Set password & sign in' : 'Save new password'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Internal system — authorised users only
      </p>
    </div>
  )
}
