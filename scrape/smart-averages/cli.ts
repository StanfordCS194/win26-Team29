import 'dotenv/config'

import { Command, Options } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Console, Effect, Layer, Option } from 'effect'

import { DbLive } from '@scrape/shared/db-layer.ts'

import { DEFAULT_PARAMS, type MetricParams } from './smart-average.ts'
import { computeAndStoreMetrics } from './orchestrate.ts'

const ALL_QUARTERS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const

const year = Options.text('year').pipe(
  Options.withAlias('y'),
  Options.withDescription('Academic year to process, e.g. 2024-2025 (use with --quarters)'),
)

const quarters = Options.text('quarters').pipe(
  Options.withAlias('q'),
  Options.withDescription('Comma-separated quarters (default: Autumn,Winter,Spring,Summer)'),
  Options.optional,
)

const maxYears = Options.integer('max-years').pipe(
  Options.withDescription('Lookback window in years for prior reports'),
  Options.optional,
)

function buildYearTerms(options: { year: string; quarters: Option.Option<string> }): [string, string][] {
  const quarterList = Option.match(options.quarters, {
    onNone: () => [...ALL_QUARTERS],
    onSome: (q) =>
      q
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
  })
  return quarterList.map((q) => [options.year, q] as [string, string])
}

const command = Command.make('smart-averages', { year, quarters, maxYears }, (options) =>
  Effect.gen(function* () {
    const yearTerms = buildYearTerms(options)

    const params: MetricParams = {
      ...DEFAULT_PARAMS,
      ...Option.match(options.maxYears, {
        onNone: () => ({}),
        onSome: (v) => ({ maxYears: v }),
      }),
    }

    yield* Console.log(`Smart Averages: processing ${yearTerms.length} batch(es) for year ${options.year}`)

    const stats = yield* computeAndStoreMetrics(yearTerms, params)

    const totalSections = stats.reduce((sum, s) => sum + s.sections, 0)
    const totalRows = stats.reduce((sum, s) => sum + s.rowsWritten, 0)
    yield* Console.log(`Total: ${totalSections} sections, ${totalRows} rows written`)
  }),
)

const cli = Command.run(command, {
  name: 'Smart Averages',
  version: 'v1.0.0',
})

const CliLive = Layer.mergeAll(NodeContext.layer, Layer.setConfigProvider(ConfigProvider.fromEnv())).pipe(
  Layer.provideMerge(DbLive),
)

cli(process.argv).pipe(Effect.provide(CliLive), NodeRuntime.runMain)
