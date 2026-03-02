import { appendFile } from 'node:fs/promises'

import { FileSystem, Path } from '@effect/platform'
import * as cliProgress from 'cli-progress'
import { Console, Effect, Option, Ref, Sink, Stream, pipe } from 'effect'

import { extractInstructors, extractLookupValues } from './upsert/extract-values.ts'
import { parsedCourseToUploadCourseOffering } from './upsert/prepare-course.ts'
import { upsertLookupCodesBatch, upsertSubjects } from './upsert/upsert-codes.ts'
import { upsertCourseOfferings } from './upsert/upsert-courses.ts'
import { upsertInstructors } from './upsert/upsert-instructors.ts'
import type { ParsedSubjectData } from './fetch-parse-flow.ts'
import type { EntityLookupIdMap } from './upsert/prepare-course.ts'
import type { CourseOfferingUpsertError } from './upsert/upsert-courses.ts'
import type { UploadCourseOffering } from './upsert/upsert-courses.types.ts'

function formatUpsertError(error: CourseOfferingUpsertError) {
  return {
    type: 'CourseOfferingUpsertError' as const,
    step: error.step,
    message: error.message,
    recordCount: error.recordCount,
    courseOfferings: error.courseOfferings.map((co) => ({
      subject_id: co.subject_id,
      code_number: co.code_number,
      code_suffix: co.code_suffix,
      year: co.year,
    })),
    ...(error.cause !== undefined && {
      cause: error.cause instanceof Error ? error.cause.message : JSON.stringify(error.cause),
    }),
  }
}

export const databaseUpsertFlow = ({
  parsedCourses,
  batchSize,
  concurrency,
  outputsDir,
}: {
  parsedCourses: Array<ParsedSubjectData>
  batchSize: number
  concurrency: number
  outputsDir: string
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem

    // Initialize failure file - delete if exists to start fresh
    const failuresPath = path.join(outputsDir, 'upsert-failures.jsonl')
    if (yield* fs.exists(failuresPath)) {
      yield* fs.remove(failuresPath)
    }

    const lookupData = extractLookupValues(parsedCourses)
    const instructors = extractInstructors(parsedCourses)
    const allParsedCourses = parsedCourses.flatMap((p) => p.courses)

    // Step 1: Upsert lookup values and subjects (subjects from SubjectCourseData: subjectName + longname)
    yield* Console.log('\nUpserting lookup values to database...')
    const lookupCodeToIdMap = yield* upsertLookupCodesBatch(lookupData)
    const codeToLongname = new Map<string, string | null>(
      parsedCourses.map((p) => [p.subjectName, p.longname ?? null]),
    )
    const subjectIdMap = yield* upsertSubjects(codeToLongname)
    yield* Console.log('Lookup values upserted')

    // Step 2: Upsert instructors
    yield* Console.log('\nUpserting instructors...')
    const instructorSunetToId = yield* upsertInstructors(instructors)
    yield* Console.log(`${instructors.length} instructors upserted`)

    // Combine lookup results
    const lookup: EntityLookupIdMap = {
      ...lookupCodeToIdMap,
      subjects: subjectIdMap,
      instructors: instructorSunetToId,
    }

    // Step 3: Upsert course offerings with progress bar
    const totalSections = allParsedCourses.reduce((sum, c) => sum + c.sections.length, 0)

    yield* Console.log(
      `\nUpserting ${allParsedCourses.length} course offerings (${totalSections} sections)...`,
    )
    yield* Console.log(`Configuration: batchSize=${batchSize} sections, concurrency=${concurrency}`)

    // Create progress bar for course offerings
    const courseProgressBar = new cliProgress.SingleBar({
      format: 'Upserting |{bar}| {percentage}% | {value}/{total} sections | Courses: {courses}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 1000,
    })

    const sectionsProcessedRef = yield* Ref.make(0)
    const coursesProcessedRef = yield* Ref.make(0)
    const batchCountRef = yield* Ref.make(0)
    const failedBatchesRef = yield* Ref.make<Array<CourseOfferingUpsertError>>([])

    courseProgressBar.start(totalSections, 0, { courses: 0 })

    yield* pipe(
      Stream.fromIterable(allParsedCourses),
      Stream.mapEffect((parsed) =>
        pipe(
          parsedCourseToUploadCourseOffering(parsed, lookup),
          Effect.map(Option.some),
          Effect.catchTag('PrepareCourseLookupError', (e) =>
            Effect.gen(function* () {
              yield* Console.warn(
                [
                  `\n[WARN] Skipping course ${e.subject}-${e.code_number}${e.code_suffix ?? ''} (${e.year}): missing lookups`,
                  `  - ${e.missingLookups.table}: "${e.missingLookups.key}"`,
                ].join('\n'),
              )
              return Option.none<UploadCourseOffering>()
            }),
          ),
        ),
      ),
      Stream.filterMap((o) => o),
      Stream.aggregate(
        Sink.foldWeighted({
          initial: [] as Array<UploadCourseOffering>,
          maxCost: batchSize,
          cost: (_acc, item) => item.sections.length,
          body: (acc, item) => [...acc, item],
        }),
      ),
      Stream.mapEffect(
        (batch) =>
          Effect.gen(function* () {
            yield* upsertCourseOfferings(batch).pipe(
              Effect.catchTag('CourseOfferingUpsertError', (error) =>
                Effect.gen(function* () {
                  // Write failure to JSONL as it happens
                  const errorReport = formatUpsertError(error)
                  const jsonLine = `${JSON.stringify(errorReport)}\n`
                  yield* Effect.promise(() => appendFile(failuresPath, jsonLine, 'utf-8'))
                  // Also update the failures ref for counting
                  yield* Ref.update(failedBatchesRef, (failures) => [...failures, error])
                }),
              ),
            )

            const batchSections = batch.reduce((sum, co) => sum + co.sections.length, 0)
            yield* Ref.update(batchCountRef, (n) => n + 1)
            const sectionsCount = yield* Ref.updateAndGet(sectionsProcessedRef, (n) => n + batchSections)
            const coursesCount = yield* Ref.updateAndGet(coursesProcessedRef, (n) => n + batch.length)
            courseProgressBar.update(sectionsCount, { courses: coursesCount })
          }),
        { concurrency },
      ),
      Stream.runDrain,
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          courseProgressBar.stop()
        }),
      ),
    )

    const totalCoursesProcessed = yield* Ref.get(coursesProcessedRef)
    const failures = yield* Ref.get(failedBatchesRef)

    // Clean up failures file if no failures occurred
    if (failures.length === 0) {
      if (yield* fs.exists(failuresPath)) {
        yield* fs.remove(failuresPath)
      }
    } else {
      yield* Console.log(`\nErrors: ${failures.length} batch(es) failed. See ${failuresPath}`)
    }

    yield* Console.log(
      `${totalCoursesProcessed} course offerings processed (${failures.length} batch failures)`,
    )
    yield* Console.log('Database upsert complete')
  })
