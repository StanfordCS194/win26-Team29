import { Effect, Console, Ref, Chunk, Stream, pipe } from 'effect'
import * as cliProgress from 'cli-progress'
import { query } from 'jsonpathly'
import { upsertLookupCodesBatch, upsertSubjects, type LookupTable } from './upsert/upsert-codes.ts'
import { upsertInstructors } from './upsert/upsert-instructors.ts'
import { parsedCourseToIncCourseOffering, type EntityLookupIdMap } from './upsert/prepare-course.ts'
import { upsertCourseOfferings } from './upsert/upsert-courses.ts'
import type { ParsedSubjectData } from './fetch-parse-flow.ts'
import type { ParsedInstructor } from './fetch-parse/parse-courses.ts'

function extractLookupValues(parsedCourses: ParsedSubjectData[]): Record<LookupTable, Set<string>> {
  return {
    academic_careers: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.academicCareer', {
        returnArray: true,
      }) as string[],
    ),
    academic_groups: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.academicGroup', {
        returnArray: true,
      }) as string[],
    ),
    academic_organizations: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.academicOrganization', {
        returnArray: true,
      }) as string[],
    ),
    effective_statuses: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.effectiveStatus', {
        returnArray: true,
      }) as string[],
    ),
    final_exam_options: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.finalExamFlag', {
        returnArray: true,
      }) as string[],
    ),
    grading_options: new Set(
      query(parsedCourses, '$[*].courses[*].grading', {
        returnArray: true,
      }) as string[],
    ),
    gers: new Set(
      query(parsedCourses, '$[*].courses[*].gers[*]', {
        returnArray: true,
      }) as string[],
    ),
    consent_options: new Set([
      ...(query(parsedCourses, '$[*].courses[*].sections[*].addConsent', {
        returnArray: true,
      }) as string[]),
      ...(query(parsedCourses, '$[*].courses[*].sections[*].dropConsent', {
        returnArray: true,
      }) as string[]),
    ]),
    enroll_statuses: new Set(
      query(parsedCourses, '$[*].courses[*].sections[*].enrollStatus', {
        returnArray: true,
      }) as string[],
    ),
    component_types: new Set(
      query(parsedCourses, '$[*].courses[*].sections[*].component', {
        returnArray: true,
      }) as string[],
    ),
    instructor_roles: new Set(
      query(parsedCourses, '$[*].courses[*].sections[*].schedules[*].instructors[*].role', {
        returnArray: true,
      }) as string[],
    ),
  }
}

function extractInstructors(parsedCourses: ParsedSubjectData[]) {
  return query(parsedCourses, '$[*].courses[*].sections[*].schedules[*].instructors[*]', {
    returnArray: true,
  }) as ParsedInstructor[]
}

export const databaseUpsertFlow = ({
  parsedCourses,
  batchSize,
  concurrency,
}: {
  parsedCourses: ParsedSubjectData[]
  batchSize: number
  concurrency: number
}) =>
  Effect.gen(function* (_) {
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
    yield* _(Console.log(`\nUpserting ${allParsedCourses.length} course offerings...`))
    yield* _(Console.log(`Configuration: batchSize=${batchSize}, concurrency=${concurrency}`))

    const totalBatches = Math.ceil(allParsedCourses.length / batchSize)

    // Create progress bar for course offerings
    const courseProgressBar = new cliProgress.SingleBar({
      format: 'Upserting |{bar}| {percentage}% | {value}/{total} batches | Courses: {courses}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 1000,
    })

    const batchProgressRef = yield* _(Ref.make(0))
    const coursesProcessedRef = yield* _(Ref.make(0))

    courseProgressBar.start(totalBatches, 0, { courses: 0 })

    yield* _(
      pipe(
        Stream.fromIterable(allParsedCourses),
        Stream.map((parsed) => parsedCourseToIncCourseOffering(parsed, lookup)),
        Stream.grouped(batchSize),
        Stream.mapEffect(
          (chunk) =>
            Effect.gen(function* (_) {
              const chunkArray = Chunk.toArray(chunk)
              yield* _(upsertCourseOfferings(chunkArray))

              const batchCount = yield* _(Ref.updateAndGet(batchProgressRef, (n) => n + 1))
              const coursesCount = yield* _(
                Ref.updateAndGet(coursesProcessedRef, (n) => n + chunkArray.length),
              )
              courseProgressBar.update(batchCount, { courses: coursesCount })
            }),
          { concurrency },
        ),
        Stream.runDrain,
      ),
    )

    courseProgressBar.stop()

    const totalCoursesProcessed = yield* _(Ref.get(coursesProcessedRef))
    yield* _(Console.log(`${totalCoursesProcessed} course offerings upserted`))
    yield* _(Console.log('Database upsert complete'))
  })
