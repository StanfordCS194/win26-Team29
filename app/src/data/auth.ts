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

/** Query options for cached user. Use in beforeLoad to avoid blocking on repeat navigations. */
export const userQueryOptions = {
  queryKey: ['auth', 'user'] as const,
  queryFn: () => getUser(),
  staleTime: 1000 * 60 * 5, // 5 min — session rarely changes; signOut invalidates explicitly
}

export const signInWithGoogle = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ redirect: z.string().optional() }))
  .handler(async ({ data }) => {
    console.log({
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      APP_URL: process.env.APP_URL,
    })
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    // VERCEL_ENV is 'production' | 'preview' | 'development' when deployed on Vercel, undefined locally.
    // Preview deployments use VERCEL_BRANCH_URL (stable per branch — whitelist with a wildcard in Supabase).
    // Production uses VERCEL_PROJECT_PRODUCTION_URL (the stable custom/vercel.app domain).
    const baseUrl =
      process.env.VERCEL_ENV === 'production'
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_ENV === 'preview'
          ? `https://${process.env.VERCEL_BRANCH_URL}`
          : (process.env.APP_URL ?? 'http://localhost:3000')
    const callbackUrl = new URL('/auth/callback', baseUrl)
    if (data.redirect != null && data.redirect.startsWith('/') && !data.redirect.startsWith('//')) {
      callbackUrl.searchParams.set('redirect', data.redirect)
    }
    const { data: oauthData, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: 'email profile',
        queryParams: {
          // Suggests stanford.edu accounts in the Google account picker.
          // The domain is still enforced server-side in /auth/callback.
          hd: 'stanford.edu',
        },
      },
    })
    if (error) throw error
    return oauthData.url
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

    // Upsert user profile so every signed-in user has a row in the users table.
    // Also refreshes avatar_url on each login in case their Google picture changed.
    const user = data.session?.user
    if (user != null) {
      try {
        const { getServerDb } = await import('@/lib/server-db')
        const db = getServerDb()
        const meta = user.user_metadata as Record<string, unknown> | undefined
        const displayName =
          (typeof meta?.full_name === 'string' ? meta.full_name : null) ?? user.email?.split('@')[0] ?? 'User'
        const avatarUrl =
          (typeof meta?.avatar_url === 'string' && meta.avatar_url) ||
          (typeof meta?.picture === 'string' && meta.picture) ||
          null
        const sunet = user.email?.split('@')[0] ?? ''

        await db
          .insertInto('users')
          .values({
            id: user.id,
            display_name: displayName,
            sunet,
            avatar_url: avatarUrl,
          })
          .onConflict((oc) =>
            oc.column('id').doUpdateSet({
              avatar_url: avatarUrl,
              display_name: displayName,
            }),
          )
          .execute()
      } catch (err) {
        console.error('[ensureUserProfile] error:', err)
      }
    }

    return 'ok'
  })
