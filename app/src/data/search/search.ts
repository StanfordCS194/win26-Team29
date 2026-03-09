import { createServerFn } from '@tanstack/react-start'
import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

import { searchParamsSchema } from './search.params'

const searchFnInputSchema = searchParamsSchema.extend({
  clientCachedOfferingIds: z.array(z.number().int()).optional().catch(undefined),
})
import { getEvalQuestions, EVAL_QUESTION_SLUGS } from './eval-questions'
import { generateQueryEmbedding, preloadModel } from './embeddings'
import { expandSubjectTokens } from '@/components/courses/subject-tokens'
import { expandGradingTokens } from '@/components/courses/grading-groups'

import type { EvalSlug } from './eval-questions'
import type { SearchParams, SearchCourseResult, SearchCourseResultStub } from './search.params'
import type { SearchQueryParams } from './search.query'
import type { MvSection } from '@courses/db/db-postgres-js'
import { QuarterEnum } from '@courses/scrape/shared/schemas'
import { parseCourseCodeSlug } from '@/lib/course-code'
import { DEFAULT_YEAR } from './search.params'

void preloadModel()

const cachedSectionsByOfferingId = new Map<number, MvSection[]>()
const cachedSubjectsByYear = new Map<string, { code: string; school: string | null }[]>()
const cachedInstructorsByYear = new Map<string, { sunet: string; name: string }[]>()
let cachedYears: string[] | null = null
let cachedGers: string[] | null = null
const cachedCareersByYear = new Map<string, { id: number; code: string }[]>()
const cachedGradingOptionsByYear = new Map<string, { id: number; code: string }[]>()
const cachedFinalExamOptionsByYear = new Map<string, { id: number; code: string }[]>()
const cachedComponentTypesByYear = new Map<string, { id: number; code: string }[]>()

export const getAvailableSubjects = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string() }))
  .handler(async ({ data: { year } }): Promise<{ code: string; school: string | null }[]> => {
    const cached = cachedSubjectsByYear.get(year)
    if (cached) return cached
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()
    const rows = await db
      .selectFrom('subjects')
      .innerJoin('course_offerings as co', 'co.subject_id', 'subjects.id')
      .leftJoin('schools', 'schools.id', 'subjects.school_id')
      .select(['subjects.code', 'schools.name as school'])
      .where('co.year', '=', year)
      .distinct()
      .orderBy('schools.name', 'asc')
      .orderBy('subjects.code', 'asc')
      .execute()
    const result = rows.map((r) => ({ code: r.code, school: r.school ?? null }))
    cachedSubjectsByYear.set(year, result)
    return result
  })

export const getAvailableInstructors = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string() }))
  .handler(async ({ data: { year } }): Promise<{ sunet: string; name: string }[]> => {
    const cached = cachedInstructorsByYear.get(year)
    if (cached) return cached
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()
    const rows = await db
      .selectFrom('instructors')
      .innerJoin('schedule_instructors as si', 'si.instructor_id', 'instructors.id')
      .innerJoin('schedules', 'schedules.id', 'si.schedule_id')
      .innerJoin('sections', 'sections.id', 'schedules.section_id')
      .innerJoin('course_offerings as co', 'co.id', 'sections.course_offering_id')
      .select(['instructors.sunet', 'instructors.first_and_last_name'])
      .where('co.year', '=', year)
      .where('sections.is_principal', '=', true)
      .distinct()
      .orderBy('instructors.first_and_last_name', 'asc')
      .execute()
    const result = rows.map((r) => ({ sunet: r.sunet, name: r.first_and_last_name ?? r.sunet }))
    cachedInstructorsByYear.set(year, result)
    console.log(`[startup] warmed instructors for ${year} (${result.length} sunets)`)
    return result
  })

export const getAvailableGers = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  if (cachedGers) return cachedGers
  const { getServerDb } = await import('@/lib/server-db')
  const db = getServerDb()
  const rows = await db
    .selectFrom('gers')
    .select('code')
    .where('is_core', '=', true)
    .orderBy('code', 'asc')
    .execute()
  cachedGers = rows.map((r) => r.code)
  return cachedGers
})

export const getAvailableCareers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string() }))
  .handler(async ({ data: { year } }): Promise<string[]> => {
    const cached = cachedCareersByYear.get(year)
    if (cached) return cached.map((c) => c.code)
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()
    const rows = await db
      .selectFrom('academic_careers as ac')
      .innerJoin('course_offerings as co', 'co.academic_career_id', 'ac.id')
      .select(['ac.id', 'ac.code'])
      .where('co.year', '=', year)
      .distinct()
      .orderBy('ac.code', 'asc')
      .execute()
    const result = rows.map((r) => ({ id: r.id, code: r.code }))
    cachedCareersByYear.set(year, result)
    return result.map((c) => c.code)
  })

export const getAvailableGradingOptions = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string() }))
  .handler(async ({ data: { year } }): Promise<string[]> => {
    const cached = cachedGradingOptionsByYear.get(year)
    if (cached) return cached.map((c) => c.code)
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()
    const rows = await db
      .selectFrom('grading_options as go')
      .innerJoin('course_offerings as co', 'co.grading_option_id', 'go.id')
      .select(['go.id', 'go.code'])
      .where('co.year', '=', year)
      .distinct()
      .orderBy('go.code', 'asc')
      .execute()
    const result = rows.map((r) => ({ id: r.id, code: r.code }))
    cachedGradingOptionsByYear.set(year, result)
    return result.map((c) => c.code)
  })

export const getAvailableFinalExamOptions = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string() }))
  .handler(async ({ data: { year } }): Promise<string[]> => {
    const cached = cachedFinalExamOptionsByYear.get(year)
    if (cached) return cached.map((c) => c.code)
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()
    const rows = await db
      .selectFrom('final_exam_options as fe')
      .innerJoin('course_offerings as co', 'co.final_exam_flag_id', 'fe.id')
      .select(['fe.id', 'fe.code'])
      .where('co.year', '=', year)
      .distinct()
      .orderBy('fe.code', 'asc')
      .execute()
    const result = rows.map((r) => ({ id: r.id, code: r.code }))
    cachedFinalExamOptionsByYear.set(year, result)
    return result.map((c) => c.code)
  })

export const getAvailableComponentTypes = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string() }))
  .handler(async ({ data: { year } }): Promise<string[]> => {
    const cached = cachedComponentTypesByYear.get(year)
    if (cached) return cached.map((c) => c.code)
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()
    const rows = await db
      .selectFrom('component_types as ct')
      .select(['ct.id', 'ct.code'])
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('sections as sec')
            .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
            .whereRef('sec.component_type_id', '=', 'ct.id')
            .where('sec.is_principal', '=', true)
            .where('sec.cancelled', '=', false)
            .where('co.year', '=', year)
            .select('id'),
        ),
      )
      .orderBy('ct.code', 'asc')
      .execute()
    const result = rows.map((r) => ({ id: r.id, code: r.code }))
    cachedComponentTypesByYear.set(year, result)
    return result.map((c) => c.code)
  })

export const warmSubjectsCache = createServerFn({ method: 'GET' }).handler(async () => {
  const { getServerDb } = await import('@/lib/server-db')
  const db = getServerDb()

  let years: string[]
  if (cachedYears) {
    years = cachedYears
  } else {
    const yearRows = await db
      .selectFrom('course_offerings')
      .select('year')
      .distinct()
      .orderBy('year', 'desc')
      .execute()
    years = yearRows.map((r) => r.year)
  }

  await Promise.all(
    years.map(async (year) => {
      if (cachedSubjectsByYear.has(year)) return
      const rows = await db
        .selectFrom('subjects')
        .innerJoin('course_offerings as co', 'co.subject_id', 'subjects.id')
        .leftJoin('schools', 'schools.id', 'subjects.school_id')
        .select(['subjects.code', 'schools.name as school'])
        .where('co.year', '=', year)
        .distinct()
        .orderBy('schools.name', 'asc')
        .orderBy('subjects.code', 'asc')
        .execute()
      cachedSubjectsByYear.set(
        year,
        rows.map((r) => ({ code: r.code, school: r.school ?? null })),
      )
    }),
  )

  console.log(`[startup] warmed subjects for ${years.length} years`)
})

export const getAvailableYears = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  if (cachedYears) return cachedYears
  const { getServerDb } = await import('@/lib/server-db')
  const db = getServerDb()
  const rows = await db
    .selectFrom('course_offerings')
    .select('year')
    .distinct()
    .orderBy('year', 'desc')
    .execute()
  cachedYears = rows.map((r) => r.year)
  console.log(`[startup] warmed ${cachedYears.length} available years`)
  return cachedYears
})

export const getCourseByCode = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ year: z.string().optional(), courseCodeSlug: z.string().min(1) }))
  .handler(async ({ data }): Promise<SearchCourseResult | null> => {
    const year = data.year ?? DEFAULT_YEAR
    const parsed = parseCourseCodeSlug(data.courseCodeSlug)
    if (!parsed) return null

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    let q = db
      .selectFrom('course_offerings_full_mv')
      .select([
        'offering_id as id',
        'course_id',
        'year',
        'subject_code',
        'code_number',
        'code_suffix',
        'title',
        'title_clean',
        'description',
        'academic_group',
        'academic_career',
        'academic_organization',
        'grading_option',
        'final_exam_flag',
        'units_min',
        'units_max',
        'gers',
        'new_this_year',
        'sections',
        'crosslistings',
      ])
      .where('year', '=', year)
      .where('subject_code', '=', parsed.subjectCode)
      .where('code_number', '=', parsed.codeNumber)

    if (parsed.codeSuffix === null) {
      q = q.where((eb) => eb.or([eb('code_suffix', 'is', null), eb('code_suffix', '=', '')]))
    } else {
      q = q.where('code_suffix', '=', parsed.codeSuffix)
    }

    const row = await q.limit(1).executeTakeFirst()
    if (!row) return null

    const course = row as SearchCourseResult

    const startYear = parseInt(year.split('-')[0]!, 10)
    const prevYear = `${startYear - 1}-${startYear}`
    const years = [year, prevYear]

    const evalQuestions = await getEvalQuestions()
    const qualityId = evalQuestions.find((eq) => eq.slug === 'quality')?.id
    if (qualityId != null) {
      let iq = db
        .selectFrom('instructors as i')
        .innerJoin('schedule_instructors as si', 'si.instructor_id', 'i.id')
        .innerJoin('schedules as sch', 'sch.id', 'si.schedule_id')
        .innerJoin('sections as sec', 'sec.id', 'sch.section_id')
        .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
        .innerJoin('subjects as s', 's.id', 'co.subject_id')
        .innerJoin('evaluation_smart_averages as esa', (join) =>
          join.onRef('esa.section_id', '=', 'sec.id').on('esa.question_id', '=', qualityId),
        )
        .select(['i.sunet', db.fn.avg<number>('esa.smart_average' as never).as('avg_quality')])
        .where('s.code', '=', parsed.subjectCode)
        .where('co.code_number', '=', parsed.codeNumber)
        .where('co.year', 'in', years)
        .where('sec.is_principal', '=', true)
        .where('sec.cancelled', '=', false)
        .groupBy('i.sunet')

      if (parsed.codeSuffix === null) {
        iq = iq.where((eb) => eb.or([eb('co.code_suffix', 'is', null), eb('co.code_suffix', '=', '')]))
      } else {
        iq = iq.where('co.code_suffix', '=', parsed.codeSuffix)
      }

      const qualityRows = await iq.execute()
      if (qualityRows.length > 0) {
        const map: Record<string, number> = {}
        for (const r of qualityRows) {
          if (r.sunet && r.avg_quality != null) {
            map[r.sunet] = Number(r.avg_quality)
          }
        }
        course.instructorQualityBySunet = map
      }
    }

    return course
  })

// ── Eval distribution ────────────────────────────────────────────────────────

export type EvalDistributionBucket = { label: string; count: number }
export type EvalDistributionResult = {
  buckets: EvalDistributionBucket[]
  totalResponses: number
  boundaryLabels: string[]
}

function buildBuckets(
  rawData: { weight: number; total_freq: number }[],
  slug: EvalSlug,
): EvalDistributionResult {
  const isHours = slug === 'hours'
  const step = isHours ? 5 : 1
  const rangeMin = isHours ? 0 : 1
  const rangeMax = isHours ? 35 : 5

  const regularCount = Math.ceil((rangeMax - rangeMin) / step)
  const bucketCount = regularCount + (isHours ? 1 : 0)
  const counts = Array.from({ length: bucketCount }, () => 0)
  const labels: string[] = []

  for (let i = 0; i < bucketCount; i++) {
    const lo = rangeMin + i * step
    if (isHours && i === bucketCount - 1) {
      labels.push(`${rangeMax}+`)
    } else {
      labels.push(`${lo}-${lo + step}`)
    }
  }

  const boundaryLabels: string[] = []
  for (let i = 0; i <= regularCount; i++) {
    boundaryLabels.push(`${rangeMin + i * step}`)
  }
  if (isHours) {
    boundaryLabels.push('')
  }

  for (const { weight, total_freq } of rawData) {
    let idx: number
    if (weight >= rangeMax && isHours) {
      idx = bucketCount - 1
    } else if (weight >= rangeMax) {
      idx = bucketCount - 1
    } else {
      idx = Math.floor((weight - rangeMin) / step)
    }
    idx = Math.max(0, Math.min(idx, bucketCount - 1))
    counts[idx] += total_freq
  }

  const totalResponses = counts.reduce((a, b) => a + b, 0)
  return {
    buckets: labels.map((label, i) => ({ label, count: counts[i]! })),
    totalResponses,
    boundaryLabels,
  }
}

export const getEvalDistribution = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      courseCodeSlug: z.string().min(1),
      quarterYears: z.array(z.object({ quarter: z.string(), year: z.string() })).min(1),
      instructorSunets: z.array(z.string()),
      metric: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<EvalDistributionResult | null> => {
    const parsed = parseCourseCodeSlug(data.courseCodeSlug)
    if (!parsed) return null

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    const evalQuestions = await getEvalQuestions()
    const metricSlug = data.metric as EvalSlug
    const questionId = evalQuestions.find((eq) => eq.slug === metricSlug)?.id
    if (questionId == null) return null

    let secQuery = db
      .selectFrom('sections as sec')
      .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
      .innerJoin('subjects as s', 's.id', 'co.subject_id')
      .select('sec.id')
      .where('s.code', '=', parsed.subjectCode)
      .where('co.code_number', '=', parsed.codeNumber)
      .where('sec.is_principal', '=', true)
      .where('sec.cancelled', '=', false)
      .where((eb) =>
        eb.or(
          data.quarterYears.map((qy) =>
            eb.and([
              eb('sec.term_quarter', '=', qy.quarter as 'Autumn' | 'Winter' | 'Spring' | 'Summer'),
              eb('co.year', '=', qy.year),
            ]),
          ),
        ),
      )

    if (parsed.codeSuffix === null) {
      secQuery = secQuery.where((eb) =>
        eb.or([eb('co.code_suffix', 'is', null), eb('co.code_suffix', '=', '')]),
      )
    } else {
      secQuery = secQuery.where('co.code_suffix', '=', parsed.codeSuffix)
    }

    if (data.instructorSunets.length > 0) {
      secQuery = secQuery.where((eb) =>
        eb.exists(
          eb
            .selectFrom('schedules as sch')
            .innerJoin('schedule_instructors as si', 'si.schedule_id', 'sch.id')
            .innerJoin('instructors as i', 'i.id', 'si.instructor_id')
            .whereRef('sch.section_id', '=', 'sec.id')
            .where('i.sunet', 'in', data.instructorSunets)
            .select(eb.val(1).as('one')),
        ),
      )
    }

    const reportQuery = db
      .selectFrom('evaluation_report_sections as ers')
      .where('ers.section_id', 'in', secQuery)
      .select('ers.report_id')

    const rows = await db
      .selectFrom('evaluation_numeric_responses as enr')
      .where('enr.report_id', 'in', reportQuery)
      .where('enr.question_id', '=', questionId)
      .groupBy('enr.weight')
      .select(['enr.weight', db.fn.sum<number>('enr.frequency' as never).as('total_freq')])
      .execute()

    const rawData = rows.map((r) => ({
      weight: Number(r.weight),
      total_freq: Number(r.total_freq),
    }))

    return buildBuckets(rawData, metricSlug)
  })

export type InstructorCourseQuarter = { quarter: string; year: string }

export const getInstructorCourseQuarters = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      courseCodeSlug: z.string().min(1),
      instructorSunets: z.array(z.string()),
      years: z.array(z.string()).min(1).max(3),
    }),
  )
  .handler(async ({ data }): Promise<InstructorCourseQuarter[]> => {
    const parsed = parseCourseCodeSlug(data.courseCodeSlug)
    if (!parsed) return []

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    let q = db
      .selectFrom('sections as sec')
      .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
      .innerJoin('subjects as s', 's.id', 'co.subject_id')
      .select(['sec.term_quarter as quarter', 'co.year'])
      .distinct()
      .where('s.code', '=', parsed.subjectCode)
      .where('co.code_number', '=', parsed.codeNumber)
      .where('co.year', 'in', data.years)
      .where('sec.is_principal', '=', true)
      .where('sec.cancelled', '=', false)

    if (parsed.codeSuffix === null) {
      q = q.where((eb) => eb.or([eb('co.code_suffix', 'is', null), eb('co.code_suffix', '=', '')]))
    } else {
      q = q.where('co.code_suffix', '=', parsed.codeSuffix)
    }

    if (data.instructorSunets.length > 0) {
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom('schedules as sch')
            .innerJoin('schedule_instructors as si', 'si.schedule_id', 'sch.id')
            .innerJoin('instructors as i', 'i.id', 'si.instructor_id')
            .whereRef('sch.section_id', '=', 'sec.id')
            .where('i.sunet', 'in', data.instructorSunets)
            .select(eb.val(1).as('one')),
        ),
      )
    }

    const rows = await q.execute()

    const quarterOrder = ['Autumn', 'Winter', 'Spring', 'Summer']
    return rows
      .map((r) => ({ quarter: String(r.quarter), year: String(r.year) }))
      .sort((a, b) => {
        if (a.year !== b.year) return b.year.localeCompare(a.year)
        return quarterOrder.indexOf(a.quarter) - quarterOrder.indexOf(b.quarter)
      })
  })

// ── Instructor profile ───────────────────────────────────────────────────────

export type InstructorCourseEntry = {
  courseCodeSlug: string
  displayCode: string
  title: string
  quarter: string
  year: string
  avgQuality: number | null
}

export type InstructorProfile = {
  sunet: string
  name: string
  entries: InstructorCourseEntry[]
}

export const getInstructorProfile = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      sunet: z.string().min(1),
      years: z.array(z.string()).min(1).max(4),
    }),
  )
  .handler(async ({ data }): Promise<InstructorProfile | null> => {
    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    const instructor = await db
      .selectFrom('instructors')
      .select(['sunet', 'first_and_last_name'])
      .where('sunet', '=', data.sunet)
      .limit(1)
      .executeTakeFirst()

    if (!instructor) return null

    const evalQuestions = await getEvalQuestions()
    const qualityId = evalQuestions.find((eq) => eq.slug === 'quality')?.id

    const excludedComponentTypes = db
      .selectFrom('component_types')
      .select('id')
      .where('code', 'in', ['INS', 'T/D'])

    const rows = await db
      .selectFrom('sections as sec')
      .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
      .innerJoin('subjects as s', 's.id', 'co.subject_id')
      .innerJoin('schedules as sch', 'sch.section_id', 'sec.id')
      .innerJoin('schedule_instructors as si', 'si.schedule_id', 'sch.id')
      .innerJoin('instructors as i', 'i.id', 'si.instructor_id')
      .leftJoin('evaluation_smart_averages as esa', (join) => {
        let j = join.onRef('esa.section_id', '=', 'sec.id')
        if (qualityId != null) {
          j = j.on('esa.question_id', '=', qualityId)
        }
        return j
      })
      .select([
        's.code as subject_code',
        'co.code_number',
        'co.code_suffix',
        'co.title',
        'sec.term_quarter as quarter',
        'co.year',
        db.fn.avg<number>('esa.smart_average' as never).as('avg_quality'),
      ])
      .where('i.sunet', '=', data.sunet)
      .where('co.year', 'in', data.years)
      .where('sec.is_principal', '=', true)
      .where('sec.cancelled', '=', false)
      .where('sec.component_type_id', 'not in', excludedComponentTypes)
      .groupBy(['s.code', 'co.code_number', 'co.code_suffix', 'co.title', 'sec.term_quarter', 'co.year'])
      .orderBy('co.year', 'desc')
      .execute()

    const quarterOrder = ['Autumn', 'Winter', 'Spring', 'Summer']

    const entries: InstructorCourseEntry[] = rows
      .map((r) => {
        const suffix = r.code_suffix != null && String(r.code_suffix) !== '' ? String(r.code_suffix) : ''
        const subjectCode = String(r.subject_code)
        const codeNumber = Number(r.code_number)
        return {
          courseCodeSlug: `${subjectCode.toLowerCase()}${codeNumber}${suffix.toLowerCase()}`,
          displayCode: `${subjectCode} ${codeNumber}${suffix}`,
          title: String(r.title ?? ''),
          quarter: String(r.quarter),
          year: String(r.year),
          avgQuality: r.avg_quality != null ? Number(r.avg_quality) : null,
        }
      })
      .sort((a, b) => {
        if (a.year !== b.year) return b.year.localeCompare(a.year)
        return quarterOrder.indexOf(a.quarter) - quarterOrder.indexOf(b.quarter)
      })

    return {
      sunet: data.sunet,
      name: instructor.first_and_last_name ?? data.sunet,
      entries,
    }
  })

// ── Text reviews ─────────────────────────────────────────────────────────────

export type CourseTextReview = {
  responseText: string
  quarter: string
  year: string
  instructorName: string | null
}

const TEXT_QUESTION_IDS = [1, 373]

export const getCourseTextReviews = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      courseCodeSlug: z.string().min(1),
      quarterYears: z.array(z.object({ quarter: z.string(), year: z.string() })).min(1),
      instructorSunets: z.array(z.string()),
    }),
  )
  .handler(async ({ data }): Promise<CourseTextReview[]> => {
    const parsed = parseCourseCodeSlug(data.courseCodeSlug)
    if (!parsed) return []

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    let secQuery = db
      .selectFrom('sections as sec')
      .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
      .innerJoin('subjects as s', 's.id', 'co.subject_id')
      .select('sec.id')
      .where('s.code', '=', parsed.subjectCode)
      .where('co.code_number', '=', parsed.codeNumber)
      .where('sec.is_principal', '=', true)
      .where('sec.cancelled', '=', false)
      .where((eb) =>
        eb.or(
          data.quarterYears.map((qy) =>
            eb.and([
              eb('sec.term_quarter', '=', qy.quarter as 'Autumn' | 'Winter' | 'Spring' | 'Summer'),
              eb('co.year', '=', qy.year),
            ]),
          ),
        ),
      )

    if (parsed.codeSuffix === null) {
      secQuery = secQuery.where((eb) =>
        eb.or([eb('co.code_suffix', 'is', null), eb('co.code_suffix', '=', '')]),
      )
    } else {
      secQuery = secQuery.where('co.code_suffix', '=', parsed.codeSuffix)
    }

    if (data.instructorSunets.length > 0) {
      secQuery = secQuery.where((eb) =>
        eb.exists(
          eb
            .selectFrom('schedules as sch')
            .innerJoin('schedule_instructors as si', 'si.schedule_id', 'sch.id')
            .innerJoin('instructors as i', 'i.id', 'si.instructor_id')
            .whereRef('sch.section_id', '=', 'sec.id')
            .where('i.sunet', 'in', data.instructorSunets)
            .select(eb.val(1).as('one')),
        ),
      )
    }

    const rows = await db
      .selectFrom('evaluation_text_responses as etr')
      .innerJoin('evaluation_report_sections as ers', 'ers.report_id', 'etr.report_id')
      .innerJoin('sections as sec2', 'sec2.id', 'ers.section_id')
      .innerJoin('course_offerings as co2', 'co2.id', 'sec2.course_offering_id')
      .leftJoin('schedules as sch2', 'sch2.section_id', 'sec2.id')
      .leftJoin('schedule_instructors as si2', 'si2.schedule_id', 'sch2.id')
      .leftJoin('instructors as i2', 'i2.id', 'si2.instructor_id')
      .select([
        'etr.id as review_id',
        'etr.response_text',
        'sec2.term_quarter as quarter',
        'co2.year',
        'i2.first_and_last_name as instructor_name',
      ])
      .where('ers.section_id', 'in', secQuery)
      .where('etr.question_id', 'in', TEXT_QUESTION_IDS)
      .orderBy('co2.year', 'desc')
      .execute()

    const seen = new Set<number>()
    const quarterOrder = ['Autumn', 'Winter', 'Spring', 'Summer']
    const reviews: CourseTextReview[] = []

    for (const r of rows) {
      const id = Number(r.review_id)
      if (seen.has(id)) continue
      seen.add(id)
      const text = String(r.response_text ?? '').trim()
      if (text.length === 0) continue
      reviews.push({
        responseText: text,
        quarter: String(r.quarter),
        year: String(r.year),
        instructorName: r.instructor_name != null ? String(r.instructor_name) : null,
      })
    }

    reviews.sort((a, b) => {
      if (a.year !== b.year) return b.year.localeCompare(a.year)
      return quarterOrder.indexOf(b.quarter) - quarterOrder.indexOf(a.quarter)
    })

    return reviews
  })

export const searchCourses = createServerFn({ method: 'GET' })
  .inputValidator(searchFnInputSchema)
  .handler(
    async ({
      data,
    }): Promise<{ results: (SearchCourseResult | SearchCourseResultStub)[]; totalCount: number }> => {
      const { getServerDb } = await import('@/lib/server-db')
      const { parseSearchQuery } = await import('./parse-search-query')
      const { searchCourseOfferings } = await import('./search.query')

      const db = getServerDb()

      let subjects = cachedSubjectsByYear.get(data.year)
      if (!subjects) {
        const rows = await db
          .selectFrom('subjects')
          .innerJoin('course_offerings as co', 'co.subject_id', 'subjects.id')
          .leftJoin('schools', 'schools.id', 'subjects.school_id')
          .select(['subjects.code', 'schools.name as school'])
          .where('co.year', '=', data.year)
          .distinct()
          .execute()
        subjects = rows.map((r) => ({ code: r.code, school: r.school ?? null }))
        cachedSubjectsByYear.set(data.year, subjects)
        console.log(`[search] subjects cache ready for ${data.year} (${subjects.length} codes)`)
      }

      const rawQuery = data.query.trim().replaceAll(/\s+/g, ' ')
      const parsed = parseSearchQuery(
        rawQuery,
        subjects.map((s) => s.code),
      )

      if (!cachedCareersByYear.has(data.year)) {
        const rows = await db
          .selectFrom('academic_careers as ac')
          .innerJoin('course_offerings as co', 'co.academic_career_id', 'ac.id')
          .select(['ac.id', 'ac.code'])
          .where('co.year', '=', data.year)
          .distinct()
          .execute()
        cachedCareersByYear.set(
          data.year,
          rows.map((r) => ({ id: r.id, code: r.code })),
        )
      }
      if (!cachedGradingOptionsByYear.has(data.year)) {
        const rows = await db
          .selectFrom('grading_options as go')
          .innerJoin('course_offerings as co', 'co.grading_option_id', 'go.id')
          .select(['go.id', 'go.code'])
          .where('co.year', '=', data.year)
          .distinct()
          .execute()
        cachedGradingOptionsByYear.set(
          data.year,
          rows.map((r) => ({ id: r.id, code: r.code })),
        )
      }
      if (!cachedFinalExamOptionsByYear.has(data.year)) {
        const rows = await db
          .selectFrom('final_exam_options as fe')
          .innerJoin('course_offerings as co', 'co.final_exam_flag_id', 'fe.id')
          .select(['fe.id', 'fe.code'])
          .where('co.year', '=', data.year)
          .distinct()
          .execute()
        cachedFinalExamOptionsByYear.set(
          data.year,
          rows.map((r) => ({ id: r.id, code: r.code })),
        )
      }
      if (!cachedComponentTypesByYear.has(data.year)) {
        const rows = await db
          .selectFrom('component_types as ct')
          .innerJoin('sections as sec', 'sec.component_type_id', 'ct.id')
          .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
          .select(['ct.id', 'ct.code'])
          .where('co.year', '=', data.year)
          .where('sec.is_principal', '=', true)
          .distinct()
          .execute()
        cachedComponentTypesByYear.set(
          data.year,
          rows.map((r) => ({ id: r.id, code: r.code })),
        )
      }

      const makeResolver = (entries: { id: number; code: string }[]) => {
        const map = new Map(entries.map((e) => [e.code, e.id]))
        return (codes: string[] | undefined): number[] | undefined => {
          if ((codes?.length ?? 0) === 0) return undefined
          const ids = codes!.map((c) => map.get(c)).filter((id): id is number => id != null)
          return ids.length ? ids : undefined
        }
      }
      const resolveCareerIds = makeResolver(cachedCareersByYear.get(data.year)!)
      const resolveGradingIds = makeResolver(cachedGradingOptionsByYear.get(data.year)!)
      const resolveFinalExamIds = makeResolver(cachedFinalExamOptionsByYear.get(data.year)!)
      const resolveComponentTypeIds = makeResolver(cachedComponentTypesByYear.get(data.year)!)

      const evalQuestions = await getEvalQuestions()
      const slugToId = new Map(evalQuestions.map((q) => [q.slug, q.id]))
      const evalQuestionIds = Object.fromEntries(
        EVAL_QUESTION_SLUGS.map((slug) => {
          const id = slugToId.get(slug)
          if (id == null) throw new Error(`Missing eval question id for slug: ${slug}`)
          return [slug, id]
        }),
      ) as Record<EvalSlug, number>

      const evalFiltersMap: Record<string, { min?: number; max?: number }> = {}
      for (const slug of EVAL_QUESTION_SLUGS) {
        const min = data[`min_eval_${slug}` as keyof SearchParams] as number | undefined
        const max = data[`max_eval_${slug}` as keyof SearchParams] as number | undefined
        if (min != null || max != null) {
          evalFiltersMap[slug] = { min, max }
        }
      }

      // Parsed quarters override the filter's include list unless includeMode is 'and',
      // in which case both sets are merged (all must match).
      const mergedQuartersInclude = (
        parsed.quarters.length > 0 && data.quartersIncludeMode !== 'and'
          ? parsed.quarters
          : [...new Set([...data.quarters, ...parsed.quarters])]
      ) as QuarterEnum[]

      // Set filter helpers
      const hasQuarters = mergedQuartersInclude.length > 0 || data.quartersExclude.length > 0
      const mergedGersInclude = [...new Set([...(data.gers ?? []), ...parsed.wayGers])]
      const hasGers = mergedGersInclude.length > 0 || (data.gersExclude?.length ?? 0) > 0
      const hasDays = (data.days?.length ?? 0) > 0 || (data.daysExclude?.length ?? 0) > 0
      const hasInstructors = data.instructorSunets.length > 0 || data.instructorSunetsExclude.length > 0

      const subjectInclude = expandSubjectTokens(data.subjects ?? [], subjects)
      const subjectExclude = expandSubjectTokens(data.subjectsExclude ?? [], subjects)
      const hasSubjects = subjectInclude.length > 0 || subjectExclude.length > 0

      const searchParams: SearchQueryParams = {
        year: data.year,
        code: parsed.codes.map((c) => ({
          subject: c.subject,
          code_number: c.codeNumber,
          code_suffix: c.codeSuffix,
        })),
        query: parsed.remainingQuery || undefined,
        querySubjects: parsed.subjectsOnly.length > 0 ? parsed.subjectsOnly : undefined,
        subjects: hasSubjects
          ? {
              include: subjectInclude,
              exclude: subjectExclude,
              includeMode: data.subjectsIncludeMode,
              withCrosslistings: data.subjectsWithCrosslistings ?? true,
            }
          : undefined,

        quarters: hasQuarters
          ? {
              include: mergedQuartersInclude,
              exclude: data.quartersExclude as QuarterEnum[],
              includeMode: data.quartersIncludeMode,
            }
          : undefined,

        gers: hasGers
          ? {
              include: mergedGersInclude,
              exclude: data.gersExclude ?? [],
              includeMode: data.gersIncludeMode,
            }
          : undefined,

        units:
          data.unitsMin != null || data.unitsMax != null
            ? { min: data.unitsMin, max: data.unitsMax, mode: data.unitsMode }
            : undefined,

        codeNumberRange:
          data.codeNumberMin != null || data.codeNumberMax != null
            ? { min: data.codeNumberMin, max: data.codeNumberMax }
            : undefined,

        repeatable: data.repeatable,
        hasAccompanyingSections: data.hasAccompanyingSections,
        newThisYear: data.year >= '2022-2023' ? data.newThisYear : undefined,
        gradingOptionId: resolveGradingIds(expandGradingTokens(data.gradingOptions)),
        gradingOptionIdExclude: resolveGradingIds(expandGradingTokens(data.gradingOptionsExclude)),
        academicCareerId: resolveCareerIds(data.careers),
        academicCareerIdExclude: resolveCareerIds(data.careersExclude),
        finalExamFlagId: resolveFinalExamIds(data.finalExamFlags),
        finalExamFlagIdExclude: resolveFinalExamIds(data.finalExamFlagsExclude),

        numGers:
          data.numGersMin != null || data.numGersMax != null
            ? { min: data.numGersMin, max: data.numGersMax }
            : undefined,

        numSubjects:
          data.numSubjectsMin != null || data.numSubjectsMax != null
            ? { min: data.numSubjectsMin, max: data.numSubjectsMax }
            : undefined,

        numQuarters:
          data.numQuartersMin != null || data.numQuartersMax != null
            ? { min: data.numQuartersMin, max: data.numQuartersMax }
            : undefined,

        numMeetingDays:
          data.numMeetingDaysMin != null || data.numMeetingDaysMax != null
            ? { min: data.numMeetingDaysMin, max: data.numMeetingDaysMax }
            : undefined,

        componentTypeId: {
          include: resolveComponentTypeIds(data.componentTypes),
          exclude: resolveComponentTypeIds(data.componentTypesExclude),
          includeMode: 'or' as const,
        },

        numEnrolled:
          data.numEnrolledMin != null || data.numEnrolledMax != null
            ? { min: data.numEnrolledMin, max: data.numEnrolledMax }
            : undefined,

        maxEnrolled:
          data.maxEnrolledMin != null || data.maxEnrolledMax != null
            ? { min: data.maxEnrolledMin, max: data.maxEnrolledMax }
            : undefined,

        enrollmentStatus: (data.enrollmentStatus?.length ?? 0) > 0 ? data.enrollmentStatus : undefined,

        instructorSunets: hasInstructors
          ? {
              include: data.instructorSunets,
              exclude: data.instructorSunetsExclude,
              includeMode: data.instructorSunetsIncludeMode,
            }
          : undefined,

        days: hasDays
          ? {
              include: data.days ?? [],
              exclude: data.daysExclude ?? [],
              includeMode: data.daysIncludeMode,
            }
          : undefined,

        classDuration:
          data.classDurationMin != null || data.classDurationMax != null
            ? { min: data.classDurationMin, max: data.classDurationMax }
            : undefined,

        startTime:
          data.startTimeMin != null
            ? { min: Temporal.PlainTime.from(data.startTimeMin), max: undefined }
            : undefined,

        endTime:
          data.endTimeMax != null
            ? { min: undefined, max: Temporal.PlainTime.from(data.endTimeMax) }
            : undefined,

        evalFilters:
          Object.keys(evalFiltersMap).length > 0
            ? (evalFiltersMap as SearchQueryParams['evalFilters'])
            : undefined,

        hoursPerUnitFilter:
          data.min_eval_hours_per_unit != null || data.max_eval_hours_per_unit != null
            ? { min: data.min_eval_hours_per_unit, max: data.max_eval_hours_per_unit }
            : undefined,

        sort: { by: data.sort, direction: data.order },
        page: data.page,
        dedupeCrosslistings: data.dedupeCrosslistings ?? true,
        evalQuestionIds,
      }

      const start = performance.now()

      const t0 = performance.now()
      const embedding = parsed.remainingQuery
        ? await generateQueryEmbedding(parsed.remainingQuery).catch(() => null)
        : null
      const embeddingMs = (performance.now() - t0).toFixed(1)

      const t1 = performance.now()
      const { results: rawResults, totalCount } = await searchCourseOfferings(db, {
        ...searchParams,
        embedding: embedding ?? undefined,
        cachedOfferingIds: [...cachedSectionsByOfferingId.keys()],
      })
      const queryMs = (performance.now() - t1).toFixed(1)

      const nullSectionsCount = rawResults.filter((r) => r.sections === null).length
      console.log(
        `[sections-cache] ${nullSectionsCount}/${rawResults.length} rows had null sections (served from cache)`,
      )

      const hydratedResults: SearchCourseResult[] = rawResults.map((r) => {
        if (r.sections != null) {
          cachedSectionsByOfferingId.set(r.id, r.sections)
          return r as SearchCourseResult
        }
        return { ...r, sections: cachedSectionsByOfferingId.get(r.id) ?? [] }
      })

      const clientCachedSet = new Set(data.clientCachedOfferingIds ?? [])
      const stubCount = hydratedResults.filter((r) => clientCachedSet.has(r.id)).length
      console.log(`[client-cache] ${stubCount}/${hydratedResults.length} rows stubbed for client cache`)

      const results: (SearchCourseResult | SearchCourseResultStub)[] = hydratedResults.map(
        (r): SearchCourseResult | SearchCourseResultStub =>
          clientCachedSet.has(r.id)
            ? {
                id: r.id,
                year: r.year,
                subject_code: r.subject_code,
                code_number: r.code_number,
                code_suffix: r.code_suffix,
                _stub: true,
              }
            : r,
      )

      console.log(
        `[search] total=${(performance.now() - start).toFixed(1)}ms embedding=${embeddingMs}ms query=${queryMs}ms (q="${rawQuery}", results=${results.length}, totalCount=${totalCount})`,
      )
      return { results, totalCount }
    },
  )
