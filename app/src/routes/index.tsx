import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ALL_QUARTERS } from '@/data/search/search.types'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const goToSearch = () => {
    void navigate({
      to: '/courses',
      search: {
        query: query.trim(),
        quarters: ALL_QUARTERS,
        ways: [],
        unitsMin: undefined,
        unitsMax: undefined,
      },
    })
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <main className="relative h-full">
        <div className="absolute top-[calc(50%-2rem)] left-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 px-6">
          <label htmlFor="course-search" className="sr-only">
            Search courses
          </label>
          <div className="relative">
            <input
              id="course-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  goToSearch()
                }
              }}
              placeholder="Search by course, instructor, or keyword"
              className="w-full rounded-full border border-slate-300 bg-white py-5 pr-28 pl-6 text-lg text-slate-900 shadow-[0_14px_28px_color-mix(in_srgb,var(--primary)_25%,transparent)] placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
            <button
              type="button"
              onClick={goToSearch}
              aria-label="Search"
              className="absolute top-1/2 right-2 flex h-12 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-5 text-base font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
            >
              Search
            </button>
          </div>
        </div>

        <div className="absolute top-[calc(50%-2rem)] left-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-[calc(100%+6rem)] px-6 text-center">
          <h1 className="text-4xl font-normal text-slate-900 sm:text-5xl">Master Your Schedule.</h1>
        </div>

        <div className="absolute top-[calc(50%-2rem)] left-1/2 w-full max-w-2xl -translate-x-1/2 translate-y-[calc(100%+2rem)] px-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" className="rounded-full px-5 py-2">
              Explore
            </Button>
            <Button variant="outline" className="rounded-full px-5 py-2">
              Popular
            </Button>
            <Button variant="outline" className="rounded-full px-5 py-2">
              New
            </Button>
          </div>
          <p className="mt-5 text-center text-sm text-slate-600">
            Build your perfect course plan with AI-powered recommendations and real-time scheduling.
          </p>
        </div>
      </main>
    </div>
  )
}
