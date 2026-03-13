import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useRouter, useSearch } from '@tanstack/react-router'
import { Loader2, LogOut, User } from 'lucide-react'
import { useCallback, useState } from 'react'

import { signInWithGoogle, signOut, userQueryOptions } from '@/data/auth'
import { ALL_QUARTERS, SEARCH_DEFAULTS, SearchParams } from '@/data/search/search.params'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Header() {
  const { data: user } = useQuery(userQueryOptions)
  const router = useRouter()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read non-Stanford error surfaced via redirect from /auth/callback
  const search = useSearch({ strict: false }) as Record<string, string | undefined>
  const authError = search.authError === 'not-stanford' ? 'Only @stanford.edu accounts can sign in.' : null
  const displayError = error ?? authError

  const handleSignIn = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      // Use window.location to get path+search as a string (location.search is a parsed object in TanStack Router)
      const redirect =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : location.pathname
      const url = await signInWithGoogle({ data: { redirect: redirect === '/' ? undefined : redirect } })
      if (url) window.location.href = url
    } catch {
      setError('Sign-in failed. Please try again.')
      setLoading(false)
    }
  }, [location.pathname])

  const handleSignOut = useCallback(async () => {
    await signOut()
    await queryClient.invalidateQueries({ queryKey: userQueryOptions.queryKey })
    await router.invalidate()
  }, [queryClient, router])

  return (
    <header className="sticky top-0 z-50 bg-slate-50 text-slate-900 shadow-sm">
      <div className="relative flex h-[var(--header-height)] w-full items-center px-8 py-4">
        <Link to="/" className="absolute left-[15%] flex -translate-x-1/2 items-center gap-2.5">
          <img src="/coursetree-icon.png" alt="CourseTree logo" className="h-10 w-10" />
          <span className="text-2xl font-normal">CourseTree</span>
        </Link>
        <div className="ml-auto flex items-center gap-6">
          <Link
            to="/courses"
            search={{ ...SEARCH_DEFAULTS, quarters: ALL_QUARTERS } as unknown as Required<SearchParams>}
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Courses
          </Link>
          <Link
            to="/schedule"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Schedule
          </Link>
          <Link
            to="/plan"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Plan
          </Link>
          <Link
            to="/social"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Social
          </Link>

          {displayError !== null && displayError.length > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              <span>{displayError}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded font-medium underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                <User className="size-4" />
                <span className="max-w-32 truncate text-left">
                  {user.user_metadata?.full_name ?? user.email ?? 'Account'}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    void handleSignOut()
                  }}
                  className="cursor-pointer"
                >
                  <LogOut className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={loading}
              variant={loading ? 'outline' : 'default'}
              className="rounded-full px-5 py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
