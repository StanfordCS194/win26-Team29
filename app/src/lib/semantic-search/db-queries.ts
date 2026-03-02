import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { DB } from '@courses/db/db.types'
import type { SearchOptions } from './types'

/**
 * Build a vector similarity search query
 * Uses cosine distance for similarity (pgvector operator: <=>)
 */
export function buildVectorSearchQuery(db: Kysely<DB>, embedding: number[], options: SearchOptions) {
  // Convert embedding array to PostgreSQL vector format
  const embeddingVector = `[${embedding.join(',')}]`

  // Calculate similarity (1 - distance gives us 0-1 scale where higher is better)
  const similarity = sql<number>`1 - (embedding <=> ${embeddingVector}::vector)`

  // Default limit
  const limit = options.limit ?? 20

  // Base query
  let query = db
    .selectFrom('course_offerings')
    .innerJoin('subjects', 'course_offerings.subject_id', 'subjects.id')
    .select([
      'course_offerings.id',
      'subjects.code as subject_code',
      'subjects.longname as subject_longname',
      'course_offerings.title',
      'course_offerings.description',
      'course_offerings.year',
      'course_offerings.code_number',
      'course_offerings.code_suffix',
      'course_offerings.units_min',
      'course_offerings.units_max',
      similarity.as('similarity'),
    ])
    .where('course_offerings.embedding', 'is not', null)

  // Apply filters
  if (options.subject !== undefined && options.subject !== '') {
    query = query.where('subjects.code', '=', options.subject)
  }

  if (options.year !== undefined && options.year !== '') {
    query = query.where('course_offerings.year', '=', options.year)
  }

  if (options.minUnits !== undefined) {
    query = query.where('course_offerings.units_min', '>=', options.minUnits)
  }

  if (options.maxUnits !== undefined) {
    query = query.where('course_offerings.units_max', '<=', options.maxUnits)
  }

  if (options.similarityThreshold !== undefined) {
    query = query.where(similarity, '>=', options.similarityThreshold)
  }

  // Order by similarity (highest first) and limit
  return query.orderBy(similarity, 'desc').limit(limit)
}

/**
 * Query to get instructors for a set of course offerings
 * Returns map of courseOfferingId -> instructor names
 */
export async function getInstructorsForCourses(
  db: Kysely<DB>,
  courseOfferingIds: number[],
): Promise<Map<number, string[]>> {
  if (courseOfferingIds.length === 0) {
    return new Map()
  }

  // Query to get all instructors for the given course offerings
  const results = await db
    .selectFrom('sections')
    .innerJoin('schedules', 'sections.id', 'schedules.section_id')
    .innerJoin('schedule_instructors', 'schedules.id', 'schedule_instructors.schedule_id')
    .innerJoin('instructors', 'schedule_instructors.instructor_id', 'instructors.id')
    .select(['sections.course_offering_id', 'instructors.name as instructor_name'])
    .where('sections.course_offering_id', 'in', courseOfferingIds)
    .distinct()
    .execute()

  // Build map of course_offering_id -> instructor names
  const instructorsMap = new Map<number, string[]>()

  for (const result of results) {
    const existing = instructorsMap.get(result.course_offering_id)
    if (existing) {
      existing.push(result.instructor_name)
    } else {
      instructorsMap.set(result.course_offering_id, [result.instructor_name])
    }
  }

  return instructorsMap
}
