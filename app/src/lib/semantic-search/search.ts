import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db.types'
import type { SearchOptions, SearchResponse, CourseSearchResult } from './types'
import { generateQueryEmbedding } from './embeddings'
import { buildVectorSearchQuery, getInstructorsForCourses } from './db-queries'
import { validateSearchQuery, validateSearchOptions, normalizeQuery } from './utils'
import { QueryError } from './errors'

/**
 * Perform semantic search for courses
 * @param db - Kysely database instance
 * @param query - User's search query
 * @param options - Search filters and options
 * @returns Search results with similarity scores
 */
export async function searchCourses(
  db: Kysely<DB>,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const startTime = Date.now()

  try {
    // 1. Validate inputs
    validateSearchQuery(query)
    validateSearchOptions(options)

    // 2. Normalize query
    const normalizedQuery = normalizeQuery(query)

    // 3. Generate embedding for search query
    const queryEmbedding = await generateQueryEmbedding(normalizedQuery)

    // 4. Build and execute vector search query
    const baseResults = await buildVectorSearchQuery(db, queryEmbedding, options).execute()

    // 5. Get instructors for all results
    const courseIds = baseResults.map((r) => r.id)
    const instructorsMap = await getInstructorsForCourses(db, courseIds)

    // 6. Format results
    const results: CourseSearchResult[] = baseResults.map((course) => ({
      id: course.id,
      courseCode: formatCourseCode(course),
      title: course.title,
      description: truncateDescription(course.description, 200),
      subject: course.subject_code,
      subjectLongname: course.subject_longname,
      year: course.year,
      instructors: instructorsMap.get(course.id) || [],
      similarity: course.similarity,
      units: {
        min: course.units_min,
        max: course.units_max,
      },
    }))

    // 7. Build stats
    const stats = {
      totalSearched: baseResults.length,
      resultsReturned: results.length,
      processingTimeMs: Date.now() - startTime,
    }

    return { results, stats }
  } catch (error) {
    if (error instanceof Error) {
      throw new QueryError(`Search failed: ${error.message}`, error)
    }
    throw new QueryError('Search failed with unknown error', error)
  }
}

/**
 * Format course code from components (e.g., CS + 106 + A = "CS106A")
 */
function formatCourseCode(course: {
  subject_code: string
  code_number: number
  code_suffix: string | null
}): string {
  return `${course.subject_code}${course.code_number}${course.code_suffix ?? ''}`
}

/**
 * Truncate description to specified length with ellipsis
 */
function truncateDescription(description: string, maxLength: number): string {
  if (description.length <= maxLength) {
    return description
  }
  return description.slice(0, maxLength).trim() + '...'
}
