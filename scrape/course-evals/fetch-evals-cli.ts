import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { Command, Options } from '@effect/cli'
import { Console, Effect, Either, pipe, Ref, Stream } from 'effect'
import { FileSystem } from '@effect/platform'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from '@scrape/shared/throttled-http-client.ts'
import { Quarter, QuarterSchema, processReports } from './fetch-evals.ts'
import type { YearQuarterPair } from './fetch-evals.ts'

// Parse quarters from comma-separated string
const parseQuarters = (
  quartersStr: string,
): Effect.Effect<Array<Quarter>, Error> =>
  Effect.gen(function* (_) {
    const parts = quartersStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (!parts.length) {
      return yield* _(
        Effect.fail(new Error('At least one quarter must be specified')),
      )
    }

    const quarters: Array<Quarter> = []
    for (const part of parts) {
      const parsed = QuarterSchema.safeParse(part)
      if (!parsed.success) {
        return yield* _(
          Effect.fail(
            new Error(
              `Invalid quarter: ${part}. Must be one of: ${Object.values(Quarter).join(', ')}`,
            ),
          ),
        )
      }
      quarters.push(parsed.data)
    }

    return quarters
  })

// Parse subjects from comma-separated string
const parseSubjects = (
  subjectsStr: string,
): Effect.Effect<Array<string>, Error> =>
  Effect.gen(function* (_) {
    const subjects = subjectsStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (subjects.length === 0) {
      return yield* _(
        Effect.fail(new Error('At least one subject must be specified')),
      )
    }

    return subjects
  })

// Create year-quarter pairs
const createYearQuarterPairs = (
  year: number,
  quarters: Array<Quarter>,
): Array<YearQuarterPair> => quarters.map((quarter) => ({ year, quarter }))

// Define CLI options
const year = Options.integer('year').pipe(
  Options.withAlias('y'),
  Options.withDescription('Year to process (e.g., 2024)'),
)

const quarters = Options.text('quarters').pipe(
  Options.withAlias('q'),
  Options.withDescription(
    'Comma-separated list of quarters (e.g., Winter,Spring,Fall)',
  ),
)

const subjects = Options.text('subjects').pipe(
  Options.withAlias('s'),
  Options.withDescription(
    'Comma-separated list of subject codes (e.g., CS,MATH)',
  ),
)

const output = Options.file('output').pipe(
  Options.withAlias('o'),
  Options.withDefault('data/course-evals/reports.json'),
  Options.withDescription(
    'Output file path for results (default: data/course-evals/reports.json)',
  ),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withAlias('c'),
  Options.withDefault(3),
  Options.withDescription('Maximum number of concurrent requests'),
)

const rateLimit = Options.integer('ratelimit').pipe(
  Options.withAlias('l'),
  Options.withDefault(6),
  Options.withDescription('Maximum requests per second'),
)

const retries = Options.integer('retries').pipe(
  Options.withAlias('r'),
  Options.withDefault(3),
  Options.withDescription('Number of retry attempts for failed requests'),
)

const backoff = Options.integer('backoff').pipe(
  Options.withAlias('b'),
  Options.withDefault(100),
  Options.withDescription('Initial backoff delay in milliseconds'),
)

// Define the main command
const processCommand = Command.make(
  'fetch-evals',
  {
    year,
    quarters,
    subjects,
    output,
    concurrency,
    rateLimit,
    retries,
    backoff,
  },
  (config) =>
    pipe(
      Effect.gen(function* (_) {
        const parsedQuarters = yield* _(parseQuarters(config.quarters))
        const parsedSubjects = yield* _(parseSubjects(config.subjects))

        yield* _(
          Console.log(
            `Processing course evaluation reports for year ${config.year}`,
          ),
        )
        yield* _(Console.log(`Subjects: ${parsedSubjects.join(', ')}`))
        yield* _(Console.log(`Quarters: ${parsedQuarters.join(', ')}`))
        yield* _(Console.log(`Output: ${config.output}`))
        yield* _(
          Console.log(
            `Configuration: concurrency=${config.concurrency}, ratelimit=${config.rateLimit} req/s, retries=${config.retries}, backoff=${config.backoff}ms`,
          ),
        )
        yield* _(Console.log(''))

        const fs = yield* _(FileSystem.FileSystem)

        // Create output directory if needed
        const lastSlashIndex = config.output.lastIndexOf('/')
        if (lastSlashIndex !== -1) {
          const outputDir = config.output.substring(0, lastSlashIndex)
          yield* _(fs.makeDirectory(outputDir, { recursive: true }))
        }

        yield* _(Console.log('Fetching and processing evaluation reports...'))

        const yearQuarterPairs = createYearQuarterPairs(
          config.year,
          parsedQuarters,
        )

        const processedRef = yield* _(Ref.make(0))
        const successRef = yield* _(Ref.make(0))
        const failureRef = yield* _(Ref.make(0))

        const results = yield* _(
          pipe(
            processReports(yearQuarterPairs, parsedSubjects),
            Stream.mapEffect((result) =>
              Effect.gen(function* (_) {
                // Update counts based on result
                yield* _(Ref.update(processedRef, (n) => n + 1))

                if (Either.isRight(result)) {
                  yield* _(Ref.update(successRef, (n) => n + 1))
                } else {
                  yield* _(Ref.update(failureRef, (n) => n + 1))
                }

                // Get current counts for progress display
                const processed = yield* _(Ref.get(processedRef))
                const success = yield* _(Ref.get(successRef))
                const failed = yield* _(Ref.get(failureRef))

                // Display progress every 10 reports
                if (processed % 10 === 0) {
                  yield* _(
                    Console.log(
                      `Processed ${processed} reports (${success} successful, ${failed} failed)`,
                    ),
                  )
                }

                return result
              }),
            ),
            Stream.runCollect,
            Effect.map((chunk) => Array.from(chunk)),
          ),
        )

        // Separate successful and failed results
        const successfulReports = results
          .filter(Either.isRight)
          .map((either) => either.right)

        const failedReports = results
          .filter(Either.isLeft)
          .map((either) => either.left)

        const finalProcessed = yield* _(Ref.get(processedRef))
        const finalSuccess = yield* _(Ref.get(successRef))
        const finalFailure = yield* _(Ref.get(failureRef))

        yield* _(
          Console.log(
            `\nProcessing complete: ${finalSuccess} successful, ${finalFailure} failed out of ${finalProcessed} total`,
          ),
        )

        const jsonContent = JSON.stringify(successfulReports, null, 2)
        yield* _(fs.writeFileString(config.output, jsonContent))
        yield* _(Console.log(`\nResults written to: ${config.output}`))

        if (finalFailure > 0) {
          const jsonFailures = JSON.stringify(failedReports, null, 2)
          yield* _(
            fs.writeFileString(`${config.output}.failures.json`, jsonFailures),
          )
          yield* _(
            Console.log(
              `  Failed reports written to: ${config.output}.failures.json`,
            ),
          )
        }

        return successfulReports
      }),
      // Provide the ThrottledHttpLayer to the entire command effect
      Effect.provide(
        makeThrottledHttpClientLayer({
          defaultConfig: {
            requestsPerSecond: config.rateLimit,
            maxConcurrent: config.concurrency,
            retrySchedule: exponentialRetrySchedule(
              config.retries,
              config.backoff,
            ),
          },
        }),
      ),
    ),
)

// Set up the CLI application
const cli = Command.run(processCommand, {
  name: 'Course Evaluation Report Processor',
  version: 'v1.0.0',
})

// CLI execution
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
}
