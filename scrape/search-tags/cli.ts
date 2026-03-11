import { config } from 'dotenv'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const DEFAULT_OUTPUT = 'data/search-tags/tags.jsonl'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env'), override: true })

import { Command, Options } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Effect, Layer } from 'effect'
import cliProgress from 'cli-progress'

import { DbLive } from '@scrape/shared/db-layer.ts'
import { generateSearchTags } from './generate-search-tags.ts'

const batchSize = Options.integer('batch-size').pipe(
  Options.withDefault(200),
  Options.withDescription('Number of offerings to process per batch'),
)

const concurrency = Options.integer('concurrency').pipe(
  Options.withDefault(10),
  Options.withDescription('Maximum concurrent GPT requests'),
)

const writeBatchSize = Options.integer('write-batch-size').pipe(
  Options.withDefault(400),
  Options.withDescription('Number of offerings to batch per DB merge'),
)

const rateLimit = Options.integer('rate-limit').pipe(
  Options.withDefault(10),
  Options.withDescription('Maximum OpenAI API requests per second'),
)

const retries = Options.integer('retries').pipe(
  Options.withDefault(2),
  Options.withDescription('Number of retry attempts for failed API requests'),
)

const backoff = Options.integer('backoff').pipe(
  Options.withDefault(100),
  Options.withDescription('Initial backoff delay in milliseconds for retries'),
)

const year = Options.text('year').pipe(
  Options.withAlias('y'),
  Options.withDescription('Academic year to process (e.g., 2023-2024)'),
)

const subject = Options.text('subject').pipe(
  Options.optional,
  Options.withDescription('Filter by subject code (e.g., CS)'),
)

const force = Options.boolean('force').pipe(
  Options.withDefault(false),
  Options.withDescription('Regenerate tags even if they exist'),
)

const dryRun = Options.integer('dry-run').pipe(
  Options.optional,
  Options.withDescription('Dry run: call GPT for N offerings and log the tags (no DB writes)'),
)

const output = Options.text('output').pipe(
  Options.withAlias('o'),
  Options.withDefault(DEFAULT_OUTPUT),
  Options.withDescription('Path to a JSONL file to append results to as they arrive'),
)

const command = Command.make(
  'generate-search-tags',
  {
    batchSize,
    concurrency,
    writeBatchSize,
    rateLimit,
    retries,
    backoff,
    year,
    subject,
    force,
    dryRun,
    output,
  },
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

      const outputFile =
        options.output === DEFAULT_OUTPUT
          ? join('data/search-tags', options.year, 'tags.jsonl')
          : options.output
      const failuresPath = join(dirname(outputFile), 'search-tags-failures.jsonl')

      yield* generateSearchTags(
        {
          batchSize: options.batchSize,
          concurrency: options.concurrency,
          writeBatchSize: options.writeBatchSize,
          rateLimit: options.rateLimit,
          retries: options.retries,
          backoff: options.backoff,
          year: options.year,
          subject: options.subject._tag === 'Some' ? options.subject.value : undefined,
          force: options.force,
          dryRunCount: options.dryRun._tag === 'Some' ? options.dryRun.value : undefined,
          outputFile,
          failuresPath,
        },
        progressBar,
      )
    }),
)

const cli = Command.run(command, {
  name: 'Search Tags Generator',
  version: 'v1.0.0',
})

const CliLive = Layer.mergeAll(NodeContext.layer, Layer.setConfigProvider(ConfigProvider.fromEnv())).pipe(
  Layer.provideMerge(DbLive),
)

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).pipe(Effect.provide(CliLive), NodeRuntime.runMain)
}
