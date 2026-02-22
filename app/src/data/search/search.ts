import { createServerFn } from '@tanstack/react-start'

import { getEvalQuestions } from './eval-questions'
import { searchInputSchema } from './search.types'

import type { EvalSlug } from './eval-questions'
import type { EvalFilterParam } from './search.queries'
import type { SearchCourseResult } from './search.types'

let cachedSubjects: string[] | null = null
let warmingStarted = false
let cachedYears: string[] | null = null

export const warmSubjectsCache = createServerFn({ method: 'GET' }).handler(async () => {
  if (cachedSubjects) return
  const { getServerDb } = await import('@/lib/server-db')
  const db = getServerDb()
  const rows = await db.selectFrom('subjects').select('code').execute()
  cachedSubjects = rows.map((r) => r.code)
  console.log(`[startup] warmed ${cachedSubjects.length} subject codes`)
})

export const getAvailableYears = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  if (cachedYears) return cachedYears
  const { getServerDb } = await import('@/lib/server-db')
  const db = getServerDb()
  const rows = await db
    .selectFrom('offering_quarters_mv')
    .select('year')
    .distinct()
    .orderBy('year', 'desc')
    .execute()
  cachedYears = rows.map((r) => r.year)
  console.log(`[startup] warmed ${cachedYears.length} available years`)
  return cachedYears
})

export const searchCourses = createServerFn({ method: 'GET' })
  .inputValidator(searchInputSchema)
  .handler(async ({ data }): Promise<{ results: SearchCourseResult[]; hasMore: boolean }> => {
    const { getServerDb } = await import('@/lib/server-db')
    const { parseSearchQuery } = await import('./parse-search-query')
    const { searchCourseOfferings } = await import('./search.queries')

    const query = data.query.trim().replaceAll(/\s+/g, ' ')

    const db = getServerDb()

    if (!cachedSubjects) {
      const rows = await db.selectFrom('subjects').select('code').execute()
      cachedSubjects = rows.map((r) => r.code)
    }

    if (!warmingStarted) {
      warmingStarted = true
      console.log(`[search] subjects cache ready (${cachedSubjects.length} codes)`)
    }

    const parsed = parseSearchQuery(query, cachedSubjects)

    const evalQuestions = await getEvalQuestions()
    const evalQuestionIds = Object.fromEntries(evalQuestions.map((q) => [q.slug, q.id])) as Record<
      EvalSlug,
      number
    >

    const evalFilters: EvalFilterParam[] = data.evalFilters.filter((f) => f.min != null || f.max != null)

    const start = performance.now()

    const { results, hasMore } = await searchCourseOfferings(db, {
      codes: parsed.codes,
      subjectCodes: parsed.subjectsOnly,
      contentQuery: parsed.remainingQuery,
      year: data.year,
      quarters: data.quarters,
      ways: data.ways,
      unitsMin: data.unitsMin,
      unitsMax: data.unitsMax,
      evalQuestionIds,
      sort: data.sort,
      sortOrder: data.order,
      evalFilters,
      page: data.page,
    })

    console.log(
      `[query] total: ${(performance.now() - start).toFixed(1)}ms (query="${query}", ${results.length} results, hasMore=${hasMore})`,
    )
    return { results, hasMore }
  })
