import { type QueryClient } from '@tanstack/react-query'

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
  getCourseByCode,
  getEvalDistribution,
  getInstructorCourseQuarters,
  getCourseTextReviews,
  getInstructorProfile,
} from '@/data/search/search'
import { getFollowingForCourse } from '@/data/social/social-server'

import type { SearchParams, SearchCourseResult, SearchCourseResultStub } from '@/data/search/search.params'

export function courseQueryKey(
  year: string,
  subject_code: string,
  code_number: number,
  code_suffix: string | null,
) {
  return ['course', year, subject_code, code_number, code_suffix] as const
}

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

export function searchQueryOptions(search: SearchParams, queryClient?: QueryClient) {
  return {
    // oxlint-disable-next-line tanstack-query/exhaustive-deps -- queryClient is a stable singleton, not a data dependency
    queryKey: ['search', search] as const,
    queryFn: async (): Promise<{ results: SearchCourseResult[]; totalCount: number }> => {
      if (!queryClient) {
        const raw = await searchCourses({ data: search as Required<SearchParams> })
        return raw as { results: SearchCourseResult[]; totalCount: number }
      }

      const cachedEntries = queryClient.getQueriesData<SearchCourseResult>({ queryKey: ['course'] })
      const clientCachedOfferingIds = cachedEntries.filter(([, d]) => d != null).map(([, d]) => d!.id)

      const { results: rawResults, totalCount } = await searchCourses({
        data: { ...search, clientCachedOfferingIds } as Required<SearchParams>,
      })

      const results: SearchCourseResult[] = rawResults
        .map((r) => {
          if ((r as SearchCourseResultStub)._stub) {
            const stub = r as SearchCourseResultStub
            const slug = `${stub.subject_code}${stub.code_number}${stub.code_suffix ?? ''}`
            return (
              queryClient.getQueryData<SearchCourseResult>(
                courseByCodeQueryOptions(stub.year, slug).queryKey,
              ) ?? null
            )
          }
          return r as SearchCourseResult
        })
        .filter((r): r is SearchCourseResult => r != null)

      return { results, totalCount }
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  }
}

export function courseByCodeQueryOptions(year: string, courseCodeSlug: string) {
  return {
    queryKey: ['course', year, courseCodeSlug] as const,
    queryFn: () => getCourseByCode({ data: { year, courseCodeSlug } }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  }
}

export function evalDistributionQueryOptions(params: {
  courseCodeSlug: string
  quarterYears: { quarter: string; year: string }[]
  instructorSunets: string[]
  metric: string
}) {
  return {
    queryKey: ['eval-distribution', params] as const,
    queryFn: () => getEvalDistribution({ data: params }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    enabled: params.courseCodeSlug.length > 0 && params.quarterYears.length > 0,
  }
}

export function instructorCourseQuartersQueryOptions(params: {
  courseCodeSlug: string
  instructorSunets: string[]
  years: string[]
}) {
  return {
    queryKey: ['instructor-course-quarters', params] as const,
    queryFn: () => getInstructorCourseQuarters({ data: params }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    enabled: params.courseCodeSlug.length > 0,
  }
}

export function courseTextReviewsQueryOptions(params: {
  courseCodeSlug: string
  quarterYears: { quarter: string; year: string }[]
  instructorSunets: string[]
}) {
  return {
    queryKey: ['course-text-reviews', params] as const,
    queryFn: () => getCourseTextReviews({ data: params }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    enabled: params.courseCodeSlug.length > 0 && params.quarterYears.length > 0,
  }
}

export function instructorProfileQueryOptions(sunet: string, years: string[]) {
  return {
    queryKey: ['instructor-profile', sunet, years] as const,
    queryFn: () => getInstructorProfile({ data: { sunet, years } }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    enabled: sunet.length > 0,
  }
}

export function followingForCourseQueryOptions(
  subjectCode: string,
  codeNumber: number,
  codeSuffix: string | null | undefined,
) {
  return {
    queryKey: ['following-for-course', subjectCode, codeNumber, codeSuffix ?? null] as const,
    queryFn: () => getFollowingForCourse({ data: { subjectCode, codeNumber, codeSuffix } }),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}

export type SearchQueryOptions = ReturnType<typeof searchQueryOptions>
