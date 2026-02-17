import { Effect, Stream, pipe } from 'effect'
import { FileSystem, Path } from '@effect/platform'
import { streamAllCourses } from './fetch-courses.ts'
import type { HttpClient } from '@effect/platform'
import type { PlatformError } from '@effect/platform/Error'
import type { Either } from 'effect'

import type {
  CourseXMLFetchError,
  SubjectCourseData,
  SubjectsFetchError,
  SubjectsXMLParseError,
} from './fetch-courses.ts'

const streamCachedCourses = (academicYear: string, xmlDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const files = yield* fs.readDirectory(xmlDir)

    // Filter for XML files only
    const xmlFiles = files.filter((file) => path.extname(file) === '.xml')
    const total = xmlFiles.length

    const stream = pipe(
      Stream.fromIterable(xmlFiles),
      Stream.mapEffect(
        (filename) =>
          pipe(
            Effect.gen(function* () {
              const filePath = path.join(xmlDir, filename)
              const xmlContent = yield* fs.readFileString(filePath)

              const subjectName = path.parse(filename).name

              return {
                subjectName,
                academicYear,
                xmlContent,
              } as SubjectCourseData
            }),
            Effect.either,
          ),
        { concurrency: 'unbounded' },
      ),
    )

    return { total, stream }
  })

const checkCacheValid = (xmlDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const exists = yield* fs.exists(xmlDir).pipe(Effect.catchAll(() => Effect.succeed(false)))

    if (!exists) {
      return false
    }

    // Check if directory has at least 1 XML files
    const files = yield* fs.readDirectory(xmlDir).pipe(Effect.catchAll(() => Effect.succeed([])))

    const xmlFiles = files.filter((file) => path.extname(file) === '.xml')
    return xmlFiles.length >= 1
  })

type GetCoursesStreamError = CourseXMLFetchError | PlatformError

export const streamCoursesWithCache = (
  academicYear: string,
  xmlDir?: string,
): Effect.Effect<
  {
    source: 'http' | 'cache'
    total: number
    stream: Stream.Stream<
      Either.Either<SubjectCourseData, GetCoursesStreamError>,
      never,
      HttpClient.HttpClient
    >
  },
  SubjectsXMLParseError | SubjectsFetchError | PlatformError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    const cacheValid = xmlDir !== undefined ? yield* checkCacheValid(xmlDir) : false
    const result =
      xmlDir === undefined || !cacheValid
        ? yield* streamAllCourses(academicYear)
        : yield* streamCachedCourses(academicYear, xmlDir)

    const source = xmlDir === undefined || !cacheValid ? ('http' as const) : ('cache' as const)

    return { ...result, source }
  })
