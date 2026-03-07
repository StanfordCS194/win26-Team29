import { getCookies, setCookie } from '@tanstack/react-start/server'
import { createServerClient } from '@supabase/ssr'

export function getSupabaseServerClient() {
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }))
      },
      setAll(cookies) {
        cookies.forEach((cookie) => setCookie(cookie.name, cookie.value))
      },
    },
  })
}

export const ALLOWED_EMAIL_DOMAIN = 'stanford.edu'

export function isAllowedEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase().split('@')[1] === ALLOWED_EMAIL_DOMAIN
}
