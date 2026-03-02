import { useQuery } from '@tanstack/react-query'
import type { SearchQuery, SearchResponse } from '@/types/search'

/**
 * Build API URL with query parameters
 */
function buildSearchUrl(query: SearchQuery): string {
  const params = new URLSearchParams()
  params.set('q', query.q)

  if (query.subject !== undefined && query.subject !== '') {
    params.set('subject', query.subject)
  }
  if (query.year !== undefined && query.year !== '') {
    params.set('year', query.year)
  }
  if (query.minUnits !== undefined) {
    params.set('minUnits', String(query.minUnits))
  }
  if (query.maxUnits !== undefined) {
    params.set('maxUnits', String(query.maxUnits))
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit))
  }

  return `/api/search/semantic?${params.toString()}`
}

/**
 * Fetch search results from API
 */
async function fetchSearchResults(query: SearchQuery): Promise<SearchResponse> {
  const url = buildSearchUrl(query)
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Hook for semantic search with TanStack Query
 */
export function useSemanticSearch(query: SearchQuery | null) {
  return useQuery({
    queryKey: ['semantic-search', query],
    queryFn: () => fetchSearchResults(query!),
    enabled: query !== null && query.q.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
