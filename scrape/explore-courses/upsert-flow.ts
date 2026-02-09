import { Effect, Console, Ref, Stream, Sink, pipe, Option } from 'effect'
import { FileSystem, Path } from '@effect/platform'
import * as cliProgress from 'cli-progress'
import { appendFile } from 'node:fs/promises'
import { upsertLookupCodesBatch, upsertSubjects, type LookupTable } from './upsert/upsert-codes.ts'
import { upsertInstructors } from './upsert/upsert-instructors.ts'
import { parsedCourseToUploadCourseOffering, type EntityLookupIdMap } from './upsert/prepare-course.ts'
import type { UploadCourseOffering } from './upsert/upsert-courses.types.ts'
import { upsertCourseOfferings, CourseOfferingUpsertError } from './upsert/upsert-courses.ts'
import type { ParsedSubjectData } from './fetch-parse-flow.ts'
import { extractInstructors, extractLookupValues } from './upsert/extract-values.ts'

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
    ...(error.cause !== undefined && { cause: String(error.cause) }),
  }
}

export const databaseUpsertFlow = ({
  parsedCourses,
  batchSize,
  concurrency,
  outputsDir,
}: {
  parsedCourses: ParsedSubjectData[]
  batchSize: number
  concurrency: number
  outputsDir: string
}) =>
  Effect.gen(function* (_) {
    const path = yield* _(Path.Path)
    const fs = yield* _(FileSystem.FileSystem)

    // Initialize failure file - delete if exists to start fresh
    const failuresPath = path.join(outputsDir, 'upsert-failures.jsonl')
    if (yield* _(fs.exists(failuresPath))) {
      yield* _(fs.remove(failuresPath))
    }

    const lookupData = extractLookupValues(parsedCourses)
    const instructors = extractInstructors(parsedCourses)
    const allParsedCourses = parsedCourses.flatMap((p) => p.courses)

    // Step 1: Upsert lookup values and subjects (subjects from SubjectCourseData: subjectName + longname)
    yield* _(Console.log('\nUpserting lookup values to database...'))
    const lookupCodeToIdMap = yield* _(upsertLookupCodesBatch(lookupData))
    const codeToLongname = new Map<string, string | null>(
      parsedCourses.map((p) => [p.subjectName, p.longname ?? null]),
    )
    const subjectIdMap = yield* _(upsertSubjects(codeToLongname))
    yield* _(Console.log('Lookup values upserted'))

    // Step 2: Upsert instructors
    yield* _(Console.log('\nUpserting instructors...'))
    const instructorSunetToId = yield* _(upsertInstructors(instructors))
    yield* _(Console.log(`${instructors.length} instructors upserted`))

    // Combine lookup results
    const lookup: EntityLookupIdMap = {
      ...lookupCodeToIdMap,
      subjects: subjectIdMap,
      instructors: instructorSunetToId,
    }

    // Step 3: Upsert course offerings with progress bar
    const totalSections = allParsedCourses.reduce((sum, c) => sum + c.sections.length, 0)

    yield* _(
      Console.log(`\nUpserting ${allParsedCourses.length} course offerings (${totalSections} sections)...`),
    )
    yield* _(Console.log(`Configuration: batchSize=${batchSize} sections, concurrency=${concurrency}`))

    // Create progress bar for course offerings
    const courseProgressBar = new cliProgress.SingleBar({
      format: 'Upserting |{bar}| {percentage}% | {value}/{total} sections | Courses: {courses}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 1000,
    })

    const sectionsProcessedRef = yield* _(Ref.make(0))
    const coursesProcessedRef = yield* _(Ref.make(0))
    const batchCountRef = yield* _(Ref.make(0))
    const failedBatchesRef = yield* _(Ref.make<CourseOfferingUpsertError[]>([]))

    courseProgressBar.start(totalSections, 0, { courses: 0 })

    yield* _(
      pipe(
        Stream.fromIterable(allParsedCourses),
        Stream.mapEffect((parsed) =>
          pipe(
            parsedCourseToUploadCourseOffering(parsed, lookup),
            Effect.map(Option.some),
            Effect.catchTag('PrepareCourseLookupError', (e) =>
              Effect.gen(function* (_) {
                yield* _(
                  Console.warn(
                    [
                      `\n[WARN] Skipping course ${e.subject}-${e.code_number}${e.code_suffix ?? ''} (${e.year}): missing lookups`,
                      `  - ${e.missingLookups.table}: "${e.missingLookups.key}"`,
                    ].join('\n'),
                  ),
                )
                return Option.none<UploadCourseOffering>()
              }),
            ),
          ),
        ),
        Stream.filterMap((o) => o),
        Stream.aggregate(
          Sink.foldWeighted({
            initial: [] as UploadCourseOffering[],
            maxCost: batchSize,
            cost: (_acc, item) => item.sections.length,
            body: (acc, item) => [...acc, item],
          }),
        ),
        Stream.mapEffect(
          (batch) =>
            Effect.gen(function* (_) {
              yield* _(
                upsertCourseOfferings(batch).pipe(
                  Effect.catchTag('CourseOfferingUpsertError', (error) =>
                    Effect.gen(function* (_) {
                      // Write failure to JSONL as it happens
                      const errorReport = formatUpsertError(error)
                      const jsonLine = JSON.stringify(errorReport) + '\n'
                      yield* _(Effect.promise(() => appendFile(failuresPath, jsonLine, 'utf-8')))
                      // Also update the failures ref for counting
                      yield* _(Ref.update(failedBatchesRef, (failures) => [...failures, error]))
                    }),
                  ),
                ),
              )

              const batchSections = batch.reduce((sum, co) => sum + co.sections.length, 0)
              yield* _(Ref.update(batchCountRef, (n) => n + 1))
              const sectionsCount = yield* _(Ref.updateAndGet(sectionsProcessedRef, (n) => n + batchSections))
              const coursesCount = yield* _(Ref.updateAndGet(coursesProcessedRef, (n) => n + batch.length))
              courseProgressBar.update(sectionsCount, { courses: coursesCount })
            }),
          { concurrency },
        ),
        Stream.runDrain,
      ).pipe(Effect.ensuring(Effect.sync(() => courseProgressBar.stop()))),
    )

    const totalCoursesProcessed = yield* _(Ref.get(coursesProcessedRef))
    const failures = yield* _(Ref.get(failedBatchesRef))

    // Clean up failures file if no failures occurred
    if (failures.length === 0) {
      if (yield* _(fs.exists(failuresPath))) {
        yield* _(fs.remove(failuresPath))
      }
    } else {
      yield* _(Console.log(`\nErrors: ${failures.length} batch(es) failed. See ${failuresPath}`))
    }

    yield* _(
      Console.log(`${totalCoursesProcessed} course offerings processed (${failures.length} batch failures)`),
    )
    yield* _(Console.log('Database upsert complete'))
  })
