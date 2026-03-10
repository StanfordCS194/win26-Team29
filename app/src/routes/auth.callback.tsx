import { createFileRoute, redirect } from '@tanstack/react-router'

import { handleAuthCallback } from '@/data/auth'

/** Validates redirect path to prevent open redirects. Only allows relative paths starting with / */
function getSafeRedirect(search: URLSearchParams): { pathname: string; search: Record<string, string> } {
  const r = search.get('redirect')
  if (r === null || r === '' || !r.startsWith('/') || r.startsWith('//')) return { pathname: '/', search: {} }
  const parsed = new URL(r, 'https://x')
  const searchObj = Object.fromEntries(parsed.searchParams)
  return { pathname: parsed.pathname, search: searchObj }
}

export const Route = createFileRoute('/auth/callback')({
  loader: async ({ location }) => {
    const search = new URLSearchParams(location.search)
    const code = search.get('code')
    if (code == null || code === '') throw redirect({ to: '/' })

    const result = await handleAuthCallback({ data: { code } })
    const { pathname, search: redirectSearch } = getSafeRedirect(search)

    if (result === 'not-stanford') {
      throw redirect({ to: pathname, search: { ...redirectSearch, authError: 'not-stanford' } })
    }

    throw redirect({ to: pathname, search: redirectSearch })
  },
  component: () => null,
})
