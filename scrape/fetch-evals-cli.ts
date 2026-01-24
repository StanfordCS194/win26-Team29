import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { Command, Options } from '@effect/cli'
import { Effect, Stream } from 'effect'
import { FileSystem } from '@effect/platform'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from './throttled-http-client.ts'
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
): Effect.Effect<Array<string>, Error> => {
  return Effect.gen(function* (_) {
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
}

// Create year-quarter pairs
const createYearQuarterPairs = (
  year: number,
  quarters: Array<Quarter>,
): Array<YearQuarterPair> => {
  return quarters.map((quarter) => ({ year, quarter }))
}

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

const output = Options.text('output').pipe(
  Options.withAlias('o'),
  Options.withDescription(
    'Output file path for results (e.g., ./data/reports.json)',
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
  'process-reports',
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
    Effect.gen(function* (_) {
      const parsedQuarters = yield* _(parseQuarters(config.quarters))
      const parsedSubjects = yield* _(parseSubjects(config.subjects))

      console.log(
        `Processing course evaluation reports for year ${config.year}`,
      )
      console.log(`Subjects: ${parsedSubjects.join(', ')}`)
      console.log(`Quarters: ${parsedQuarters.join(', ')}`)
      console.log(`Output: ${config.output}`)
      console.log(
        `Configuration: concurrency=${config.concurrency}, ratelimit=${config.rateLimit} req/s, retries=${config.retries}, backoff=${config.backoff}ms`,
      )
      console.log('')

      const fs = yield* _(FileSystem.FileSystem)

      // Create output directory if needed
      const lastSlashIndex = config.output.lastIndexOf('/')
      if (lastSlashIndex !== -1) {
        const outputDir = config.output.substring(0, lastSlashIndex)
        yield* _(fs.makeDirectory(outputDir, { recursive: true }))
      }

      console.log('Fetching and processing evaluation reports...')

      const yearQuarterPairs = createYearQuarterPairs(
        config.year,
        parsedQuarters,
      )

      // Use throttled HTTP client layer with CLI parameters
      const ThrottledHttpLayer = makeThrottledHttpClientLayer({
        defaultConfig: {
          requestsPerSecond: config.rateLimit,
          maxConcurrent: config.concurrency,
          retrySchedule: exponentialRetrySchedule(
            config.retries,
            config.backoff,
          ),
        },
      })

      let reportCount = 0
      const reports = yield* _(
        processReports(yearQuarterPairs, parsedSubjects).pipe(
          Stream.tap((report) =>
            Effect.sync(() => {
              reportCount++
              if (reportCount % 10 === 0) {
                process.stdout.write(`\rProcessed ${reportCount} reports...`)
              }
            }),
          ),
          Stream.runCollect,
          Effect.map((chunk) => Array.from(chunk)),
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              // Extract the actual error message, handling UnknownException with cause
              let errorMessage: string
              if (typeof error === 'object' && 'cause' in error) {
                const cause = (error as { cause?: unknown }).cause
                if (cause instanceof Error) {
                  errorMessage = cause.message
                } else {
                  errorMessage = String(cause)
                }
              } else if (error instanceof Error) {
                errorMessage = error.message
              } else {
                errorMessage = String(error)
              }

              console.error(`\n\nFailed to process reports: ${errorMessage}`)
              return yield* Effect.fail(error)
            }),
          ),
          Effect.provide(ThrottledHttpLayer),
        ),
      )

      console.log(`\r\nProcessed ${reports.length} reports total`)

      const jsonContent = JSON.stringify(reports, null, 2)
      yield* _(fs.writeFileString(config.output, jsonContent))

      console.log(`Results written to: ${config.output}`)

      // Print summary statistics
      const totalQuestions = reports.reduce(
        (sum, r) => sum + Object.keys(r.questions).length,
        0,
      )
      const numericQuestions = reports.reduce(
        (sum, r) =>
          sum +
          Object.values(r.questions).filter((q) => q.type === 'numeric').length,
        0,
      )
      const textQuestions = reports.reduce(
        (sum, r) =>
          sum +
          Object.values(r.questions).filter((q) => q.type === 'text').length,
        0,
      )

      console.log('\nSummary:')
      console.log(`  Total reports: ${reports.length}`)
      console.log(`  Total questions: ${totalQuestions}`)
      console.log(`  Numeric questions: ${numericQuestions}`)
      console.log(`  Text questions: ${textQuestions}`)

      return reports
    }),
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
