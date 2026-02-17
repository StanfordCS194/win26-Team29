import 'dotenv/config'
import { pathToFileURL } from 'node:url'

import { Command, Options } from '@effect/cli'
import { Path } from '@effect/platform'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Console, Effect, Layer, pipe } from 'effect'

import { DbLive } from '@scrape/shared/db-layer.ts'
import { QuarterSchema } from '@scrape/shared/schemas.ts'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from '@scrape/shared/throttled-http-client.ts'

import { fetchAndParseFlow } from './fetch-parse-flow.ts'
import { databaseUpsertFlow } from './upsert-flow.ts'

const parseQuarter = (quarterStr: string) =>
  Effect.gen(function* () {
    const parsed = QuarterSchema.safeDecode(quarterStr.trim())
    if (!parsed.success) {
      return yield* Effect.fail(new Error(`Invalid quarter: ${quarterStr}`))
    }
    return parsed.data
  })

const parseSubjects = (subjectsStr: string) =>
  Effect.gen(function* () {
    const subjects = subjectsStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (subjects.length === 0) {
      return yield* Effect.fail(new Error('At least one subject must be specified'))
    }

    return subjects
  })

const year = Options.integer('year').pipe(
  Options.withAlias('y'),
  Options.withDescription('Year to process (e.g., 2024)'),
)

const quarter = Options.text('quarter').pipe(
  Options.withAlias('q'),
  Options.withDescription('Quarter (e.g., Winter, Spring, Autumn)'),
)

const subjects = Options.text('subjects').pipe(
  Options.withAlias('s'),
  Options.withDescription(
    'Comma-separated list of subject codes (e.g., CS,MATH), or "all" to fetch all subjects',
  ),
)

const baseOutputsDir = Options.directory('baseOutputsDir').pipe(
  Options.withAlias('d'),
  Options.withDescription('Base directory for outputs and cache (default: data/course-evals)'),
  Options.withDefault('data/course-evals'),
)

const writeHtml = Options.boolean('write-html').pipe(
  Options.withDescription('Whether to write out HTML files when fetching from HTTP'),
  Options.withDefault(true),
)

const writeJson = Options.boolean('write-json').pipe(
  Options.withDescription('Whether to write out reports.json files'),
  Options.withDefault(true),
)

const useCache = Options.boolean('use-cache').pipe(
  Options.withDescription('Whether to use cached HTML reports if available'),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withAlias('c'),
  Options.withDescription('Maximum number of concurrent requests'),
  Options.withDefault(2),
)

const rateLimit = Options.integer('ratelimit').pipe(
  Options.withAlias('l'),
  Options.withDescription('Maximum requests per second'),
  Options.withDefault(5),
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

const upsertToDatabase = Options.boolean('upsert-to-database').pipe(
  Options.withDescription('Whether to upsert parsed evaluation reports to database'),
  Options.withDefault(false),
)

const upsertBatchSize = Options.integer('upsert-batch-size').pipe(
  Options.withDescription('Batch size for evaluation report upserts'),
  Options.withDefault(100),
)

const upsertConcurrency = Options.integer('upsert-concurrency').pipe(
  Options.withDescription('Maximum number of concurrent database upsert batches'),
  Options.withDefault(15),
)

const command = Command.make(
  'fetch-evals',
  {
    year,
    quarter,
    subjects,
    baseOutputsDir,
    useCache,
    writeHtml,
    writeJson,
    concurrency,
    rateLimit,
    retries,
    backoff,
    upsertToDatabase,
    upsertBatchSize,
    upsertConcurrency,
  },
  (options) =>
    pipe(
      Effect.gen(function* () {
        const parsedQuarter = yield* parseQuarter(options.quarter)
        const parsedSubjects = yield* parseSubjects(options.subjects)
        const path = yield* Path.Path
        const outputsDir = path.join(options.baseOutputsDir, String(options.year), parsedQuarter)

        // Phase 1: Fetch and parse evaluation reports
        const { failures, reportSectionsMap } = yield* fetchAndParseFlow({
          year: options.year,
          quarter: parsedQuarter,
          subjects: parsedSubjects,
          outputsDir,
          writeHtml: options.writeHtml,
          writeJson: options.writeJson,
          useCache: options.useCache,
          concurrency: options.concurrency,
          rateLimit: options.rateLimit,
          retries: options.retries,
          backoff: options.backoff,
        })

        // Phase 2: Database upsert (if requested)
        if (options.upsertToDatabase) {
          if (failures.length > 0) {
            yield* Console.log(
              `\nWarning: Proceeding with database upsert despite ${failures.length} failures.`,
            )
          }

          yield* databaseUpsertFlow({
            reportSectionsMap,
            year: options.year,
            quarter: parsedQuarter,
            batchSize: options.upsertBatchSize,
            concurrency: options.upsertConcurrency,
            outputsDir,
          })
        }
      }),
      Effect.provide(
        makeThrottledHttpClientLayer({
          defaultConfig: {
            requestsPerSecond: options.rateLimit,
            maxConcurrent: options.concurrency,
            retrySchedule: exponentialRetrySchedule(options.retries, options.backoff),
          },
        }),
      ),
    ),
)

const cli = Command.run(command, {
  name: 'Course Evaluation Report Fetcher',
  version: 'v1.0.0',
})

const CliLive = Layer.mergeAll(NodeContext.layer, Layer.setConfigProvider(ConfigProvider.fromEnv())).pipe(
  Layer.provideMerge(DbLive),
)

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).pipe(Effect.provide(CliLive), NodeRuntime.runMain)
}
