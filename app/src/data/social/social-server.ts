import { createServerFn } from '@tanstack/react-start'
import { sql } from 'kysely'
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
  averageHoursPerWeek: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getAuthUserId(): Promise<string | null> {
  const { getSupabaseServerClient } = await import('@/lib/supabase.server')
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function getDb() {
  const { getServerDb } = await import('@/lib/server-db')
  return getServerDb()
}

// ── Server functions ───────────────────────────────────────────────────────

export const getOwnProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UserProfile | null> => {
    const userId = await getAuthUserId()
    if (userId == null) return null

    const db = await getDb()
    const row = await db
      .selectFrom('users')
      .select(['id', 'display_name', 'description', 'avatar_url', 'friends_only'])
      .where('id', '=', userId)
      .executeTakeFirst()

    if (!row) {
      // User hasn't been upserted yet (edge case: first visit before callback completes)
      // Fall back to auth metadata
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
        (typeof rawMeta?.full_name === 'string' ? rawMeta.full_name : null) ??
        user.email?.split('@')[0] ??
        'User'
      return { id: user.id, displayName, description: null, avatarUrl, friendsOnly: false }
    }

    return {
      id: row.id,
      displayName: row.display_name,
      description: row.description,
      avatarUrl: row.avatar_url,
      friendsOnly: row.friends_only,
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
  .handler(async ({ data }) => {
    const userId = await getAuthUserId()
    if (userId == null) return

    const db = await getDb()
    const updates: Record<string, unknown> = {}
    if (data.displayName !== undefined) updates.display_name = data.displayName
    if (data.description !== undefined) updates.description = data.description
    if (data.friendsOnly !== undefined) updates.friends_only = data.friendsOnly

    if (Object.keys(updates).length > 0) {
      await db.updateTable('users').set(updates).where('id', '=', userId).execute()
    }
  })

export const followUser = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ targetUserId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await getAuthUserId()
    if (userId == null) return { status: 'none' as FollowStatus }

    const db = await getDb()

    // Check if target user requires approval
    const target = await db
      .selectFrom('users')
      .select(['friends_only'])
      .where('id', '=', data.targetUserId)
      .executeTakeFirst()

    const status: FollowStatus = target?.friends_only === true ? 'pending' : 'accepted'

    await db
      .insertInto('friendships')
      .values({
        requester_id: userId,
        recipient_id: data.targetUserId,
        status,
      })
      .onConflict((oc) => oc.columns(['requester_id', 'recipient_id']).doUpdateSet({ status }))
      .execute()

    return { status }
  })

export const unfollowUser = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ targetUserId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await getAuthUserId()
    if (userId == null) return

    const db = await getDb()
    await db
      .deleteFrom('friendships')
      .where('requester_id', '=', userId)
      .where('recipient_id', '=', data.targetUserId)
      .execute()
  })

export const acceptFollowRequest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requesterId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await getAuthUserId()
    if (userId == null) return

    const db = await getDb()
    await db
      .updateTable('friendships')
      .set({ status: 'accepted' })
      .where('requester_id', '=', data.requesterId)
      .where('recipient_id', '=', userId)
      .where('status', '=', 'pending')
      .execute()
  })

export const rejectFollowRequest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requesterId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await getAuthUserId()
    if (userId == null) return

    const db = await getDb()
    await db
      .deleteFrom('friendships')
      .where('requester_id', '=', data.requesterId)
      .where('recipient_id', '=', userId)
      .execute()
  })

export const getFollowRequests = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await getAuthUserId()
  if (userId == null) return []

  const db = await getDb()
  const rows = await db
    .selectFrom('friendships as f')
    .innerJoin('users as u', 'u.id', 'f.requester_id')
    .select(['u.id as userId', 'u.display_name as displayName', 'u.avatar_url as avatarUrl'])
    .where('f.recipient_id', '=', userId)
    .where('f.status', '=', 'pending')
    .execute()

  return rows.map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }))
})

export const getFollowing = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string().optional() }))
  .handler(async ({ data }) => {
    const meId = await getAuthUserId()
    const targetUserId = data.userId ?? meId
    if (targetUserId == null) return []

    const db = await getDb()
    const rows = await db
      .selectFrom('friendships as f')
      .innerJoin('users as u', 'u.id', 'f.recipient_id')
      .select(['u.id as userId', 'u.display_name as displayName', 'u.avatar_url as avatarUrl'])
      .where('f.requester_id', '=', targetUserId)
      .where('f.status', '=', 'accepted')
      .execute()

    return rows.map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }))
  })

export const getFollowers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string().optional() }))
  .handler(async ({ data }) => {
    const meId = await getAuthUserId()
    const targetUserId = data.userId ?? meId
    if (targetUserId == null) return []

    const db = await getDb()
    const rows = await db
      .selectFrom('friendships as f')
      .innerJoin('users as u', 'u.id', 'f.requester_id')
      .select(['u.id as userId', 'u.display_name as displayName', 'u.avatar_url as avatarUrl'])
      .where('f.recipient_id', '=', targetUserId)
      .where('f.status', '=', 'accepted')
      .execute()

    return rows.map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }))
  })

export const searchUsers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<UserProfileWithFollow[]> => {
    const meId = await getAuthUserId()
    const db = await getDb()
    const pattern = `%${data.query.trim()}%`

    const rows = await db
      .selectFrom('users as u')
      .select(['u.id', 'u.display_name', 'u.description', 'u.avatar_url', 'u.friends_only'])
      .where((eb) =>
        eb.or([
          eb('u.display_name', 'ilike', pattern),
          eb('u.description', 'ilike', pattern),
          eb('u.sunet', 'ilike', pattern),
        ]),
      )
      .limit(20)
      .execute()

    // Batch-fetch follow relationships for current user
    const userIds = rows.map((r) => r.id)
    let outgoing: Record<string, string> = {}
    let incoming: Set<string> = new Set()

    if (meId != null && userIds.length > 0) {
      const outRows = await db
        .selectFrom('friendships')
        .select(['recipient_id', 'status'])
        .where('requester_id', '=', meId)
        .where('recipient_id', 'in', userIds)
        .execute()
      outgoing = Object.fromEntries(outRows.map((r) => [r.recipient_id, r.status]))

      const inRows = await db
        .selectFrom('friendships')
        .select(['requester_id'])
        .where('recipient_id', '=', meId)
        .where('requester_id', 'in', userIds)
        .where('status', '=', 'accepted')
        .execute()
      incoming = new Set(inRows.map((r) => r.requester_id))
    }

    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      description: r.description,
      avatarUrl: r.avatar_url,
      friendsOnly: r.friends_only,
      followStatus: (outgoing[r.id] as FollowStatus) ?? 'none',
      isFollowingYou: incoming.has(r.id),
    }))
  })

export const getUserProfile = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<(UserProfileWithFollow & { followersCount: number; followingCount: number }) | null> => {
      const meId = await getAuthUserId()
      const db = await getDb()

      const row = await db
        .selectFrom('users')
        .select(['id', 'display_name', 'description', 'avatar_url', 'friends_only'])
        .where('id', '=', data.userId)
        .executeTakeFirst()

      if (!row) {
        // If viewing own profile and user row doesn't exist yet, fall back to auth metadata
        if (meId != null && meId === data.userId) {
          const { getSupabaseServerClient } = await import('@/lib/supabase.server')
          const supabase = getSupabaseServerClient()
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (user) {
            const rawMeta = user.user_metadata as Record<string, unknown> | undefined
            const avatarUrl =
              (typeof rawMeta?.avatar_url === 'string' && rawMeta.avatar_url) ||
              (typeof rawMeta?.picture === 'string' && rawMeta.picture) ||
              null
            const displayName =
              (typeof rawMeta?.full_name === 'string' ? rawMeta.full_name : null) ??
              user.email?.split('@')[0] ??
              'User'
            return {
              id: user.id,
              displayName,
              description: null,
              avatarUrl,
              friendsOnly: false,
              followStatus: 'none' as FollowStatus,
              isFollowingYou: false,
              followersCount: 0,
              followingCount: 0,
            }
          }
        }
        return null
      }

      // Follow counts
      const [followersResult, followingResult] = await Promise.all([
        db
          .selectFrom('friendships')
          .select(sql<number>`count(*)::int`.as('count'))
          .where('recipient_id', '=', data.userId)
          .where('status', '=', 'accepted')
          .executeTakeFirst(),
        db
          .selectFrom('friendships')
          .select(sql<number>`count(*)::int`.as('count'))
          .where('requester_id', '=', data.userId)
          .where('status', '=', 'accepted')
          .executeTakeFirst(),
      ])

      // Follow status relative to me
      let followStatus: FollowStatus = 'none'
      let isFollowingYou = false

      if (meId != null && meId !== data.userId) {
        const [outRow, inRow] = await Promise.all([
          db
            .selectFrom('friendships')
            .select(['status'])
            .where('requester_id', '=', meId)
            .where('recipient_id', '=', data.userId)
            .executeTakeFirst(),
          db
            .selectFrom('friendships')
            .select(['status'])
            .where('requester_id', '=', data.userId)
            .where('recipient_id', '=', meId)
            .executeTakeFirst(),
        ])
        followStatus = (outRow?.status as FollowStatus) ?? 'none'
        isFollowingYou = inRow?.status === 'accepted'
      }

      return {
        id: row.id,
        displayName: row.display_name,
        description: row.description,
        avatarUrl: row.avatar_url,
        friendsOnly: row.friends_only,
        followStatus,
        isFollowingYou,
        followersCount: followersResult?.count ?? 0,
        followingCount: followingResult?.count ?? 0,
      }
    },
  )

export const getUserCourses = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }): Promise<UserCourse[]> => {
    const db = await getDb()

    // Find the user's plan
    const plan = await db
      .selectFrom('plans')
      .select(['id'])
      .where('user_id', '=', data.userId)
      .limit(1)
      .executeTakeFirst()

    if (!plan) return []

    // Load courses from plan with schedule data from the MV
    const courseRows = await db
      .selectFrom('plan_quarter_courses as pqc')
      .innerJoin('plan_quarters as pq', 'pq.id', 'pqc.plan_quarter_id')
      .innerJoin('subjects as s', 's.id', 'pqc.subject_id')
      .select([
        's.code as subject_code',
        'pqc.code_number',
        'pqc.code_suffix',
        'pq.quarter',
        'pq.year',
        'pqc.units',
      ])
      .where('pq.plan_id', '=', plan.id)
      .where('pqc.stashed', '=', false)
      .execute()

    if (courseRows.length === 0) return []

    // Fetch schedule info from the materialized view for each course
    const results: UserCourse[] = []
    for (const row of courseRows) {
      const suffix = row.code_suffix != null && row.code_suffix !== '' ? String(row.code_suffix) : ''
      const courseCode = `${row.subject_code} ${row.code_number}${suffix}`

      // Look up offering in MV to get title + schedule
      const offering = await db
        .selectFrom('course_offerings_full_mv')
        .select(['title', 'sections'])
        .where('subject_code', '=', row.subject_code)
        .where('code_number', '=', row.code_number)
        .where((eb) =>
          row.code_suffix != null && row.code_suffix !== ''
            ? eb('code_suffix', '=', row.code_suffix)
            : eb('code_suffix', 'is', null),
        )
        .limit(1)
        .executeTakeFirst()

      const title = offering?.title ?? courseCode
      const schedule: UserCourse['schedule'] = []

      if (offering?.sections != null) {
        const sections = offering.sections as unknown as Array<{
          componentType: string
          schedules: Array<{
            days: string[] | null
            startTime: string | null
            endTime: string | null
            location: string | null
          }>
        }>
        // Use the first LEC/SEM section's schedules
        const primary =
          sections.find((sec) => sec.componentType === 'LEC' || sec.componentType === 'SEM') ?? sections[0]
        if (primary?.schedules != null) {
          for (const sched of primary.schedules) {
            if (sched.days != null && sched.startTime != null && sched.endTime != null) {
              schedule.push({
                days: sched.days,
                startTime: sched.startTime,
                endTime: sched.endTime,
                location: sched.location,
              })
            }
          }
        }
      }

      results.push({
        courseCode,
        title,
        quarter: row.quarter,
        year: Number(row.year),
        units: Number(row.units ?? 0),
        schedule,
        averageHoursPerWeek: null, // filled below
      })
    }

    // ── Batch-fetch median hours per week from evaluation data ──
    // Find the 'hours' question ID
    const hoursQuestionRow = await db
      .selectFrom('evaluation_numeric_questions')
      .select(['id'])
      .where(
        'question_text',
        '=',
        'How many hours per week on average did you spend on this course (including class meetings)?',
      )
      .executeTakeFirst()

    if (hoursQuestionRow != null) {
      for (const course of results) {
        const parsed = course.courseCode.match(/^([A-Z]+(?:\s[A-Z]+)?)\s+(\d+)([A-Za-z]*)$/)
        if (!parsed) continue
        const subjectCode = parsed[1]!
        const codeNumber = parseInt(parsed[2]!, 10)
        const codeSuffix = parsed[3] || null

        // Find sections for this course across all years
        let secQuery = db
          .selectFrom('sections as sec')
          .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
          .innerJoin('subjects as s', 's.id', 'co.subject_id')
          .select('sec.id')
          .where('s.code', '=', subjectCode)
          .where('co.code_number', '=', codeNumber)
          .where('sec.is_principal', '=', true)
          .where('sec.cancelled', '=', false)

        if (codeSuffix === null || codeSuffix === '') {
          secQuery = secQuery.where((eb) =>
            eb.or([eb('co.code_suffix', 'is', null), eb('co.code_suffix', '=', '')]),
          )
        } else {
          secQuery = secQuery.where('co.code_suffix', '=', codeSuffix)
        }

        // Get frequency-weighted responses for hours question
        const rows = await db
          .selectFrom('evaluation_numeric_responses as enr')
          .where(
            'enr.report_id',
            'in',
            db
              .selectFrom('evaluation_report_sections as ers')
              .where('ers.section_id', 'in', secQuery)
              .select('ers.report_id'),
          )
          .where('enr.question_id', '=', hoursQuestionRow.id)
          .select(['enr.weight', db.fn.sum<number>('enr.frequency' as never).as('total_freq')])
          .groupBy('enr.weight')
          .orderBy('enr.weight', 'asc')
          .execute()

        if (rows.length > 0) {
          // Compute median from frequency distribution
          const totalCount = rows.reduce((sum, r) => sum + Number(r.total_freq), 0)
          const medianIdx = totalCount / 2
          let cumulative = 0
          for (const r of rows) {
            cumulative += Number(r.total_freq)
            if (cumulative >= medianIdx) {
              course.averageHoursPerWeek = Number(r.weight)
              break
            }
          }
        }
      }
    }

    return results
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
    const meId = await getAuthUserId()
    const db = await getDb()

    // Find the subject_id for this subject code
    const subject = await db
      .selectFrom('subjects')
      .select(['id'])
      .where('code', '=', data.subjectCode)
      .executeTakeFirst()
    if (!subject) return []

    // Find all users who have this course in their plan for the given quarter
    let query = db
      .selectFrom('plan_quarter_courses as pqc')
      .innerJoin('plan_quarters as pq', 'pq.id', 'pqc.plan_quarter_id')
      .innerJoin('plans as p', 'p.id', 'pq.plan_id')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['u.id as userId', 'u.display_name as displayName', 'u.avatar_url as avatarUrl'])
      .where('pqc.subject_id', '=', subject.id)
      .where('pqc.code_number', '=', data.codeNumber)
      .where('pqc.stashed', '=', false)
      .distinct()

    if (data.codeSuffix != null && data.codeSuffix !== '') {
      query = query.where('pqc.code_suffix', '=', data.codeSuffix)
    }
    if (data.quarter != null && data.quarter !== '') {
      query = query.where('pq.quarter', '=', data.quarter as 'Autumn' | 'Winter' | 'Spring' | 'Summer')
    }
    if (data.year != null) {
      query = query.where('pq.year', '=', data.year)
    }

    // Exclude the current user
    if (meId != null) {
      query = query.where('p.user_id', '!=', meId)
    }

    const rows = await query.limit(20).execute()
    return rows.map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }))
  })

export const getSocialFeed = createServerFn({ method: 'GET' }).handler(async (): Promise<FeedEntry[]> => {
  const userId = await getAuthUserId()
  if (userId == null) return []

  const db = await getDb()

  // Get IDs of users I follow (accepted)
  const followedRows = await db
    .selectFrom('friendships')
    .select(['recipient_id'])
    .where('requester_id', '=', userId)
    .where('status', '=', 'accepted')
    .execute()

  const followedIds = followedRows.map((r) => r.recipient_id)
  if (followedIds.length === 0) return []

  // Get their recent plan course additions
  const rows = await db
    .selectFrom('plan_quarter_courses as pqc')
    .innerJoin('plan_quarters as pq', 'pq.id', 'pqc.plan_quarter_id')
    .innerJoin('plans as p', 'p.id', 'pq.plan_id')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .innerJoin('subjects as s', 's.id', 'pqc.subject_id')
    .select([
      'u.id as userId',
      'u.display_name as displayName',
      'u.avatar_url as avatarUrl',
      's.code as subjectCode',
      'pqc.code_number',
      'pqc.code_suffix',
      'pq.quarter',
      'pq.year',
      'pqc.created_at',
    ])
    .where('p.user_id', 'in', followedIds)
    .where('pqc.stashed', '=', false)
    .orderBy('pqc.created_at', 'desc')
    .limit(50)
    .execute()

  return rows.map((r) => {
    const suffix = r.code_suffix != null && r.code_suffix !== '' ? String(r.code_suffix) : ''
    return {
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      courseCode: `${r.subjectCode} ${r.code_number}${suffix}`,
      quarter: r.quarter,
      year: Number(r.year),
      addedAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }
  })
})
