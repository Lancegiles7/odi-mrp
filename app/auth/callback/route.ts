import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase email-link landing route.
 *
 * Handles password recovery, invitations, and magic links — anything that
 * sends the user back to the app with a `?code=…` query parameter. We
 * exchange the code for a session, then send the user where they need
 * to go next:
 *   - recovery / invite → /reset-password (so they can set a password)
 *   - everything else   → home
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')   // 'recovery' | 'invite' | 'magiclink' | 'signup'
  const next = searchParams.get('next')   // optional explicit destination

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=1`)
  }

  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=1`)
  }

  // Force a password set when the link is a recovery or first-time invite.
  if (type === 'recovery' || type === 'invite' || type === 'signup') {
    return NextResponse.redirect(`${origin}/reset-password?first=${type === 'invite' || type === 'signup' ? '1' : '0'}`)
  }

  return NextResponse.redirect(`${origin}${next ?? '/'}`)
}
