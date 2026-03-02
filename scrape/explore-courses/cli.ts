import 'dotenv/config'
import { pathToFileURL } from 'node:url'

import { Command, Options } from '@effect/cli'
import { Path } from '@effect/platform'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Console, Effect, Layer, pipe } from 'effect'

import { DbLive } from '@scrape/shared/db-layer.ts'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from '@scrape/shared/throttled-http-client.ts'

import { fetchAndParseFlow } from './fetch-parse-flow.ts'
import { databaseUpsertFlow } from './upsert-flow.ts'

const academicYear = Options.text('academicYear').pipe(
  Options.withAlias('y'),
  Options.withDescription('Academic year to fetch courses for (e.g., 20232024)'),
)

const dataDir = Options.directory('dataDir').pipe(
  Options.withAlias('d'),
  Options.withDescription('Base data directory (default: data/explore-courses)'),
  Options.withDefault('data/explore-courses'),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withAlias('c'),
  Options.withDescription('Maximum number of concurrent requests'),
  Options.withDefault(4),
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
  Options.withDefault(true),
)

const writeJson = Options.boolean('write-json').pipe(
  Options.withDescription('Whether to write out parsed JSON files'),
)

const useCache = Options.boolean('use-cache').pipe(
  Options.withDescription('Whether to use xml directory as cache and stream from cache if available'),
)

const upsertToDatabase = Options.boolean('upsert-to-database').pipe(
  Options.withDescription('Whether to upsert parsed courses to database'),
  Options.withDefault(false),
)

const upsertBatchSize = Options.integer('upsert-batch-size').pipe(
  Options.withDescription('Number of sections to upsert per batch'),
  Options.withDefault(1000),
)

const upsertConcurrency = Options.integer('upsert-concurrency').pipe(
  Options.withDescription('Concurrency for course offering upsert batches'),
  Options.withDefault(10),
)

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
    writeJson,
    useCache,
    upsertToDatabase,
    upsertBatchSize,
    upsertConcurrency,
  },
  (options) =>
    pipe(
      Effect.gen(function* () {
        const path = yield* Path.Path
        const outputsDir = path.join(options.dataDir, options.academicYear)

        // Phase 1: Fetch and parse courses
        const { failures, parsedCourses } = yield* fetchAndParseFlow({
          academicYear: options.academicYear,
          outputsDir,
          writeXml: options.writeXml,
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
            parsedCourses,
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
  name: 'Course Fetcher',
  version: 'v1.0.0',
})

const CliLive = Layer.mergeAll(NodeContext.layer, Layer.setConfigProvider(ConfigProvider.fromEnv())).pipe(
  Layer.provideMerge(DbLive),
)

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).pipe(Effect.provide(CliLive), NodeRuntime.runMain)
}
