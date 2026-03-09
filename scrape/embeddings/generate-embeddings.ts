import { Effect, Console } from 'effect'
import { pipeline } from '@xenova/transformers'
import { sql } from 'kysely'

import { DbService } from '@scrape/shared/db-layer.ts'
import { ModelLoadError, EmbeddingGenerationError, DatabaseUpdateError } from './errors.ts'

import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db-postgres-js'
import type { SingleBar } from 'cli-progress'

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIMENSIONS = 384

interface CourseRow {
  id: number
  title: string
  title_clean: string | null
  description: string
  subject_code: string
  subject_longname: string | null
}

interface GenerateOptions {
  batchSize: number
  concurrency: number
  year?: string
  subject?: string
  force: boolean
}

interface GenerateResult {
  total: number
  success: number
  failed: number
}

function prepareCourseText(course: {
  title: string
  titleClean: string | null
  description: string
  subjectLongname: string | null
}): string {
  const title = course.titleClean ?? course.title
  const parts = [course.subjectLongname, title, course.description].filter(Boolean)
  return parts.join('\n\n')
}

function loadModel() {
  return Effect.tryPromise({
    try: () => pipeline('feature-extraction', MODEL_NAME),
    catch: (error) =>
      new ModelLoadError({
        message: `Failed to load model ${MODEL_NAME}`,
        modelName: MODEL_NAME,
        cause: error,
      }),
  })
}

function fetchCourseBatch(
  db: Kysely<DB>,
  offset: number,
  options: GenerateOptions,
): Effect.Effect<CourseRow[], DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      let query = db
        .selectFrom('course_offerings as co')
        .innerJoin('subjects as s', 's.id', 'co.subject_id')
        .select([
          'co.id',
          'co.title',
          'co.title_clean',
          'co.description',
          's.code as subject_code',
          's.longname as subject_longname',
        ])
        .orderBy('co.id', 'asc')
        .limit(options.batchSize)
        .offset(offset)

      if (!options.force) {
        query = query.where('co.embedding', 'is', null)
      }

      if (options.year != null && options.year !== '') {
        query = query.where('co.year', '=', options.year)
      }

      if (options.subject != null && options.subject !== '') {
        query = query.where('s.code', '=', options.subject)
      }

      const rows = await query.execute()
      if (rows.length === 0) return []

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        title_clean: row.title_clean,
        description: row.description,
        subject_code: row.subject_code,
        subject_longname: row.subject_longname,
      }))
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: 'Failed to fetch course batch',
        courseIds: [],
        cause: error,
      }),
  })
}

function countCourses(db: Kysely<DB>, options: GenerateOptions): Effect.Effect<number, DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      let query = db
        .selectFrom('course_offerings as co')
        .innerJoin('subjects as s', 's.id', 'co.subject_id')
        .select(db.fn.countAll<number>().as('count'))

      if (!options.force) {
        query = query.where('co.embedding', 'is', null)
      }

      if (options.year != null && options.year !== '') {
        query = query.where('co.year', '=', options.year)
      }

      if (options.subject != null && options.subject !== '') {
        query = query.where('s.code', '=', options.subject)
      }

      const result = await query.executeTakeFirstOrThrow()
      return Number(result.count)
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: 'Failed to count courses',
        courseIds: [],
        cause: error,
      }),
  })
}

function generateEmbedding(
  extractor: Awaited<ReturnType<typeof pipeline>>,
  text: string,
  courseId: number,
  courseCode: string,
): Effect.Effect<number[], EmbeddingGenerationError> {
  return Effect.tryPromise({
    try: async () => {
      const output = await (
        extractor as (
          text: string,
          options: { pooling: string; normalize: boolean },
        ) => Promise<{ data: Float32Array }>
      )(text, { pooling: 'mean', normalize: true })
      return Array.from(output.data) as number[]
    },
    catch: (error) =>
      new EmbeddingGenerationError({
        message: `Failed to generate embedding for course ${courseCode}`,
        courseId,
        courseCode,
        cause: error,
      }),
  })
}

function updateEmbedding(
  db: Kysely<DB>,
  courseId: number,
  embedding: number[],
): Effect.Effect<void, DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      const vectorStr = `[${embedding.join(',')}]`
      await db
        .updateTable('course_offerings')
        .set({ embedding: sql`${vectorStr}::vector` as never })
        .where('id', '=', courseId)
        .execute()
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: `Failed to update embedding for course ${courseId}`,
        courseIds: [courseId],
        cause: error,
      }),
  })
}

export function generateEmbeddings(
  options: GenerateOptions,
  progressBar?: SingleBar,
): Effect.Effect<GenerateResult, ModelLoadError | EmbeddingGenerationError | DatabaseUpdateError, DbService> {
  return Effect.gen(function* () {
    const db = yield* DbService

    // Load model
    yield* Console.log('Loading embedding model...')
    const extractor = yield* loadModel()
    yield* Console.log(`Model loaded: ${MODEL_NAME} (${EMBEDDING_DIMENSIONS} dimensions)\n`)

    // Count total courses
    const total = yield* countCourses(db, options)
    if (total === 0) {
      yield* Console.log('No courses found to process.')
      return { total: 0, success: 0, failed: 0 }
    }

    yield* Console.log(`Generating embeddings for ${total.toLocaleString()} courses...`)

    if (progressBar) {
      progressBar.start(total, 0)
    }

    let success = 0
    let failed = 0
    let offset = 0

    // Process in batches
    while (true) {
      const courses = yield* fetchCourseBatch(db, offset, options)
      if (courses.length === 0) break

      // Process each course in the batch
      for (const course of courses) {
        const text = prepareCourseText({
          title: course.title,
          titleClean: course.title_clean,
          description: course.description,
          subjectLongname: course.subject_longname,
        })

        const embeddingResult = yield* Effect.either(
          generateEmbedding(extractor, text, course.id, course.subject_code),
        )

        if (embeddingResult._tag === 'Left') {
          failed++
          yield* Console.error(
            `  Failed to generate embedding for course ${course.id} (${course.subject_code}): ${embeddingResult.left.message}`,
          )
        } else {
          const updateResult = yield* Effect.either(updateEmbedding(db, course.id, embeddingResult.right))

          if (updateResult._tag === 'Left') {
            failed++
            yield* Console.error(
              `  Failed to update embedding for course ${course.id}: ${updateResult.left.message}`,
            )
          } else {
            success++
          }
        }

        if (progressBar) {
          progressBar.update(success + failed)
        }
      }

      offset += courses.length
    }

    if (progressBar) {
      progressBar.stop()
    }

    yield* Console.log(`\nDone! Processed ${(success + failed).toLocaleString()} courses.`)
    yield* Console.log(`  Success: ${success.toLocaleString()}`)
    if (failed > 0) {
      yield* Console.log(`  Failed: ${failed.toLocaleString()}`)
    }

    if (success > 0) {
      yield* Console.log('\nRefreshing subject embedding centroids materialized view...')
      yield* Effect.promise(() =>
        db.schema.refreshMaterializedView('subject_embedding_centroids_mv').concurrently().execute(),
      )
      yield* Console.log('Refreshed subject embedding centroids materialized view.')
    }

    return { total, success, failed }
  })
}
