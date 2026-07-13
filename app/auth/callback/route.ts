import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase email-link landing route.
 *
 * Handles password recovery, invitations, and magic links. Supports BOTH
 * link styles Supabase can send:
 *   - PKCE:       ?code=…            → exchangeCodeForSession
 *   - Token hash: ?token_hash=…&type → verifyOtp   (the SSR-recommended style;
 *                 works for admin-initiated invites/recovery, which have no
 *                 PKCE verifier cookie in the user's browser)
 *
 * After establishing the session we route the user on:
 *   - recovery / invite / signup → /reset-password (so they set a password)
 *   - everything else            → home (or ?next=)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')   // 'recovery' | 'invite' | 'magiclink' | 'signup'
  const next = searchParams.get('next')    // optional explicit destination

  const supabase = createClient()

  let error: { message: string } | null = null
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code))
  } else if (token_hash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash }))
  } else {
    return NextResponse.redirect(`${origin}/login?error=1`)
  }

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=1`)
  }

  // Force a password set when the link is a recovery or first-time invite.
  if (type === 'recovery' || type === 'invite' || type === 'signup') {
    return NextResponse.redirect(`${origin}/reset-password?first=${type === 'invite' || type === 'signup' ? '1' : '0'}`)
  }

  return NextResponse.redirect(`${origin}${next ?? '/'}`)
}
