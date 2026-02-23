import 'dotenv/config'
import { pathToFileURL } from 'node:url'

import { Command, Options } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Effect, Layer } from 'effect'
import cliProgress from 'cli-progress'

import { DbLive } from '@scrape/shared/db-layer.ts'
import { generateEmbeddings } from './generate-embeddings.ts'

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

const command = Command.make(
  'generate-embeddings',
  { batchSize, concurrency, year, subject, force },
  (options) =>
    Effect.gen(function* () {
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
          year: options.year._tag === 'Some' ? options.year.value : undefined,
          subject: options.subject._tag === 'Some' ? options.subject.value : undefined,
          force: options.force,
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
