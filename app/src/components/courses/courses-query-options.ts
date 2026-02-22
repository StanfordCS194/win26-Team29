import { getAvailableYears, searchCourses } from '@/data/search/search'

import type { EvalFilterParam } from '@/data/search/search.queries'
import type { Quarter, SortOption, Way } from '@/data/search/search.types'

export const availableYearsQueryOptions = {
  queryKey: ['available-years'] as const,
  queryFn: () => getAvailableYears(),
  staleTime: 1000 * 60 * 60 * 24,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
}

export function searchQueryOptions(
  query: string,
  year: string,
  quarters: Quarter[],
  ways: Way[],
  unitsMin: number | undefined,
  unitsMax: number | undefined,
  sort: SortOption,
  order: 'asc' | 'desc',
  evalFilters: EvalFilterParam[],
  page: number,
) {
  const sortedQuarters = [...quarters].sort()
  const sortedWays = [...ways].sort()
  return {
    queryKey: [
      'search',
      query,
      year,
      sortedQuarters,
      sortedWays,
      unitsMin,
      unitsMax,
      sort,
      order,
      evalFilters,
      page,
    ] as const,
    queryFn: () =>
      searchCourses({
        data: {
          query,
          year,
          quarters: sortedQuarters,
          ways: sortedWays,
          unitsMin,
          unitsMax,
          sort,
          order,
          evalFilters,
          page,
        },
      }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  }
}

export type SearchQueryOptions = ReturnType<typeof searchQueryOptions>
