import { Effect, Console } from 'effect'
import { sql } from 'kysely'

import { DbService } from '@scrape/shared/db-layer.ts'
import { DatabaseUpdateError } from './errors.ts'

import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db-postgres-js'
import type { SingleBar } from 'cli-progress'

const REVIEW_QUESTION =
  'What would you like to say about this course to a student who is considering taking it in the future?'
const MAX_REVIEW_TEXT_LENGTH = 1500

interface AggregateOptions {
  batchSize: number
  force: boolean
  year?: string
  subject?: string
}

interface AggregateResult {
  total: number
  updated: number
  skipped: number
}

interface AggregatedRow {
  course_offering_id: number
  aggregated_review_text: string
}

function fetchAggregatedReviews(
  db: Kysely<DB>,
  offset: number,
  options: AggregateOptions,
): Effect.Effect<AggregatedRow[], DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      let query = db
        .selectFrom('course_offerings as co')
        .innerJoin('sections as s', 's.course_offering_id', 'co.id')
        .innerJoin('evaluation_report_sections as ers', 'ers.section_id', 's.id')
        .innerJoin('evaluation_reports as er', 'er.id', 'ers.report_id')
        .innerJoin('evaluation_text_responses as etr', 'etr.report_id', 'er.id')
        .innerJoin('evaluation_text_questions as etq', 'etq.id', 'etr.question_id')
        .where('etq.question_text', '=', REVIEW_QUESTION)
        .select([
          'co.id as course_offering_id',
          sql<string>`string_agg(DISTINCT etr.response_text, ' | ')`.as('aggregated_review_text'),
        ])
        .groupBy('co.id')
        .orderBy('co.id', 'asc')
        .limit(options.batchSize)
        .offset(offset)

      if (!options.force) {
        query = query.where('co.review_text', 'is', null)
      }

      if (options.year != null && options.year !== '') {
        query = query.where('co.year', '=', options.year)
      }

      if (options.subject != null && options.subject !== '') {
        query = query
          .innerJoin('subjects as sub', 'sub.id', 'co.subject_id')
          .where('sub.code', '=', options.subject)
      }

      return query.execute()
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: 'Failed to fetch aggregated reviews',
        courseIds: [],
        cause: error,
      }),
  })
}

function countCoursesWithReviews(
  db: Kysely<DB>,
  options: AggregateOptions,
): Effect.Effect<number, DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      let query = db
        .selectFrom('course_offerings as co')
        .innerJoin('sections as s', 's.course_offering_id', 'co.id')
        .innerJoin('evaluation_report_sections as ers', 'ers.section_id', 's.id')
        .innerJoin('evaluation_reports as er', 'er.id', 'ers.report_id')
        .innerJoin('evaluation_text_responses as etr', 'etr.report_id', 'er.id')
        .innerJoin('evaluation_text_questions as etq', 'etq.id', 'etr.question_id')
        .where('etq.question_text', '=', REVIEW_QUESTION)
        .select(sql<number>`COUNT(DISTINCT co.id)`.as('count'))

      if (!options.force) {
        query = query.where('co.review_text', 'is', null)
      }

      if (options.year != null && options.year !== '') {
        query = query.where('co.year', '=', options.year)
      }

      if (options.subject != null && options.subject !== '') {
        query = query
          .innerJoin('subjects as sub', 'sub.id', 'co.subject_id')
          .where('sub.code', '=', options.subject)
      }

      const result = await query.executeTakeFirstOrThrow()
      return Number(result.count)
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: 'Failed to count courses with reviews',
        courseIds: [],
        cause: error,
      }),
  })
}

function truncateReviewText(text: string): string {
  if (text.length <= MAX_REVIEW_TEXT_LENGTH) return text
  return text.slice(0, MAX_REVIEW_TEXT_LENGTH).trim() + '...'
}

function updateReviewText(
  db: Kysely<DB>,
  courseOfferingId: number,
  reviewText: string,
): Effect.Effect<void, DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      await db
        .updateTable('course_offerings')
        .set({ review_text: reviewText })
        .where('id', '=', courseOfferingId)
        .execute()
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: `Failed to update review_text for course ${courseOfferingId}`,
        courseIds: [courseOfferingId],
        cause: error,
      }),
  })
}

export function aggregateReviewText(
  options: AggregateOptions,
  progressBar?: SingleBar,
): Effect.Effect<AggregateResult, DatabaseUpdateError, DbService> {
  return Effect.gen(function* () {
    const db = yield* DbService

    const total = yield* countCoursesWithReviews(db, options)
    if (total === 0) {
      yield* Console.log('No courses with review text found to process.')
      return { total: 0, updated: 0, skipped: 0 }
    }

    yield* Console.log(`Aggregating review text for ${total.toLocaleString()} courses...`)

    if (progressBar) {
      progressBar.start(total, 0)
    }

    let updated = 0
    let skipped = 0
    let offset = 0

    while (true) {
      const rows = yield* fetchAggregatedReviews(db, offset, options)
      if (rows.length === 0) break

      for (const row of rows) {
        if (!row.aggregated_review_text || row.aggregated_review_text.trim() === '') {
          skipped++
        } else {
          const truncated = truncateReviewText(row.aggregated_review_text)
          const updateResult = yield* Effect.either(updateReviewText(db, row.course_offering_id, truncated))

          if (updateResult._tag === 'Left') {
            skipped++
            yield* Console.error(
              `  Failed to update review_text for course ${row.course_offering_id}: ${updateResult.left.message}`,
            )
          } else {
            updated++
          }
        }

        if (progressBar) {
          progressBar.update(updated + skipped)
        }
      }

      offset += rows.length
    }

    if (progressBar) {
      progressBar.stop()
    }

    yield* Console.log(`\nDone! Processed ${(updated + skipped).toLocaleString()} courses.`)
    yield* Console.log(`  Updated: ${updated.toLocaleString()}`)
    if (skipped > 0) {
      yield* Console.log(`  Skipped: ${skipped.toLocaleString()}`)
    }

    return { total, updated, skipped }
  })
}
