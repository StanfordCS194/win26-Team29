import { Effect, Console, Chunk, Stream, pipe, Ref, Either } from 'effect'
import { FileSystem, Path } from '@effect/platform'
import * as cliProgress from 'cli-progress'
import { parseCoursesXML } from './fetch-parse/parse-courses.ts'
import { streamCoursesWithCache } from './fetch-parse/courses-cached.ts'
import type { ParsedCourse } from './fetch-parse/parse-courses.ts'

export interface ParsedSubjectData {
  subjectName: string
  longname?: string // only present when data came from HTTP fetch
  courses: ParsedCourse[]
}

function processCourseData(
  data: {
    subjectName: string
    xmlContent: string
    longname?: string
  },
  options: {
    writeXml: boolean
    writeJson: boolean
    xmlDir: string
    parsedDir: string
    path: Path.Path
    fs: FileSystem.FileSystem
  },
) {
  return Effect.gen(function* (_) {
    const { writeXml, writeJson, xmlDir, parsedDir, path, fs } = options

    if (writeXml) {
      const xmlFilePath = path.join(xmlDir, `${data.subjectName}.xml`)
      yield* _(fs.writeFileString(xmlFilePath, data.xmlContent))
    }

    const courses = yield* _(parseCoursesXML(data.xmlContent, data.subjectName))

    if (writeJson) {
      const jsonFilePath = path.join(parsedDir, `${data.subjectName}.json`)
      yield* _(fs.writeFileString(jsonFilePath, JSON.stringify(courses, null, 2)))
    }

    return { subjectName: data.subjectName, longname: data.longname, courses }
  })
}

export const fetchAndParseFlow = ({
  academicYear,
  baseDataDir,
  writeXml,
  writeJson,
  useCache,
  concurrency,
  rateLimit,
  retries,
  backoff,
}: {
  academicYear: string
  baseDataDir: string
  writeXml: boolean
  writeJson: boolean
  useCache: boolean
  concurrency: number
  rateLimit: number
  retries: number
  backoff: number
}) =>
  Effect.gen(function* (_) {
    const path = yield* _(Path.Path)
    const fs = yield* _(FileSystem.FileSystem)

    const outputsDir = path.join(baseDataDir, academicYear)
    const xmlDir = path.join(outputsDir, 'xml')
    const parsedDir = path.join(outputsDir, 'parsed')

    yield* _(Console.log(`Fetching courses for academic year ${academicYear}`))
    yield* _(Console.log(`Data directory: ${baseDataDir}`))

    if (writeXml || writeJson) {
      yield* _(Console.log(`Output directory: ${outputsDir}`))
    }

    yield* _(fs.makeDirectory(outputsDir, { recursive: true }))
    if (writeXml) {
      yield* _(fs.makeDirectory(xmlDir, { recursive: true }))
    }
    if (writeJson) {
      yield* _(fs.makeDirectory(parsedDir, { recursive: true }))
    }

    const cacheXmlDir = useCache ? xmlDir : undefined
    const { total, stream, source } = yield* _(streamCoursesWithCache(academicYear, cacheXmlDir))

    yield* _(Console.log(`Using source: ${source}`))

    if (source === 'http') {
      yield* _(
        Console.log(
          `HTTP client configuration: concurrency=${concurrency}, ratelimit=${rateLimit} req/s, retries=${retries}, backoff=${backoff}ms`,
        ),
      )
    }

    const progressBar = new cliProgress.SingleBar({
      format:
        'Progress |{bar}| {percentage}% | {value}/{total} subjects | Success: {success} | Failed: {failed}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 1000,
    })

    const progressRef = yield* _(Ref.make({ success: 0, failed: 0 }))

    progressBar.start(total, 0, {
      success: 0,
      failed: 0,
    })

    const results = yield* _(
      pipe(
        stream,
        Stream.mapEffect((either) =>
          pipe(
            Effect.gen(function* (_) {
              if (Either.isLeft(either)) {
                return yield* _(Effect.fail(either.left)) // pass along error
              }

              const data = either.right
              return yield* _(
                processCourseData(data, {
                  writeXml,
                  writeJson,
                  xmlDir,
                  parsedDir,
                  path,
                  fs,
                }),
              )
            }),
            Effect.either,
          ),
        ),
        Stream.tap((result) =>
          Effect.gen(function* (_) {
            const progress = yield* _(
              Ref.updateAndGet(progressRef, ({ success, failed }) =>
                Either.isRight(result) ? { success: success + 1, failed } : { success, failed: failed + 1 },
              ),
            )
            progressBar.update(progress.success + progress.failed, progress)
          }),
        ),
        Stream.runCollect,
      ),
    )

    progressBar.stop()

    const resultArray = Chunk.toReadonlyArray(results)
    const failures = resultArray.filter((r) => Either.isLeft(r)).map((r) => r.left)
    const parsedCourses = resultArray.filter((r) => Either.isRight(r)).map((r) => r.right)

    const { success, failed } = yield* _(Ref.get(progressRef))

    const failuresPath = path.join(outputsDir, 'failures.json')
    if (failures.length === 0) {
      if (yield* _(fs.exists(failuresPath))) {
        yield* _(fs.remove(failuresPath))
      }
    } else {
      const failureReport = failures.map((error) => {
        if ('_tag' in error) {
          switch (error._tag) {
            case 'SchemaValidationError':
              return {
                type: 'SchemaValidationError',
                subjectName: error.subjectName,
                message: error.message,
                issues: error.issues,
              }
            case 'XMLParseError':
              return {
                type: 'XMLParseError',
                subjectName: error.subjectName,
                message: error.message,
                cause: String(error.cause),
              }
            case 'CourseXMLFetchError':
              return {
                type: 'CourseXMLFetchError',
                subjectName: error.subjectName,
                academicYear: error.academicYear,
                cause: String(error.cause),
              }
          }
        }
        return {
          type: error._tag,
          error: String(error),
        }
      })

      yield* _(fs.writeFileString(failuresPath, JSON.stringify(failureReport, null, 2)))
      yield* _(Console.log(`\nErrors: ${failures.length} subjects failed to process. See ${failuresPath}`))
    }

    yield* _(
      Console.log(`\nExplore Courses fetch and parse complete: ${success} succeeded, ${failed} failed`),
    )

    return { success, failed, failures, outputsDir, parsedCourses }
  })
