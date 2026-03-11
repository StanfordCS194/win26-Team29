import 'dotenv/config'
import { pathToFileURL } from 'node:url'

import { Command, Options } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Console, Effect, Layer } from 'effect'
import cliProgress from 'cli-progress'

import { DbLive } from '@scrape/shared/db-layer.ts'
import { generateEmbeddings } from './generate-embeddings.ts'
import { aggregateReviewText } from './aggregate-reviews.ts'

const batchSize = Options.integer('batch-size').pipe(
  Options.withDefault(100),
  Options.withDescription('Number of courses to process per batch'),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withDefault(5),
  Options.withDescription('Database operation concurrency'),
)

const year = Options.text('year').pipe(
  Options.optional,
  Options.withDescription('Filter by academic year (e.g., 2023-2024)'),
)

const subject = Options.text('subject').pipe(
  Options.optional,
  Options.withDescription('Filter by subject code (e.g., CS)'),
)

const force = Options.boolean('force').pipe(
  Options.withDefault(false),
  Options.withDescription('Regenerate embeddings even if they exist'),
)

const withReviews = Options.boolean('with-reviews').pipe(
  Options.withDefault(false),
  Options.withDescription('Aggregate review text before generating embeddings'),
)

const command = Command.make(
  'generate-embeddings',
  { batchSize, concurrency, year, subject, force, withReviews },
  (options) =>
    Effect.gen(function* () {
      yield* Console.log('[debug] CLI handler entered')
      const yearVal = options.year._tag === 'Some' ? options.year.value : undefined
      const subjectVal = options.subject._tag === 'Some' ? options.subject.value : undefined
      yield* Console.log(
        `[debug] year=${yearVal} subject=${subjectVal} withReviews=${options.withReviews} force=${options.force}`,
      )

      if (options.withReviews) {
        yield* Console.log('Step 1/2: Aggregating review text...')
        yield* aggregateReviewText({
          batchSize: options.batchSize,
          force: options.force,
          year: yearVal,
          subject: subjectVal,
        })
        yield* Console.log('Review text aggregation complete.\n')
        yield* Console.log('Step 2/2: Generating embeddings (with reviews)...')
      }

      const progressBar = new cliProgress.SingleBar(
        {
          format: 'Progress |{bar}| {percentage}% | {value}/{total}',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic,
      )

      yield* generateEmbeddings(
        {
          batchSize: options.batchSize,
          concurrency: options.concurrency,
          year: yearVal,
          subject: subjectVal,
          force: options.withReviews || options.force,
        },
        progressBar,
      )
    }),
)

const cli = Command.run(command, {
  name: 'Embedding Generator',
  version: 'v1.0.0',
})

const CliLive = Layer.mergeAll(NodeContext.layer, Layer.setConfigProvider(ConfigProvider.fromEnv())).pipe(
  Layer.provideMerge(DbLive),
)

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).pipe(Effect.provide(CliLive), NodeRuntime.runMain)
}
