import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Validates the JWT against Supabase's public keys on every call.
// Never use getSession() in server code — it reads from the cookie without JWT validation.
export const getUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getSupabaseServerClient } = await import('@/lib/supabase.server')
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const signInWithGoogle = createServerFn({ method: 'GET' }).handler(async () => {
  const { getSupabaseServerClient } = await import('@/lib/supabase.server')
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${
        process.env.VITE_VERCEL_BRANCH_URL != null
          ? `https://${process.env.VITE_VERCEL_BRANCH_URL}`
          : process.env.VITE_VERCEL_URL != null
            ? `https://${process.env.VITE_VERCEL_URL}`
            : (process.env.APP_URL ?? 'http://localhost:3000')
      }/auth/callback`,
      scopes: 'email profile',
      queryParams: {
        // Suggests stanford.edu accounts in the Google account picker.
        // The domain is still enforced server-side in /auth/callback.
        hd: 'stanford.edu',
      },
    },
  })
  if (error) throw error
  return data.url
})

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const { getSupabaseServerClient } = await import('@/lib/supabase.server')
  const supabase = getSupabaseServerClient()
  await supabase.auth.signOut()
})

// Called from the /auth/callback route loader after Google OAuth redirect.
// Returns 'ok' on success, 'not-stanford' if the email domain is rejected.
export const handleAuthCallback = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ code: z.string() }))
  .handler(async ({ data: { code } }): Promise<'ok' | 'not-stanford'> => {
    const { getSupabaseServerClient, isAllowedEmail } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error !== null || !isAllowedEmail(data.session?.user.email)) {
      await supabase.auth.signOut()
      return 'not-stanford'
    }
    return 'ok'
  })
