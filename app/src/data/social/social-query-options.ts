import { queryOptions } from '@tanstack/react-query'
import {
  getOwnProfile,
  getFollowing,
  getFollowers,
  getFollowRequests,
  getSocialFeed,
  searchUsers,
  getUserProfile,
  getUserCourses,
  getCourseClassmates,
} from './social-server'

export const ownProfileQueryOptions = queryOptions({
  queryKey: ['social', 'own-profile'],
  queryFn: () => getOwnProfile(),
  staleTime: 1000 * 60 * 5,
})

export const followingQueryOptions = (userId?: string) =>
  queryOptions({
    queryKey: ['social', 'following', userId ?? 'me'],
    queryFn: () => getFollowing({ data: { userId } }),
    staleTime: 1000 * 60 * 2,
  })

export const followersQueryOptions = (userId?: string) =>
  queryOptions({
    queryKey: ['social', 'followers', userId ?? 'me'],
    queryFn: () => getFollowers({ data: { userId } }),
    staleTime: 1000 * 60 * 2,
  })

export const followRequestsQueryOptions = queryOptions({
  queryKey: ['social', 'follow-requests'],
  queryFn: () => getFollowRequests(),
  staleTime: 1000 * 30,
})

export const socialFeedQueryOptions = queryOptions({
  queryKey: ['social', 'feed'],
  queryFn: () => getSocialFeed(),
  staleTime: 1000 * 60,
})

export const userSearchQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ['social', 'search', query],
    queryFn: () => searchUsers({ data: { query } }),
    enabled: query.trim().length > 0,
    staleTime: 1000 * 30,
  })

export const userProfileQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ['social', 'profile', userId],
    queryFn: () => getUserProfile({ data: { userId } }),
    staleTime: 1000 * 60 * 2,
  })

export const userCoursesQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ['social', 'user-courses', userId],
    queryFn: () => getUserCourses({ data: { userId } }),
    staleTime: 1000 * 60 * 2,
  })

export const courseClassmatesQueryOptions = (
  subjectCode: string,
  codeNumber: number,
  codeSuffix?: string | null,
  quarter?: string,
  year?: number,
) =>
  queryOptions({
    queryKey: ['social', 'classmates', subjectCode, codeNumber, codeSuffix ?? '', quarter ?? '', year ?? ''],
    queryFn: () => getCourseClassmates({ data: { subjectCode, codeNumber, codeSuffix: codeSuffix ?? null, quarter, year } }),
    staleTime: 1000 * 60 * 5,
  })
