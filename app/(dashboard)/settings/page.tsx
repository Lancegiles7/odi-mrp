import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppSettings } from '@/lib/settings'
import { ROLES } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'
import { updateSettings } from './actions'

export const metadata: Metadata = { title: 'Settings' }

interface PageProps {
  searchParams: { saved?: string; error?: string }
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('roles(name)')
    .eq('id', user.id)
    .single() as { data: { roles: { name: string } | null } | null }

  const roleName = profile?.roles?.name ?? null
  if (roleName !== ROLES.ADMIN) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-4 text-sm text-gray-600">
          You need the <span className="font-medium">Admin</span> role to view or change global settings.
        </p>
      </div>
    )
  }

  const settings = await getAppSettings()

  // Count products that currently have apply_fx = true so the admin
  // knows how many NZ totals will be restated by an FX change.
  const { count: fxAffected } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('apply_fx', true)
    .eq('is_active', true)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Global settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          These values affect every product and BOM calculation. Admin-only.
        </p>
      </div>

      {searchParams.saved && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Settings saved. Product costs have been recalculated.
        </div>
      )}
      {searchParams.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Could not save — please try again.
        </div>
      )}

      <form action={updateSettings} className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold">Currency exchange</h2>
            <p className="text-xs text-gray-500 mt-1">
              Applied when a product has &ldquo;Apply FX&rdquo; set to Yes. NZ grand total = base cost × FX rate.
            </p>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-600 text-xs font-medium">FX rate (AUD → NZD)</span>
              <input
                name="fx_rate"
                type="number"
                step="0.0001"
                min="0"
                required
                defaultValue={Number(settings.fx_rate).toFixed(4)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </label>
            <div className="text-xs text-gray-500 self-end pb-2">
              Last updated {formatDateTime(settings.updated_at)}
            </div>
          </div>
          {fxAffected != null && fxAffected > 0 && (
            <div className="mx-5 mb-5 text-xs text-amber-700 bg-amber-50 rounded p-3">
              <span className="font-semibold">Heads up:</span>{' '}
              {fxAffected} product{fxAffected === 1 ? '' : 's'} currently {fxAffected === 1 ? 'has' : 'have'} &ldquo;Apply FX&rdquo; enabled. Saving will recalculate {fxAffected === 1 ? 'its' : 'their'} NZ grand total and COS NZ.
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold">Tax / GST</h2>
            <p className="text-xs text-gray-500 mt-1">
              Used to strip GST from RRP when calculating COS %.
            </p>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-600 text-xs font-medium">NZ GST rate</span>
              <div className="mt-1 flex">
                <input
                  name="gst_nz_pct_input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  defaultValue={(Number(settings.gst_nz_pct) * 100).toFixed(2)}
                  className="w-full border border-gray-300 rounded-l-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="px-3 py-1.5 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm text-gray-500">%</span>
              </div>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 text-xs font-medium">AU GST rate</span>
              <div className="mt-1 flex">
                <input
                  name="gst_au_pct_input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  defaultValue={(Number(settings.gst_au_pct) * 100).toFixed(2)}
                  className="w-full border border-gray-300 rounded-l-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="px-3 py-1.5 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm text-gray-500">%</span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/"
            className="px-3 py-1.5 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  )
}
