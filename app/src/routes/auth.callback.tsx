import { createFileRoute, redirect } from '@tanstack/react-router'

import { handleAuthCallback } from '@/data/auth'

export const Route = createFileRoute('/auth/callback')({
  loader: async ({ location }) => {
    const code = new URLSearchParams(location.search).get('code')
    if (code == null || code === '') throw redirect({ to: '/' })

    const result = await handleAuthCallback({ data: { code } })
    if (result === 'not-stanford') {
      throw redirect({ to: '/', search: { authError: 'not-stanford' } })
    }

    throw redirect({ to: '/' })
  },
  component: () => null,
})
