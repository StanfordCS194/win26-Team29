import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export type PlanCourseData = { dbId: string; code: string; units: number }

export type PlanSearchResult = {
  code: string
  title: string
  unitsMin: number
  unitsMax: number
  quarters: string[]
}

/** Lightweight course search for the plan page — matches code or title via ILIKE. */
export const searchCoursesForPlan = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string().min(1).max(200), year: z.string().optional() }))
  .handler(async ({ data }): Promise<PlanSearchResult[]> => {
    const { getServerDb } = await import('@/lib/server-db')
    const { DEFAULT_YEAR } = await import('@/data/search/search.params')
    const db = getServerDb()
    const year = data.year ?? DEFAULT_YEAR
    const q = data.query.trim()
    if (!q) return []

    const rows = await db
      .selectFrom('course_offerings_full_mv')
      .select(['subject_code', 'code_number', 'code_suffix', 'title', 'units_min', 'units_max', 'sections'])
      .where('year', '=', year)
      .where((eb) => {
        const pattern = `%${q}%`
        return eb.or([
          eb('title', 'ilike', pattern),
          eb('title_clean', 'ilike', pattern),
          eb(eb.fn('concat', ['subject_code', eb.val(' '), 'code_number']), 'ilike', pattern),
        ])
      })
      .orderBy('code_number', 'asc')
      .limit(10)
      .execute()

    return rows.map((r) => {
      const suffix = r.code_suffix != null && r.code_suffix !== '' ? String(r.code_suffix) : ''
      const sections = (r.sections ?? []) as Array<{ termQuarter?: string; cancelled?: boolean }>
      const quarters = [
        ...new Set(
          sections
            .filter((s) => s.cancelled !== true && s.termQuarter != null && s.termQuarter !== '')
            .map((s) => s.termQuarter!),
        ),
      ]
      return {
        code: `${r.subject_code} ${r.code_number}${suffix}`,
        title: r.title,
        unitsMin: Number(r.units_min),
        unitsMax: Number(r.units_max),
        quarters,
      }
    })
  })

export type PlanData = {
  planId: string
  startYear: number
  planned: Record<string, PlanCourseData[]>
  globalStash: PlanCourseData[]
}

// Parses "CS 106A" → { subjectCode: "CS", codeNumber: 106, codeSuffix: "A" | null }
function parseCourseCode(
  code: string,
): { subjectCode: string; codeNumber: number; codeSuffix: string | null } | null {
  const m = code.trim().match(/^([A-Z]+(?:\s[A-Z]+)?)\s+(\d+)([A-Za-z]*)$/)
  if (!m) return null
  return {
    subjectCode: m[1]!,
    codeNumber: parseInt(m[2]!, 10),
    codeSuffix: m[3] || null,
  }
}

export const getUserPlan = createServerFn({ method: 'GET' }).handler(async (): Promise<PlanData | null> => {
  const { getSupabaseServerClient } = await import('@/lib/supabase.server')
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { getServerDb } = await import('@/lib/server-db')
  const db = getServerDb()

  // Get or create the user's first plan
  let plan = await db
    .selectFrom('plans')
    .select(['id'])
    .where('user_id', '=', user.id)
    .limit(1)
    .executeTakeFirst()

  if (!plan) {
    const inserted = await db
      .insertInto('plans')
      .values({ user_id: user.id, name: 'My 4-Year Plan' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    plan = { id: inserted.id }
  }

  const planId = plan.id

  // Load planned courses (not stashed)
  const courseRows = await db
    .selectFrom('plan_quarter_courses as pqc')
    .innerJoin('plan_quarters as pq', 'pq.id', 'pqc.plan_quarter_id')
    .innerJoin('subjects as s', 's.id', 'pqc.subject_id')
    .select([
      'pqc.id as courseDbId',
      'pqc.units',
      'pqc.code_number',
      'pqc.code_suffix',
      'pq.year',
      'pq.quarter',
      's.code as subject_code',
    ])
    .where('pq.plan_id', '=', planId)
    .where('pqc.stashed', '=', false)
    .execute()

  const years = courseRows.map((r) => Number(r.year))
  const startYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear()

  const planned: Record<string, PlanCourseData[]> = {}
  for (const row of courseRows) {
    const yearOffset = Number(row.year) - startYear
    const key = `${yearOffset}-${row.quarter}`
    const suffix = row.code_suffix != null && row.code_suffix !== '' ? String(row.code_suffix) : ''
    const code = `${row.subject_code} ${row.code_number}${suffix}`
    if (planned[key] === undefined) planned[key] = []
    planned[key].push({ dbId: String(row.courseDbId), code, units: Number(row.units ?? 0) })
  }

  // Load global stash
  const stashRows = await db
    .selectFrom('plan_stash_courses as psc')
    .innerJoin('subjects as s', 's.id', 'psc.subject_id')
    .select(['psc.id as stashDbId', 'psc.code_number', 'psc.code_suffix', 's.code as subject_code'])
    .where('psc.plan_id', '=', planId)
    .execute()

  const globalStash: PlanCourseData[] = stashRows.map((row) => {
    const suffix = row.code_suffix != null && row.code_suffix !== '' ? String(row.code_suffix) : ''
    return { dbId: String(row.stashDbId), code: `${row.subject_code} ${row.code_number}${suffix}`, units: 0 }
  })

  return { planId, startYear, planned, globalStash }
})

export const addPlanCourse = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      planId: z.string().uuid(),
      actualYear: z.number().int(),
      quarter: z.enum(['Autumn', 'Winter', 'Spring', 'Summer']),
      courseCode: z.string(),
      units: z.number(),
    }),
  )
  .handler(async ({ data }): Promise<{ dbId: string }> => {
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const parsed = parseCourseCode(data.courseCode)
    if (!parsed) throw new Error(`Invalid course code: ${data.courseCode}`)

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    // Verify plan belongs to user
    const plan = await db
      .selectFrom('plans')
      .select('id')
      .where('id', '=', data.planId)
      .where('user_id', '=', user.id)
      .limit(1)
      .executeTakeFirst()
    if (!plan) throw new Error('Plan not found')

    // Look up subject_id
    const subject = await db
      .selectFrom('subjects')
      .select('id')
      .where('code', '=', parsed.subjectCode)
      .limit(1)
      .executeTakeFirst()
    if (!subject) throw new Error(`Subject not found: ${parsed.subjectCode}`)

    // Upsert the plan_quarter for (planId, actualYear, quarter)
    let quarter = await db
      .selectFrom('plan_quarters')
      .select('id')
      .where('plan_id', '=', data.planId)
      .where('year', '=', data.actualYear)
      .where('quarter', '=', data.quarter)
      .limit(1)
      .executeTakeFirst()

    if (!quarter) {
      quarter = await db
        .insertInto('plan_quarters')
        .values({ plan_id: data.planId, year: data.actualYear, quarter: data.quarter })
        .returning('id')
        .executeTakeFirstOrThrow()
    }

    const newCourse = await db
      .insertInto('plan_quarter_courses')
      .values({
        plan_quarter_id: quarter.id,
        subject_id: subject.id,
        code_number: parsed.codeNumber,
        code_suffix: parsed.codeSuffix,
        units: data.units,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    return { dbId: String(newCourse.id) }
  })

export const removePlanCourse = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ courseDbId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    // Verify ownership before deleting
    const row = await db
      .selectFrom('plan_quarter_courses as pqc')
      .innerJoin('plan_quarters as pq', 'pq.id', 'pqc.plan_quarter_id')
      .innerJoin('plans as p', 'p.id', 'pq.plan_id')
      .select('pqc.id')
      .where('pqc.id', '=', data.courseDbId)
      .where('p.user_id', '=', user.id)
      .executeTakeFirst()
    if (!row) return // Already gone or not owned

    await db.deleteFrom('plan_quarter_courses').where('id', '=', data.courseDbId).execute()
  })

export const addStashCourse = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ planId: z.string().uuid(), courseCode: z.string() }))
  .handler(async ({ data }): Promise<{ dbId: string }> => {
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const parsed = parseCourseCode(data.courseCode)
    if (!parsed) throw new Error(`Invalid course code: ${data.courseCode}`)

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    const plan = await db
      .selectFrom('plans')
      .select('id')
      .where('id', '=', data.planId)
      .where('user_id', '=', user.id)
      .limit(1)
      .executeTakeFirst()
    if (!plan) throw new Error('Plan not found')

    const subject = await db
      .selectFrom('subjects')
      .select('id')
      .where('code', '=', parsed.subjectCode)
      .limit(1)
      .executeTakeFirst()
    if (!subject) throw new Error(`Subject not found: ${parsed.subjectCode}`)

    const newStash = await db
      .insertInto('plan_stash_courses')
      .values({
        plan_id: data.planId,
        subject_id: subject.id,
        code_number: parsed.codeNumber,
        code_suffix: parsed.codeSuffix,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    return { dbId: String(newStash.id) }
  })

export const removeStashCourse = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ stashDbId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    const row = await db
      .selectFrom('plan_stash_courses as psc')
      .innerJoin('plans as p', 'p.id', 'psc.plan_id')
      .select('psc.id')
      .where('psc.id', '=', data.stashDbId)
      .where('p.user_id', '=', user.id)
      .executeTakeFirst()
    if (!row) return

    await db.deleteFrom('plan_stash_courses').where('id', '=', data.stashDbId).execute()
  })

// Replaces the entire plan's quarter courses (used after transcript import)
export const resetPlan = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      planId: z.string().uuid(),
      startYear: z.number().int(),
      planned: z.record(z.string(), z.array(z.object({ code: z.string(), units: z.number() }))),
    }),
  )
  .handler(async ({ data }): Promise<Record<string, PlanCourseData[]>> => {
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    const plan = await db
      .selectFrom('plans')
      .select('id')
      .where('id', '=', data.planId)
      .where('user_id', '=', user.id)
      .limit(1)
      .executeTakeFirst()
    if (!plan) throw new Error('Plan not found')

    // Pre-resolve all subject codes
    const allSubjectCodes = [
      ...new Set(
        Object.values(data.planned)
          .flat()
          .map((c) => parseCourseCode(c.code)?.subjectCode)
          .filter((s): s is string => s != null),
      ),
    ]
    const subjectRows = await db
      .selectFrom('subjects')
      .select(['id', 'code'])
      .where('code', 'in', allSubjectCodes.length > 0 ? allSubjectCodes : ['__none__'])
      .execute()
    const subjectMap = new Map(subjectRows.map((s) => [s.code, s.id]))

    const result: Record<string, PlanCourseData[]> = {}

    await db.transaction().execute(async (trx) => {
      // Delete all existing quarters + courses for this plan
      const existingQuarters = await trx
        .selectFrom('plan_quarters')
        .select('id')
        .where('plan_id', '=', data.planId)
        .execute()
      const qIds = existingQuarters.map((q) => q.id)
      if (qIds.length > 0) {
        await trx.deleteFrom('plan_quarter_courses').where('plan_quarter_id', 'in', qIds).execute()
      }
      await trx.deleteFrom('plan_quarters').where('plan_id', '=', data.planId).execute()

      // Insert new quarters and courses
      for (const [key, courses] of Object.entries(data.planned)) {
        if (courses.length === 0) continue
        const dashIdx = key.indexOf('-')
        const yearOffsetStr = key.slice(0, dashIdx)
        const term = key.slice(dashIdx + 1)
        const actualYear = data.startYear + parseInt(yearOffsetStr, 10)
        const quarter = term as 'Autumn' | 'Winter' | 'Spring' | 'Summer'

        const newQuarter = await trx
          .insertInto('plan_quarters')
          .values({ plan_id: data.planId, year: actualYear, quarter })
          .returning('id')
          .executeTakeFirstOrThrow()

        const courseDataList: PlanCourseData[] = []
        for (const course of courses) {
          const parsed = parseCourseCode(course.code)
          if (!parsed) continue
          const subjectId = subjectMap.get(parsed.subjectCode)
          if (subjectId === undefined) continue

          const newCourse = await trx
            .insertInto('plan_quarter_courses')
            .values({
              plan_quarter_id: newQuarter.id,
              subject_id: subjectId,
              code_number: parsed.codeNumber,
              code_suffix: parsed.codeSuffix,
              units: course.units,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

          courseDataList.push({ dbId: String(newCourse.id), code: course.code, units: course.units })
        }

        if (courseDataList.length > 0) result[key] = courseDataList
      }
    })

    return result
  })
