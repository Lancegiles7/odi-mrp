import { createClient as createBaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

/**
 * Service-role Supabase client. Bypasses RLS — only use server-side, never
 * expose to the browser. Required for:
 *   • supabase.auth.admin.inviteUserByEmail()  — sending invite emails
 *   • supabase.auth.admin.deleteUser()         — hard-deleting auth users
 *
 * Falls back to throwing a clear error if SUPABASE_SERVICE_ROLE_KEY is
 * missing in the environment (the deploy needs that env var set in Vercel
 * — paste once, never expose to client code).
 */
export function createAdminClient() {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Service-role Supabase client unavailable: SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Add it in Vercel → Project → Settings → Environment Variables, then redeploy.',
    )
  }
  return createBaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
