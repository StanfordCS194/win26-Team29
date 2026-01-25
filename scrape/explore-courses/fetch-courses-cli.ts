import { pathToFileURL } from 'node:url'
import { Command, Options } from '@effect/cli'
import { Effect, Console, Chunk, Stream, pipe, Ref, Option, Either } from 'effect'
import { FileSystem, HttpClient, Path } from '@effect/platform'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import * as cliProgress from 'cli-progress'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from '@scrape/shared/throttled-http-client.ts'
import { streamAllCourses, SubjectCourseData } from './fetch-courses.js'
import { parseCoursesXML } from './parse-courses.js'
import { HttpClientError } from '@effect/platform/HttpClientError'
import { PlatformError } from '@effect/platform/Error'

const streamCachedCourses = (academicYear: string, xmlDir: string) =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const path = yield* _(Path.Path)

    const files = yield* _(fs.readDirectory(xmlDir))

    // Filter for XML files only
    const xmlFiles = files.filter((file) => file.endsWith('.xml'))
    const total = xmlFiles.length

    const stream = pipe(
      Stream.fromIterable(xmlFiles),
      Stream.mapEffect((filename) =>
        Effect.gen(function* (_) {
          const filePath = path.join(xmlDir, filename)
          const xmlContent = yield* _(fs.readFileString(filePath))

          // Remove .xml extension to get subject name
          const subjectName = filename.slice(0, -4)

          return { subjectName, academicYear, xmlContent } as SubjectCourseData
        }).pipe(Effect.either),
      ),
    )

    return { total, stream }
  })

const checkCacheValid = (xmlDir: string) =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)

    // Check if directory exists
    const exists = yield* _(
      fs.exists(xmlDir).pipe(Effect.catchAll(() => Effect.succeed(false))),
    )

    if (!exists) {
      return false
    }

    // Check if directory has at least 2 XML files
    const files = yield* _(
      fs
        .readDirectory(xmlDir)
        .pipe(Effect.catchAll(() => Effect.succeed([]))),
    )

    const xmlFiles = files.filter((file) => file.endsWith('.xml'))
    return xmlFiles.length >= 2
  })

export const streamCoursesWithCache = (
  academicYear: string,
  xmlDir?: string,
): Effect.Effect<
  {
    source: 'http' | 'cache'
    total: number
    stream: Stream.Stream<
      Either.Either<SubjectCourseData, HttpClientError | PlatformError | Error>,
      never,
      HttpClient.HttpClient
    >
  },
  HttpClientError | Error | PlatformError,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* (_) {
    // If no cache directory provided, always fetch from HTTP
    if (!xmlDir) {
      const result = yield* _(streamAllCourses(academicYear))
      return { ...result, source: 'http' as const }
    }

    // Check if cache is valid
    const cacheValid = yield* _(checkCacheValid(xmlDir))

    if (cacheValid) {
      const result = yield* _(streamCachedCourses(academicYear, xmlDir))
      return { ...result, source: 'cache' as const }
    } else {
      const result = yield* _(streamAllCourses(academicYear))
      return { ...result, source: 'http' as const }
    }
  })

// Define CLI options
const academicYear = Options.text('academicYear').pipe(
  Options.withAlias('y'),
  Options.withDescription(
    'Academic year to fetch courses for (e.g., 20232024)',
  ),
)

const dataDir = Options.directory('dataDir').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription(
    'Base data directory (default: data/explore-courses)',
  ),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withAlias('c'),
  Options.withDescription('Maximum number of concurrent requests'),
  Options.withDefault(5),
)

const rateLimit = Options.integer('ratelimit').pipe(
  Options.withAlias('l'),
  Options.withDescription('Maximum requests per second'),
  Options.withDefault(10),
)

const retries = Options.integer('retries').pipe(
  Options.withAlias('r'),
  Options.withDescription('Number of retry attempts for failed requests'),
  Options.withDefault(3),
)

const backoff = Options.integer('backoff').pipe(
  Options.withAlias('b'),
  Options.withDescription('Initial backoff delay in milliseconds for retries'),
  Options.withDefault(100),
)

const writeXml = Options.boolean('write-xml').pipe(
  Options.withDescription('Whether to write out XML files'),
)

const parseJson = Options.boolean('parse-json').pipe(
  Options.withDescription('Whether to parse and write out parsed JSON files'),
)

const useCache = Options.boolean('use-cache').pipe(
  Options.withDescription(
    'Whether to use xml directory as cache and stream from cache if available',
  ),
)

// Define the command
const command = Command.make(
  'fetch-courses',
  {
    academicYear,
    dataDir,
    concurrency,
    rateLimit,
    retries,
    backoff,
    writeXml,
    parseJson,
    useCache,
  },
  ({
    academicYear,
    dataDir,
    concurrency,
    rateLimit,
    retries,
    backoff,
    writeXml,
    parseJson,
    useCache,
  }) =>
    pipe(
      Effect.gen(function* (_) {
        // Use provided dataDir or default to data/explore-courses
        const baseDataDir = Option.getOrElse(
          dataDir,
          () => 'data/explore-courses',
        )

        // outputsDir is baseDataDir + academicYear
        const outputsDir = `${baseDataDir}/${academicYear}`
        const xmlDir = `${outputsDir}/xml`
        const parsedDir = `${outputsDir}/parsed`

        yield* _(
          Console.log(`Fetching courses for academic year ${academicYear}`),
        )
        yield* _(Console.log(`Data directory: ${baseDataDir}`))
        yield* _(Console.log(`Output directory: ${outputsDir}`))
        yield* _(
          Console.log(
            `HTTP client configuration: concurrency=${concurrency}, ratelimit=${rateLimit} req/s, retries=${retries}, backoff=${backoff}ms`,
          ),
        )

        const fs = yield* _(FileSystem.FileSystem)

        // Create necessary directories
        yield* _(fs.makeDirectory(outputsDir, { recursive: true }))
        if (writeXml) {
          yield* _(fs.makeDirectory(xmlDir, { recursive: true }))
        }
        if (parseJson) {
          yield* _(fs.makeDirectory(parsedDir, { recursive: true }))
        }

        // Create progress bar
        const progressBar = new cliProgress.SingleBar({
          format:
            'Progress |{bar}| {percentage}% | {value}/{total} subjects | Success: {success} | Failed: {failed}',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
          noTTYOutput: true,
          notTTYSchedule: 1000,
        })

        // Create refs for tracking progress
        const successRef = yield* _(Ref.make(0))
        const failureRef = yield* _(Ref.make(0))

        // Determine cache directory if useCache is enabled
        const cacheXmlDir = useCache ? xmlDir : undefined
        const { total, stream, source } = yield* _(
          streamCoursesWithCache(academicYear, cacheXmlDir),
        )

        if (useCache && source) {
          yield* _(Console.log(`Using source: ${source}`))
        }

        // Initialize progress bar with known total
        progressBar.start(total, 0, {
          success: 0,
          failed: 0,
        })

        // Process stream and collect results
        const results = yield* _(
          pipe(
            stream,
            Stream.mapEffect((result) =>
              Effect.gen(function* (_) {
                if (Either.isRight(result)) {
                  const data = result.right

                  if (writeXml) {
                    const xmlFilePath = `${xmlDir}/${data.subjectName}.xml`
                    yield* _(fs.writeFileString(xmlFilePath, data.xmlContent))
                  }

                  // Parse and write JSON file if flag is enabled
                  if (parseJson) {
                    const parseResult = yield* _(
                      parseCoursesXML(data.xmlContent).pipe(Effect.either),
                    )
                    if (Either.isLeft(parseResult)) {
                      const error = parseResult.left
                      yield* _(Ref.update(failureRef, (n) => n + 1))
                      return {
                        type: 'failure' as const,
                        error: error,
                        subjectName: data.subjectName,
                      }
                    } else {
                      const courses = parseResult.right
                      const jsonFilePath = `${parsedDir}/${data.subjectName}.json`
                      yield* _(fs.writeFileString(jsonFilePath, JSON.stringify(courses, null, 2)))
                    }
                  }

                  yield* _(Ref.update(successRef, (n) => n + 1))

                  return {
                    type: 'success' as const,
                    subjectName: data.subjectName,
                  }
                } else {
                  const error = result.left
                  yield* _(Ref.update(failureRef, (n) => n + 1))

                  return {
                    type: 'failure' as const,
                    error: error,
                  }
                }
              }).pipe(
                Effect.tap(() => {
                  const success = Ref.get(successRef)
                  const failed = Ref.get(failureRef)
                  return Effect.gen(function* (_) {
                    const s = yield* _(success)
                    const f = yield* _(failed)
                    progressBar.update(s + f, { success: s, failed: f })
                  })
                }),
              ),
            ),
            Stream.runCollect,
          ),
        )

        progressBar.stop()

        // Extract parsing failures from results
        const errors = Chunk.toReadonlyArray(results).filter((r) => r.type === 'failure')

        const finalSuccess = yield* _(Ref.get(successRef))
        const finalFailure = yield* _(Ref.get(failureRef))

        const failuresPath = `${outputsDir}/failures.json`
        if (errors.length === 0) {
          if (yield* _(fs.exists(failuresPath))) {
            yield* _(fs.remove(failuresPath))
          }
        } else {
          yield* _(
            fs.writeFileString(
              failuresPath,
              JSON.stringify(errors.map((e) => ({
                subjectName: e.subjectName,
                error: e.error,
              })), null, 2),
            ),
          )
          yield* _(
            Console.log(
              `\nErrors: ${errors.length} subjects failed to fetch or parse. See ${failuresPath}`,
            ),
          )
        }

        yield* _(
          Console.log(
            `\nComplete: ${finalSuccess} succeeded, ${finalFailure} failed`,
          ),
        )
      }),
      // Provide the ThrottledHttpLayer to the entire command effect
      Effect.provide(
        makeThrottledHttpClientLayer({
          defaultConfig: {
            requestsPerSecond: rateLimit,
            maxConcurrent: concurrency,
            retrySchedule: exponentialRetrySchedule(retries, backoff),
          },
        }),
      ),
    ),
)

// Set up CLI application
const cli = Command.run(command, {
  name: 'Course Fetcher',
  version: 'v1.0.0',
})

// CLI execution
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
}