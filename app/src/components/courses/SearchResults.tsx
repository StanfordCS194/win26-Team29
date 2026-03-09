import { Route } from '@/routes/courses'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { searchQueryOptions } from './courses-query-options'
import { CourseCard } from './CourseCard'
import { PaginationControls } from './PaginationControls'
import { PAGE_SIZE } from '@/data/search/search.query'

import type { EvalSlug } from '@/data/search/eval-questions'
import type { SearchParams } from '@/data/search/search.params'
import { AppliedFilterBadges } from './AppliedFilterBadges'
import { hasActiveFilters } from './use-clear-all-filters'

type SearchResultsProps = {
  visibleEvalSlugs: EvalSlug[]
  committedSearch: SearchParams
  onCommit: (s: SearchParams) => void
}

export function SearchResults({ visibleEvalSlugs, committedSearch, onCommit }: SearchResultsProps) {
  const search = Route.useSearch()
  const queryClient = useQueryClient()
  const bottomPrefetchRef = useRef<HTMLDivElement | null>(null)
  const lastPrefetchedPageRef = useRef<number | null>(null)

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    ...searchQueryOptions(search, queryClient),
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (!isPlaceholderData && !isPending) {
      onCommit(search)
    }
  }, [isPlaceholderData, isPending, search, onCommit])

  const results = data?.results
  const totalCount = data?.totalCount ?? 0
  const hasMore = totalCount > search.page * PAGE_SIZE
  const nextPage = search.page + 1

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    })
  }, [search.page])

  useEffect(() => {
    const target = bottomPrefetchRef.current
    if (target == null || !hasMore || isPlaceholderData) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting) return
        if (lastPrefetchedPageRef.current === nextPage) return
        lastPrefetchedPageRef.current = nextPage
        void queryClient.prefetchQuery(searchQueryOptions({ ...search, page: nextPage }, queryClient))
      },
      { rootMargin: '240px 0px' },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isPlaceholderData, nextPage, queryClient, search])

  if (isPending) {
    return <p className="py-8 text-center text-sm text-slate-500">Searching…</p>
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-red-600">Something went wrong — {error?.message ?? 'please try again.'}</p>
      </div>
    )
  }

  if (results === undefined || results.length === 0) {
    const hasQuery = Boolean(committedSearch.query)
    const hasFilters = hasActiveFilters(committedSearch)

    return (
      <div className={`transition-opacity duration-150 ${isPlaceholderData ? 'opacity-60' : 'opacity-100'}`}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-semibold text-slate-800">
            {hasQuery ? `No matches found for "${committedSearch.query}".` : 'No courses match your filters.'}
          </p>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            {hasQuery
              ? hasFilters
                ? 'Try a different search term or loosen your filters.'
                : 'Try a different search term.'
              : 'Try adjusting or clearing some of your filters.'}
          </p>
          {hasFilters && (
            <div className="mt-4 w-full max-w-lg text-left">
              <AppliedFilterBadges centered large committedSearch={committedSearch} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className={`transition-opacity duration-150 ${isPlaceholderData ? 'opacity-60' : 'opacity-100'}`}>
        {results.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            selectedQuarters={search.quarters}
            visibleEvalSlugs={visibleEvalSlugs}
          />
        ))}
        <PaginationControls page={search.page} totalCount={totalCount} />
        <div ref={bottomPrefetchRef} aria-hidden className="h-12 w-full" />
      </div>
    </TooltipProvider>
  )
}

export function SearchResultsContainer({ visibleEvalSlugs, committedSearch, onCommit }: SearchResultsProps) {
  return (
    <div className="flex flex-col gap-4">
      <SearchResults
        visibleEvalSlugs={visibleEvalSlugs}
        committedSearch={committedSearch}
        onCommit={onCommit}
      />
    </div>
  )
}
