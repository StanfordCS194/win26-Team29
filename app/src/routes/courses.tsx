import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { coursesSearchSchema, extractEvalFilters, SEARCH_DEFAULTS } from '@/data/search/search.types'
import { availableYearsQueryOptions, searchQueryOptions } from '@/components/courses/courses-query-options'
import { CoursesPage } from '@/components/courses/CoursesPage'

export const Route = createFileRoute('/courses')({
  // Zod v4 implements Standard Schema — no adapter needed.
  validateSearch: coursesSearchSchema,

  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },

  loaderDeps: ({ search }) => ({
    query: search.query,
    year: search.year,
    quarters: search.quarters,
    ways: search.ways,
    unitsMin: search.unitsMin,
    unitsMax: search.unitsMax,
    sort: search.sort,
    order: search.order,
    evalFilters: extractEvalFilters(search),
    page: search.page,
  }),
  loader: ({ deps, context }) => {
    void context.queryClient.prefetchQuery(availableYearsQueryOptions)
    void context.queryClient.prefetchQuery(
      searchQueryOptions(
        deps.query,
        deps.year,
        deps.quarters,
        deps.ways,
        deps.unitsMin,
        deps.unitsMax,
        deps.sort,
        deps.order,
        deps.evalFilters,
        deps.page,
      ),
    )
  },
  component: CoursesPage,
})
