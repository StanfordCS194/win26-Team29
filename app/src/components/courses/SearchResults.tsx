import { Route } from '@/routes/courses'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { isEvalSortOption } from '@/data/search/eval-metrics'
import { extractEvalFilters } from '@/data/search/search.types'
import { searchQueryOptions } from './courses-query-options'
import { CourseCard } from './CourseCard'
import { PaginationControls } from './PaginationControls'

import type { EvalSlug } from '@/data/search/eval-questions'

type SearchResultsProps = {
  alwaysVisibleEvalSlugs: EvalSlug[]
}

export function SearchResults({ alwaysVisibleEvalSlugs }: SearchResultsProps) {
  const search = Route.useSearch()
  const { query, year, quarters, ways, unitsMin, unitsMax, sort, order, page } = search
  const queryClient = useQueryClient()
  const resultsTopRef = useRef<HTMLDivElement | null>(null)
  const bottomPrefetchRef = useRef<HTMLDivElement | null>(null)
  const previousPageRef = useRef<number | null>(null)
  const lastPrefetchedPageRef = useRef<number | null>(null)
  const evalFilters = extractEvalFilters(search)
  const visibleEvalSlugs = useMemo(() => {
    const combined = new Set<EvalSlug>(alwaysVisibleEvalSlugs)
    if (isEvalSortOption(sort)) combined.add(sort)
    for (const filter of evalFilters) combined.add(filter.slug)
    return EVAL_QUESTION_SLUGS.filter((slug) => combined.has(slug))
  }, [alwaysVisibleEvalSlugs, evalFilters, sort])

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    ...searchQueryOptions(query, year, quarters, ways, unitsMin, unitsMax, sort, order, evalFilters, page),
    placeholderData: keepPreviousData,
  })

  const results = data?.results
  const hasMore = data?.hasMore ?? false
  const nextPage = page + 1

  useEffect(() => {
    if (previousPageRef.current !== null && previousPageRef.current !== page) {
      const topAnchor = document.querySelector('[data-search-top-anchor]')
      const resultsTop = resultsTopRef.current
      const targetElement =
        topAnchor instanceof HTMLElement ? topAnchor : resultsTop instanceof HTMLElement ? resultsTop : null
      if (targetElement != null) {
        const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0
        const targetY = window.scrollY + targetElement.getBoundingClientRect().top - headerHeight - 12
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' })
      }
    }
    previousPageRef.current = page
  }, [page])

  useEffect(() => {
    const target = bottomPrefetchRef.current
    if (target == null || !hasMore || isPlaceholderData) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting) return
        if (lastPrefetchedPageRef.current === nextPage) return
        lastPrefetchedPageRef.current = nextPage
        void queryClient.prefetchQuery(
          searchQueryOptions(
            query,
            year,
            quarters,
            ways,
            unitsMin,
            unitsMax,
            sort,
            order,
            evalFilters,
            nextPage,
          ),
        )
      },
      { rootMargin: '240px 0px' },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [
    evalFilters,
    hasMore,
    isPlaceholderData,
    nextPage,
    order,
    page,
    query,
    queryClient,
    quarters,
    sort,
    unitsMax,
    unitsMin,
    ways,
    year,
  ])

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
    return (
      <p className="text-sm text-slate-600">
        {query ? `No matches found for "${query}".` : 'No courses match your filters.'}
      </p>
    )
  }

  return (
    <TooltipProvider>
      <div
        ref={resultsTopRef}
        className={`transition-opacity duration-150 ${isPlaceholderData ? 'opacity-60' : 'opacity-100'}`}
      >
        {results.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            selectedQuarters={quarters}
            visibleEvalSlugs={visibleEvalSlugs}
          />
        ))}
        <PaginationControls page={page} hasMore={hasMore} isLoading={isPlaceholderData} />
        <div ref={bottomPrefetchRef} aria-hidden className="h-px w-full" />
      </div>
    </TooltipProvider>
  )
}

export function SearchResultsContainer({ alwaysVisibleEvalSlugs }: SearchResultsProps) {
  return (
    <div className="flex flex-col gap-4">
      <SearchResults alwaysVisibleEvalSlugs={alwaysVisibleEvalSlugs} />
    </div>
  )
}
