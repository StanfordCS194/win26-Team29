import { Link } from '@tanstack/react-router'
import { LogOut, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'

export default function Header() {
  const { user, loading, error, signInWithGoogle, signOut, clearError } = useAuth()

  return (
    <header className="sticky top-0 z-50 bg-slate-50 text-slate-900 shadow-sm">
      <div className="relative flex min-h-24 w-full items-center px-8 py-6">
        <Link to="/" className="absolute left-[15%] flex -translate-x-1/2 items-center gap-3">
          <img src="/coursetree-icon.png" alt="CourseTree logo" className="h-13 w-13" />
          <span className="text-3xl font-normal">CourseTree</span>
        </Link>
        <div className="ml-auto flex items-center gap-6">
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
            4Y Plan
          </Link>
          <button
            type="button"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Social
          </button>

          {error !== null && error.length > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="rounded font-medium underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-full bg-slate-200" aria-hidden />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <User className="size-4" />
                  <span className="max-w-32 truncate text-left">
                    {user.email ?? user.displayName ?? 'Account'}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    void signOut()
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
              onClick={() => void signInWithGoogle()}
              className="rounded-full px-5 py-2.5"
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
