import { createServerFn } from '@tanstack/react-start'
import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

import { searchParamsSchema } from './search.params'
import { getEvalQuestions, EVAL_QUESTION_SLUGS } from './eval-questions'
import { generateQueryEmbedding, preloadModel } from './embeddings'

import type { EvalSlug } from './eval-questions'
import type { SearchParams, SearchCourseResult } from './search.params'
import type { SearchQueryParams } from './search.query'
import { QuarterEnum } from '@courses/scrape/shared/schemas'

void preloadModel()

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

export const searchCourses = createServerFn({ method: 'GET' })
  .inputValidator(searchParamsSchema)
  .handler(async ({ data }): Promise<{ results: SearchCourseResult[]; totalCount: number }> => {
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

    // Set filter helpers
    const hasQuarters = data.quarters.length > 0 || data.quartersExclude.length > 0
    const hasGers = (data.gers?.length ?? 0) > 0 || (data.gersExclude?.length ?? 0) > 0
    const hasDays = (data.days?.length ?? 0) > 0 || (data.daysExclude?.length ?? 0) > 0
    const hasInstructors = data.instructorSunets.length > 0 || data.instructorSunetsExclude.length > 0

    const subjectInclude = data.subjects ?? []
    const hasSubjects = subjectInclude.length > 0 || (data.subjectsExclude?.length ?? 0) > 0

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
            exclude: data.subjectsExclude ?? [],
            includeMode: data.subjectsIncludeMode,
            withCrosslistings: data.subjectsWithCrosslistings ?? true,
          }
        : undefined,

      quarters: hasQuarters
        ? {
            include: data.quarters as QuarterEnum[],
            exclude: data.quartersExclude as QuarterEnum[],
            includeMode: data.quartersIncludeMode,
          }
        : undefined,

      gers: hasGers
        ? {
            include: data.gers ?? [],
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
      gradingOptionId: resolveGradingIds(data.gradingOptions),
      gradingOptionIdExclude: resolveGradingIds(data.gradingOptionsExclude),
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
        data.startTimeMin != null || data.startTimeMax != null
          ? {
              min: data.startTimeMin != null ? Temporal.PlainTime.from(data.startTimeMin) : undefined,
              max: data.startTimeMax != null ? Temporal.PlainTime.from(data.startTimeMax) : undefined,
            }
          : undefined,

      evalFilters:
        Object.keys(evalFiltersMap).length > 0
          ? (evalFiltersMap as SearchQueryParams['evalFilters'])
          : undefined,
      sort: { by: data.sort, direction: data.order },
      page: data.page,
      dedupeCrosslistings: data.dedupeCrosslistings ?? true,
      evalQuestionIds,
    }

    const start = performance.now()

    const t0 = performance.now()
    const embedding = rawQuery ? await generateQueryEmbedding(rawQuery).catch(() => null) : null
    const embeddingMs = (performance.now() - t0).toFixed(1)

    const t1 = performance.now()
    const { results, totalCount } = await searchCourseOfferings(db, {
      ...searchParams,
      embedding: embedding ?? undefined,
    })
    const queryMs = (performance.now() - t1).toFixed(1)

    console.log(
      `[search] total=${(performance.now() - start).toFixed(1)}ms embedding=${embeddingMs}ms query=${queryMs}ms (q="${rawQuery}", results=${results.length}, totalCount=${totalCount})`,
    )
    return { results, totalCount }
  })
