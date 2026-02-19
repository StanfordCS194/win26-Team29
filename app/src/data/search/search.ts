import { createServerFn } from '@tanstack/react-start'

import { searchInputSchema } from './search.types'

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
    .selectFrom('eligible_offerings_mv')
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
  .handler(async ({ data }): Promise<SearchCourseResult[]> => {
    const { getServerDb } = await import('@/lib/server-db')
    const { parseSearchQuery } = await import('./parse-search-query')
    const { searchCourseOfferings } = await import('./search.queries')

    const query = data.query.trim().replaceAll(/\s+/g, ' ')

    if (query.length === 0) return []

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

    const start = performance.now()

    const results = await searchCourseOfferings(db, {
      codes: parsed.codes,
      subjectCodes: parsed.subjectsOnly,
      contentQuery: parsed.remainingQuery,
      instructorQuery: parsed.remainingQuery,
      year: data.year,
      quarters: data.quarters,
    })

    console.log(
      `[query] total: ${(performance.now() - start).toFixed(1)}ms (query="${query}", ${results.length} results)`,
    )
    return results
  })
