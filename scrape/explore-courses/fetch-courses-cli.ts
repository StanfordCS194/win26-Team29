import { pathToFileURL } from 'node:url'
import { Command, Options } from '@effect/cli'
import { Effect, Console, Stream, pipe, Ref } from 'effect'
import { FileSystem } from '@effect/platform'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import * as cliProgress from 'cli-progress'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from '@scrape/shared/throttled-http-client.ts'
import { streamAllCourses } from './fetch-courses.js'

// Define CLI options
const year = Options.text('year').pipe(
  Options.withAlias('y'),
  Options.withDescription(
    'Academic year to fetch courses for (e.g., 20232024)',
  ),
)
const output = Options.directory('output').pipe(
  Options.withAlias('o'),
  Options.withDescription('Output directory for course XML files'),
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

// Define the command
const command = Command.make(
  'fetch-courses',
  { year, output, concurrency, rateLimit, retries, backoff },
  ({ year, output, concurrency, rateLimit, retries, backoff }) =>
    pipe(
      Effect.gen(function* (_) {
        yield* _(Console.log(`Fetching courses for academic year ${year}`))
        yield* _(Console.log(`Output directory: ${output}`))
        yield* _(
          Console.log(
            `Configuration: concurrency=${concurrency}, ratelimit=${rateLimit} req/s, retries=${retries}, backoff=${backoff}ms`,
          ),
        )

        const fs = yield* _(FileSystem.FileSystem)

        // Create output directory
        yield* _(fs.makeDirectory(output, { recursive: true }))

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
        const { total, stream } = yield* _(streamAllCourses(year))

        // Initialize progress bar with known total
        progressBar.start(total, 0, {
          success: 0,
          failed: 0,
        })

        // Process stream
        yield* _(
          pipe(
            stream,
            Stream.mapEffect((result) =>
              Effect.gen(function* (_) {
                if (result._tag === 'Right') {
                  const data = result.right
                  const filePath = `${output}/${data.subject.name}.xml`
                  yield* _(fs.writeFileString(filePath, data.content))
                  yield* _(Ref.update(successRef, (n) => n + 1))
                } else {
                  const error = result.left
                  yield* _(Console.warn(`\nFailed to fetch subject: ${error}`))
                  yield* _(Ref.update(failureRef, (n) => n + 1))
                }

                const success = yield* _(Ref.get(successRef))
                const failed = yield* _(Ref.get(failureRef))

                progressBar.update(success + failed, {
                  success,
                  failed,
                })
              }),
            ),
            Stream.runDrain,
          ),
        )

        progressBar.stop()

        const finalSuccess = yield* _(Ref.get(successRef))
        const finalFailure = yield* _(Ref.get(failureRef))

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