import { FileSystem, HttpClient, Path } from '@effect/platform'
import { Effect, Either, pipe, Stream, Data } from 'effect'
import {
  CourseXMLFetchError,
  streamAllCourses,
  SubjectCourseData,
  SubjectsFetchError,
  SubjectsXMLParseError,
} from './fetch-courses.ts'
import { PlatformError } from '@effect/platform/Error'

const streamCachedCourses = (academicYear: string, xmlDir: string) =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const path = yield* _(Path.Path)

    const files = yield* _(fs.readDirectory(xmlDir))

    // Filter for XML files only
    const xmlFiles = files.filter((file) => path.extname(file) === '.xml')
    const total = xmlFiles.length

    const stream = pipe(
      Stream.fromIterable(xmlFiles),
      Stream.mapEffect((filename) =>
        pipe(
          Effect.gen(function* (_) {
            const filePath = path.join(xmlDir, filename)
            const xmlContent = yield* _(fs.readFileString(filePath))

            const subjectName = path.parse(filename).name

            return {
              subjectName,
              academicYear,
              xmlContent,
            } as SubjectCourseData
          }),
          Effect.either,
        ),
        { concurrency: 'unbounded' }
      ),
    )

    return { total, stream }
  })

const checkCacheValid = (xmlDir: string) =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const path = yield* _(Path.Path)

    const exists = yield* _(fs.exists(xmlDir).pipe(Effect.catchAll(() => Effect.succeed(false))))

    if (!exists) {
      return false
    }

    // Check if directory has at least 1 XML files
    const files = yield* _(fs.readDirectory(xmlDir).pipe(Effect.catchAll(() => Effect.succeed([]))))

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
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | never
> =>
  Effect.gen(function* (_) {
    const cacheValid = xmlDir ? yield* _(checkCacheValid(xmlDir)) : false
    const result =
      !xmlDir || !cacheValid
        ? yield* _(streamAllCourses(academicYear))
        : yield* _(streamCachedCourses(academicYear, xmlDir))

    const source = !xmlDir || !cacheValid ? ('http' as const) : ('cache' as const)

    return { ...result, source }
  })
