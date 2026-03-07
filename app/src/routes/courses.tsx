import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { searchParamsSchema, SEARCH_DEFAULTS } from '@/data/search/search.params'
import {
  availableYearsQueryOptions,
  availableGersQueryOptions,
  availableSubjectsQueryOptions,
  availableInstructorsQueryOptions,
  searchQueryOptions,
} from '@/components/courses/courses-query-options'
import { CoursesPage } from '@/components/courses/CoursesPage'

export const Route = createFileRoute('/courses')({
  // Zod v4 implements Standard Schema — no adapter needed.
  validateSearch: searchParamsSchema,

  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },

  loaderDeps: ({ search }) => search,

  loader: ({ deps, context }) => {
    void context.queryClient.prefetchQuery(availableYearsQueryOptions)
    void context.queryClient.prefetchQuery(availableGersQueryOptions)
    void context.queryClient.prefetchQuery(availableSubjectsQueryOptions(deps.year))
    void context.queryClient.prefetchQuery(availableInstructorsQueryOptions(deps.year))
    void context.queryClient.prefetchQuery(searchQueryOptions(deps))
  },
  component: CoursesPage,
})
