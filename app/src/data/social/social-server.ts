import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// ── Types ──────────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string
  displayName: string
  description: string | null
  avatarUrl: string | null
  friendsOnly: boolean
}

export type FollowStatus = 'none' | 'pending' | 'accepted'

export type UserProfileWithFollow = UserProfile & {
  followStatus: FollowStatus
  isFollowingYou: boolean
}

export type FeedEntry = {
  userId: string
  displayName: string
  avatarUrl: string | null
  courseCode: string
  quarter: string
  year: number
  addedAt: string
}

export type CourseClassmate = {
  userId: string
  displayName: string
  avatarUrl: string | null
}

export type UserCourse = {
  courseCode: string
  title: string
  quarter: string
  year: number
  units: number
  schedule: { days: string[]; startTime: string; endTime: string; location: string | null }[]
}

// ── Dummy data ─────────────────────────────────────────────────────────────
//
// Three profiles with distinct course plans across Autumn 2025 → Spring 2026.
// Shared courses (same code + quarter) create natural classmate overlaps.
//
//   Course             Quarter       Alice  Bob  David
//   ─────────────────  ────────────  ─────  ───  ─────
//   CS 106A            Autumn 2025     ✓     ✓
//   MATH 51            Autumn 2025     ✓     ✓
//   CS 106B            Autumn 2025                 ✓
//   MATH 52            Autumn 2025                 ✓
//   CS 106B            Winter 2026     ✓     ✓
//   PHYSICS 41         Winter 2026     ✓
//   MATH 52            Winter 2026           ✓
//   ECON 50            Winter 2026           ✓
//   CS 107             Winter 2026                 ✓
//   MATH 51            Winter 2026                 ✓
//   DANCE 43           Winter 2026                 ✓
//   CS 107             Spring 2026     ✓
//   MATH 52            Spring 2026     ✓
//   MATH 53            Spring 2026           ✓
//   CS 161             Spring 2026           ✓     ✓
//   CS 109             Spring 2026                 ✓
//

const DUMMY_USERS: UserProfileWithFollow[] = [
  {
    id: 'dummy-1',
    displayName: 'Alice Chen',
    description: 'CS major, class of 2027',
    avatarUrl: null,
    friendsOnly: false,
    followStatus: 'accepted',
    isFollowingYou: true,
  },
  {
    id: 'dummy-2',
    displayName: 'Bob Martinez',
    description: 'Math & CompSci double major',
    avatarUrl: null,
    friendsOnly: false,
    followStatus: 'accepted',
    isFollowingYou: false,
  },
  {
    id: 'dummy-3',
    displayName: 'David Kim',
    description: 'Sophomore, interested in AI',
    avatarUrl: null,
    friendsOnly: false,
    followStatus: 'none',
    isFollowingYou: true,
  },
]

// ── Per-user course plans ──────────────────────────────────────────────────

const USER_COURSES: Record<string, UserCourse[]> = {
  // Alice Chen ───────────────────────────────────────────────────────────
  'dummy-1': [
    // Autumn 2025
    {
      courseCode: 'CS 106A', title: 'Programming Methodology',
      quarter: 'Autumn', year: 2025, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Bishop Aud' }],
    },
    {
      courseCode: 'MATH 51', title: 'Linear Algebra',
      quarter: 'Autumn', year: 2025, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '9:00', endTime: '10:20', location: 'Hewlett 200' }],
    },
    // Winter 2026
    {
      courseCode: 'CS 106B', title: 'Programming Abstractions',
      quarter: 'Winter', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Hewlett 200' }],
    },
    {
      courseCode: 'PHYSICS 41', title: 'Mechanics',
      quarter: 'Winter', year: 2026, units: 4,
      schedule: [{ days: ['Tuesday', 'Thursday'], startTime: '9:30', endTime: '10:50', location: 'Hewlett 201' }],
    },
    // Spring 2026
    {
      courseCode: 'CS 107', title: 'Computer Org & Systems',
      quarter: 'Spring', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Gates B01' }],
    },
    {
      courseCode: 'MATH 52', title: 'Integral Calculus',
      quarter: 'Spring', year: 2026, units: 5,
      schedule: [{ days: ['Tuesday', 'Thursday'], startTime: '9:00', endTime: '10:20', location: '380-380C' }],
    },
  ],

  // Bob Martinez ─────────────────────────────────────────────────────────
  'dummy-2': [
    // Autumn 2025
    {
      courseCode: 'MATH 51', title: 'Linear Algebra',
      quarter: 'Autumn', year: 2025, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '9:00', endTime: '10:20', location: 'Hewlett 200' }],
    },
    {
      courseCode: 'CS 106A', title: 'Programming Methodology',
      quarter: 'Autumn', year: 2025, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Bishop Aud' }],
    },
    // Winter 2026
    {
      courseCode: 'CS 106B', title: 'Programming Abstractions',
      quarter: 'Winter', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Hewlett 200' }],
    },
    {
      courseCode: 'MATH 52', title: 'Integral Calculus',
      quarter: 'Winter', year: 2026, units: 5,
      schedule: [{ days: ['Tuesday', 'Thursday'], startTime: '9:00', endTime: '10:20', location: '380-380C' }],
    },
    {
      courseCode: 'ECON 50', title: 'Economic Analysis',
      quarter: 'Winter', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '13:00', endTime: '14:20', location: 'Landau 102' }],
    },
    // Spring 2026
    {
      courseCode: 'MATH 53', title: 'Differential Equations',
      quarter: 'Spring', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '9:00', endTime: '10:20', location: '380-380D' }],
    },
    {
      courseCode: 'CS 161', title: 'Design & Analysis of Algorithms',
      quarter: 'Spring', year: 2026, units: 4,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '11:00', endTime: '12:20', location: 'NVIDIA Aud' }],
    },
  ],

  // David Kim ────────────────────────────────────────────────────────────
  'dummy-3': [
    // Autumn 2025
    {
      courseCode: 'CS 106B', title: 'Programming Abstractions',
      quarter: 'Autumn', year: 2025, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Hewlett 200' }],
    },
    {
      courseCode: 'MATH 52', title: 'Integral Calculus',
      quarter: 'Autumn', year: 2025, units: 5,
      schedule: [{ days: ['Tuesday', 'Thursday'], startTime: '9:00', endTime: '10:20', location: '380-380C' }],
    },
    // Winter 2026
    {
      courseCode: 'CS 107', title: 'Computer Org & Systems',
      quarter: 'Winter', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '10:30', endTime: '11:50', location: 'Gates B01' }],
    },
    {
      courseCode: 'MATH 51', title: 'Linear Algebra',
      quarter: 'Winter', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '9:00', endTime: '10:20', location: 'Hewlett 200' }],
    },
    {
      courseCode: 'DANCE 43', title: 'Liquid Flow',
      quarter: 'Winter', year: 2026, units: 1,
      schedule: [{ days: ['Tuesday', 'Thursday'], startTime: '11:00', endTime: '12:20', location: 'Roble Gym' }],
    },
    // Spring 2026
    {
      courseCode: 'CS 109', title: 'Probability for Computer Scientists',
      quarter: 'Spring', year: 2026, units: 5,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '9:00', endTime: '10:20', location: 'Hewlett 200' }],
    },
    {
      courseCode: 'CS 161', title: 'Design & Analysis of Algorithms',
      quarter: 'Spring', year: 2026, units: 4,
      schedule: [{ days: ['Monday', 'Wednesday', 'Friday'], startTime: '11:00', endTime: '12:20', location: 'NVIDIA Aud' }],
    },
  ],
}

// ── Derived data ───────────────────────────────────────────────────────────

// Build feed from the course data: recent additions from users you follow.
// Only Alice (dummy-1) and Bob (dummy-2) have followStatus 'accepted'.
function buildFeed(): FeedEntry[] {
  const followed = DUMMY_USERS.filter((u) => u.followStatus === 'accepted')
  const entries: FeedEntry[] = []

  // Use each course's quarter to create plausible "addedAt" dates
  const quarterDates: Record<string, string> = {
    'Autumn 2025': '2025-09',
    'Winter 2026': '2026-01',
    'Spring 2026': '2026-03',
  }

  for (const user of followed) {
    const courses = USER_COURSES[user.id] ?? []
    for (const course of courses) {
      const monthPrefix = quarterDates[`${course.quarter} ${course.year}`] ?? '2026-01'
      // Stagger dates so feed has variety
      const day = String(10 + entries.length).padStart(2, '0')
      entries.push({
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        courseCode: course.courseCode,
        quarter: course.quarter,
        year: course.year,
        addedAt: `${monthPrefix}-${day}T12:00:00Z`,
      })
    }
  }

  // Sort newest first
  return entries.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

const DUMMY_FEED = buildFeed()

// Build classmates dynamically: find all dummy users who have a given course in a given quarter
function findClassmates(
  subjectCode: string,
  codeNumber: number,
  codeSuffix: string | null,
  quarter?: string | null,
  year?: number | null,
): CourseClassmate[] {
  const target = `${subjectCode} ${codeNumber}${codeSuffix ?? ''}`.toUpperCase()
  const result: CourseClassmate[] = []

  for (const user of DUMMY_USERS) {
    const courses = USER_COURSES[user.id] ?? []
    const match = courses.some((c) => {
      if (c.courseCode.toUpperCase() !== target) return false
      if (quarter != null && quarter !== '' && c.quarter !== quarter) return false
      if (year != null && c.year !== year) return false
      return true
    })
    if (match) {
      result.push({
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      })
    }
  }

  return result
}

// Follow requests: David Kim follows you but you don't follow back
const DUMMY_FOLLOW_REQUESTS = DUMMY_USERS
  .filter((u) => u.isFollowingYou && u.followStatus === 'none')
  .map((u) => ({ userId: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl }))

// ── Server functions ───────────────────────────────────────────────────────

export const getOwnProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UserProfile | null> => {
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const rawMeta = user.user_metadata as Record<string, unknown> | undefined
    const avatarUrl =
      (typeof rawMeta?.avatar_url === 'string' && rawMeta.avatar_url) ||
      (typeof rawMeta?.picture === 'string' && rawMeta.picture) ||
      null
    const displayName =
      (typeof rawMeta?.full_name === 'string' ? rawMeta.full_name : null) ?? user.email?.split('@')[0] ?? 'User'

    return {
      id: user.id,
      displayName,
      description: null,
      avatarUrl,
      friendsOnly: false,
    }
  },
)

export const updateProfile = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      displayName: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      friendsOnly: z.boolean().optional(),
    }),
  )
  .handler(async () => {
    // No-op with dummy data
  })

export const followUser = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ targetUserId: z.string() }))
  .handler(async () => {
    return { status: 'accepted' }
  })

export const unfollowUser = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ targetUserId: z.string() }))
  .handler(async () => {
    // No-op
  })

export const acceptFollowRequest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requesterId: z.string() }))
  .handler(async () => {
    // No-op
  })

export const rejectFollowRequest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requesterId: z.string() }))
  .handler(async () => {
    // No-op
  })

export const getFollowRequests = createServerFn({ method: 'GET' }).handler(async () => {
  return DUMMY_FOLLOW_REQUESTS
})

export const getFollowing = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string().optional() }))
  .handler(async () => {
    return DUMMY_USERS.filter((u) => u.followStatus === 'accepted').map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    }))
  })

export const getFollowers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string().optional() }))
  .handler(async () => {
    return DUMMY_USERS.filter((u) => u.isFollowingYou).map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    }))
  })

export const searchUsers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<UserProfileWithFollow[]> => {
    const q = data.query.trim().toLowerCase()
    return DUMMY_USERS.filter(
      (u) => u.displayName.toLowerCase().includes(q) || (u.description ?? '').toLowerCase().includes(q),
    )
  })

export const getUserProfile = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }): Promise<(UserProfileWithFollow & { followersCount: number; followingCount: number }) | null> => {
    const found = DUMMY_USERS.find((u) => u.id === data.userId)
    if (!found) return null
    // Derive counts from dummy data
    const followersCount = DUMMY_USERS.filter((u) => u.id !== found.id).length // simplified
    const followingCount = DUMMY_USERS.filter((u) => u.id !== found.id && u.followStatus === 'accepted').length
    return { ...found, followersCount, followingCount }
  })

export const getUserCourses = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }): Promise<UserCourse[]> => {
    return USER_COURSES[data.userId] ?? []
  })

export const getCourseClassmates = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      subjectCode: z.string(),
      codeNumber: z.number(),
      codeSuffix: z.string().nullable().optional(),
      quarter: z.string().optional(),
      year: z.number().optional(),
    }),
  )
  .handler(async ({ data }): Promise<CourseClassmate[]> => {
    return findClassmates(data.subjectCode, data.codeNumber, data.codeSuffix ?? null, data.quarter, data.year)
  })

export const getSocialFeed = createServerFn({ method: 'GET' }).handler(async (): Promise<FeedEntry[]> => {
  return DUMMY_FEED
})
