import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { Command, Options } from '@effect/cli'
import { Effect, Console, Option, Layer, ConfigProvider, pipe } from 'effect'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from '@scrape/shared/throttled-http-client.ts'
import { fetchAndParseFlow } from './fetch-parse-flow.ts'
import { databaseUpsertFlow } from './upsert-flow.ts'
import { DbLive } from '@scrape/shared/db-layer.ts'

const academicYear = Options.text('academicYear').pipe(
  Options.withAlias('y'),
  Options.withDescription('Academic year to fetch courses for (e.g., 20232024)'),
)

const dataDir = Options.directory('dataDir').pipe(
  Options.withAlias('d'),
  Options.optional,
  Options.withDescription('Base data directory (default: data/explore-courses)'),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withAlias('c'),
  Options.withDescription('Maximum number of concurrent requests'),
  Options.withDefault(4),
)

const rateLimit = Options.integer('ratelimit').pipe(
  Options.withAlias('l'),
  Options.withDescription('Maximum requests per second'),
  Options.withDefault(8),
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

const writeXml = Options.boolean('write-xml').pipe(Options.withDescription('Whether to write out XML files'))

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

const forceUpsertOnFailure = Options.boolean('force-upsert-on-failure').pipe(
  Options.withDescription('Proceed with database upsert even if there were failures in fetch/parse phase'),
  Options.withDefault(false),
)

const upsertBatchSize = Options.integer('upsert-batch-size').pipe(
  Options.withDescription('Batch size for course offering upserts'),
  Options.withDefault(35),
)

const upsertConcurrency = Options.integer('upsert-concurrency').pipe(
  Options.withDescription('Concurrency for course offering upsert batches'),
  Options.withDefault(5),
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
    forceUpsertOnFailure,
    upsertBatchSize,
    upsertConcurrency,
  },
  ({
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
    forceUpsertOnFailure,
    upsertBatchSize,
    upsertConcurrency,
  }) =>
    pipe(
      Effect.gen(function* (_) {
        const baseDataDir = Option.getOrElse(dataDir, () => 'data/explore-courses')

        // Phase 1: Fetch and parse courses
        const { failures, parsedCourses } = yield* _(
          fetchAndParseFlow({
            academicYear,
            baseDataDir,
            writeXml,
            writeJson,
            useCache,
            concurrency,
            rateLimit,
            retries,
            backoff,
          }),
        )

        // Phase 2: Database upsert (if requested)
        if (upsertToDatabase) {
          // If there were failures and not forcing, skip upsert
          if (failures.length > 0 && !forceUpsertOnFailure) {
            yield* _(
              Console.log(
                `\nSkipping database upsert: ${failures.length} subjects failed during fetch/parse.`,
              ),
            )
            yield* _(Console.log('Use --force-upsert-on-failure to proceed with incomplete data.'))
            return
          }

          if (failures.length > 0) {
            yield* _(
              Console.log(
                `\nWarning: Proceeding with database upsert despite ${failures.length} failures (--force-upsert-on-failure enabled).`,
              ),
            )
          }

          yield* _(
            databaseUpsertFlow({
              parsedCourses,
              batchSize: upsertBatchSize,
              concurrency: upsertConcurrency,
            }),
          )
        }
      }),
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
