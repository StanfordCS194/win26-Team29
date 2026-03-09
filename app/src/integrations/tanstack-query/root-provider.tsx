import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'

import { courseQueryKey } from '@/components/courses/courses-query-options'
import type { SearchCourseResult, SearchCourseResultStub } from '@/data/search/search.params'

export function getContext() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onSuccess: (data, query) => {
        if (query.queryKey[0] !== 'search') return
        const results = (data as { results: (SearchCourseResult | SearchCourseResultStub)[] }).results
        for (const r of results) {
          if ((r as SearchCourseResultStub)._stub) continue
          const full = r as SearchCourseResult
          queryClient.setQueryData(
            courseQueryKey(full.year, full.subject_code, full.code_number, full.code_suffix),
            full,
          )
        }
      },
    }),
  })
  return {
    queryClient,
  }
}

export function Provider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
