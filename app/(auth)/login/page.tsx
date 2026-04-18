import type { Metadata } from 'next'
import { login } from './actions'

export const metadata: Metadata = {
  title: 'Sign In',
}

interface LoginPageProps {
  searchParams: { error?: string }
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const hasError = searchParams.error === '1'

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-md bg-gray-900 flex items-center justify-center">
              <span className="text-white text-sm font-bold">O</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">Odi MRP</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
          <p className="text-sm text-gray-500 mt-1">
            Use your company email and password.
          </p>
        </div>

        {/* Error message */}
        {hasError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">
              Invalid email or password. Please try again.
            </p>
          </div>
        )}

        {/* Form */}
        <form action={login} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
              placeholder="you@odi.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-800 active:bg-gray-950 transition-colors mt-2"
          >
            Sign in
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Internal system — authorised users only
      </p>
    </div>
  )
}
