import { Route } from '@/routes/courses'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebouncer } from '@tanstack/react-pacer'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { searchQueryOptions } from './courses-query-options'
import { SearchParams, MAX_QUERY_LENGTH } from '@/data/search/search.params'
import { useClearAllFilters, hasActiveFilters } from './use-clear-all-filters'

export function SearchBar() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(search.query)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    setValue(search.query)
  }, [search.query])

  const normalizeQuery = (v: string) => v.trim().replace(/\./g, '')

  const prefetchDebouncer = useDebouncer(
    (normalized: string) => {
      void queryClient.prefetchQuery(searchQueryOptions({ ...search, query: normalized, page: 1 }))
    },
    { wait: 325, enabled: value.trim().length > 0 },
  )

  const clearAllFilters = useClearAllFilters()
  const hasFilters = hasActiveFilters(search)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.key === 'Delete' || e.key === 'Backspace') || !e.shiftKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      e.preventDefault()
      clearAllFilters()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearAllFilters])

  const { data } = useQuery({ ...searchQueryOptions(search), enabled: false })
  const hasNoResults = (data?.totalCount ?? -1) === 0

  const showHint = isFocused && hasFilters && hasNoResults

  const isQueryUnchanged = normalizeQuery(value) === search.query

  const commitSearch = () => {
    prefetchDebouncer.cancel()
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          query: normalizeQuery(value),
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        commitSearch()
      }}
    >
      <label htmlFor="courses-search" className="sr-only">
        Search courses
      </label>
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
      />
      <Input
        id="courses-search"
        name="query"
        type="text"
        value={value}
        maxLength={MAX_QUERY_LENGTH}
        onChange={(e) => {
          setValue(e.target.value)
          const normalized = normalizeQuery(e.target.value)
          if (normalized.length > 0) {
            prefetchDebouncer.maybeExecute(normalized)
          } else {
            prefetchDebouncer.cancel()
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) {
            e.preventDefault()
            clearAllFilters()
          }
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false)
          commitSearch()
        }}
        placeholder="Search courses"
        className={`h-10 rounded-full border-slate-300 bg-white pl-11 text-base shadow-sm transition-[padding] placeholder:text-slate-400 ${showHint ? 'pr-48' : 'pr-24'}`}
      />
      {showHint && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-[5rem] flex -translate-y-1/2 animate-pulse items-center gap-0.5 [animation-duration:2.5s]"
        >
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-1 font-sans text-sm leading-none tracking-widest text-slate-500 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
            ⇧ ⌫
          </kbd>
          <span className="font-sans text-sm text-slate-400">Clear Filters</span>
        </div>
      )}
      <Button
        type="submit"
        disabled={isQueryUnchanged}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100"
      >
        Search
      </Button>
    </form>
  )
}
