import { createServerFn } from '@tanstack/react-start'

import { getServerDb } from '@/lib/server-db'
import { parseSearchQuery } from './parse-search-query'
import { searchCourseOfferings } from './search.queries'
import { searchInputSchema } from './search.types'

import type { QuarterType } from '@courses/db/db'
import type { SearchCourseResult } from './search.types'

const ALL_QUARTERS: QuarterType[] = ['Autumn', 'Winter', 'Spring', 'Summer']

let cachedSubjects: string[] | null = null

export const searchCourses = createServerFn({ method: 'GET' })
  .inputValidator(searchInputSchema)
  .handler(async ({ data }): Promise<SearchCourseResult[]> => {
    console.log('[searchCourses] received data:', data)
    console.log('[searchCourses] data.query:', data.query)
    console.log('[searchCourses] data.query type:', typeof data.query)
    console.log('[searchCourses] data.query length:', data.query?.length)

    const query = data.query.trim().replaceAll(/\s+/g, ' ')
    console.log('[searchCourses] trimmed query:', query)
    console.log('[searchCourses] trimmed query length:', query.length)

    if (query.length === 0) {
      console.log('[searchCourses] query is empty, returning empty array')
      return []
    }

    const db = getServerDb()

    if (!cachedSubjects) {
      const subjectRows = await db.selectFrom('subjects').select('code').execute()
      cachedSubjects = subjectRows.map((r) => r.code)
    } else {
      console.log('[searchCourses] cached subjects:', cachedSubjects.length)
    }

    const parsed = parseSearchQuery(query, cachedSubjects)

    const start = performance.now()

    const results = await searchCourseOfferings(db, {
      codes: parsed.codes,
      subjectCodes: parsed.subjectsOnly,
      contentQuery: parsed.remainingQuery,
      instructorQuery: parsed.remainingQuery,
      year: data.year,
      quarters: ALL_QUARTERS,
    })

    console.log(
      `[query] total: ${(performance.now() - start).toFixed(1)}ms (query="${query}", ${results.length} results)`,
    )
    return results
  })
