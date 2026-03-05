import {
  getAvailableYears,
  getAvailableGers,
  getAvailableCareers,
  getAvailableGradingOptions,
  getAvailableFinalExamOptions,
  getAvailableSubjects,
  getAvailableInstructors,
  getAvailableComponentTypes,
  searchCourses,
} from '@/data/search/search'

import type { SearchParams } from '@/data/search/search.params'

export const availableYearsQueryOptions = {
  queryKey: ['available-years'] as const,
  queryFn: () => getAvailableYears(),
  staleTime: 1000 * 60 * 60 * 24,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
}

export function availableSubjectsQueryOptions(year: string) {
  return {
    queryKey: ['available-subjects', year] as const,
    queryFn: () => getAvailableSubjects({ data: { year } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export function availableInstructorsQueryOptions(year: string) {
  return {
    queryKey: ['available-instructors', year] as const,
    queryFn: () => getAvailableInstructors({ data: { year } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export const availableGersQueryOptions = {
  queryKey: ['available-gers'] as const,
  queryFn: () => getAvailableGers(),
  staleTime: 1000 * 60 * 60 * 24,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
}

export function availableCareersQueryOptions(year: string) {
  return {
    queryKey: ['available-careers', year] as const,
    queryFn: () => getAvailableCareers({ data: { year } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export function availableGradingOptionsQueryOptions(year: string) {
  return {
    queryKey: ['available-grading-options', year] as const,
    queryFn: () => getAvailableGradingOptions({ data: { year } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export function availableFinalExamOptionsQueryOptions(year: string) {
  return {
    queryKey: ['available-final-exam-options', year] as const,
    queryFn: () => getAvailableFinalExamOptions({ data: { year } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export function availableComponentTypesQueryOptions(year: string) {
  return {
    queryKey: ['available-component-types', year] as const,
    queryFn: () => getAvailableComponentTypes({ data: { year } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export function searchQueryOptions(search: SearchParams) {
  return {
    queryKey: ['search', search] as const,
    queryFn: () => searchCourses({ data: search as Required<SearchParams> }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  }
}

export type SearchQueryOptions = ReturnType<typeof searchQueryOptions>
