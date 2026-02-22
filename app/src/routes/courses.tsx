import { createFileRoute } from '@tanstack/react-router'

import { coursesSearchSchema, extractEvalFilters } from '@/data/search/search.types'
import { availableYearsQueryOptions, searchQueryOptions } from '@/components/courses/courses-query-options'
import { CoursesPage } from '@/components/courses/CoursesPage'

export const Route = createFileRoute('/courses')({
  validateSearch: coursesSearchSchema,
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
