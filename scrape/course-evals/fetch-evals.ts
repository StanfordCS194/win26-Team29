// fetch-evals.ts
import { Chunk, Config, Effect, Option, Stream, pipe } from 'effect'
import { HttpClient, HttpClientRequest } from '@effect/platform'
import type { ConfigError } from 'effect/ConfigError'
import {
  Quarter,
  QuarterSchema,
  parseListingsResponse,
  type EvalInfo,
} from './parse-listings.ts'
import { parseReport, type ProcessedReport } from './parse-report.ts'
import z from 'zod'

const YearQuarterPairSchema = z.object({
  year: z.number().int().min(2000),
  quarter: QuarterSchema,
})
type YearQuarterPair = z.infer<typeof YearQuarterPairSchema>

const createListingsHeaders = (cookie: string) => ({
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json; charset=utf-8',
  Cookie: cookie,
})

const createReportHeaders = (cookie: string) => ({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Cookie: cookie,
})

const getQuarterCode = (quarter: Quarter, year: number): string => {
  const yearSuffix = year.toString().slice(-2)
  switch (quarter) {
    case Quarter.Winter:
      return `W${yearSuffix}`
    case Quarter.Spring:
      return `Sp${yearSuffix}`
    case Quarter.Summer:
      return `Su${yearSuffix}`
    case Quarter.Fall:
      return `F${yearSuffix}`
  }
}

const buildSearchUrl = (
  subject: string,
  year: number,
  quarter: Quarter,
  page: number,
): string => {
  const quarterCode = getQuarterCode(quarter, year)
  return `https://stanford.evaluationkit.com/AppApi/Report/PublicReport?course=${quarterCode}-${subject}-&page=${page}`
}

const buildReportUrl = (dataIds: [string, string, string, string]): string =>
  `https://stanford.evaluationkit.com/Reports/StudentReport.aspx?id=${dataIds.join(',')}`

const fetchSearchPage = (
  subject: string,
  year: number,
  quarter: Quarter,
  page: number,
): Effect.Effect<
  { hasMore: boolean; entries: Array<EvalInfo> },
  Error | ConfigError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const cookie = yield* _(Config.string('EVAL_COOKIE'))
    const url = buildSearchUrl(subject, year, quarter, page)

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders(createListingsHeaders(cookie)),
    )

    const response = yield* _(client.execute(request))
    const json = yield* _(response.json)
    return yield* _(parseListingsResponse(json))
  })

const streamEvalInfosForSubjectYearQuarter = (
  subject: string,
  year: number,
  quarter: Quarter,
): Stream.Stream<EvalInfo, Error | ConfigError, HttpClient.HttpClient> =>
  Stream.paginateChunkEffect(1, (page) =>
    Effect.gen(function* (_) {
      const pageResult = yield* _(fetchSearchPage(subject, year, quarter, page))

      return [
        Chunk.unsafeFromArray(pageResult.entries),
        pageResult.hasMore ? Option.some(page + 1) : Option.none(),
      ] as const
    }),
  )

const streamEvalInfos = (
  yearQuarterPairs: Array<YearQuarterPair>,
  subjects: Array<string>,
): Stream.Stream<EvalInfo, Error | ConfigError, HttpClient.HttpClient> => {
  const streams = subjects.flatMap((subject) =>
    yearQuarterPairs.map(({ year, quarter }) =>
      streamEvalInfosForSubjectYearQuarter(subject, year, quarter),
    ),
  )

  return Stream.mergeAll(streams, { concurrency: 'unbounded' })
}

const fetchReportHtml = (
  url: string,
): Effect.Effect<string, Error | ConfigError, HttpClient.HttpClient> =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const cookie = yield* _(Config.string('EVAL_COOKIE'))

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders(createReportHeaders(cookie)),
    )

    const response = yield* _(client.execute(request))
    return yield* _(response.text)
  })

export const processReports = (
  yearQuarterPairs: Array<YearQuarterPair>,
  subjects: Array<string>,
) =>
  streamEvalInfos(yearQuarterPairs, subjects).pipe(
    Stream.mapEffect((info) =>
      pipe(
        Effect.gen(function* (_) {
          const url = buildReportUrl(info.dataIds)
          const html = yield* _(fetchReportHtml(url))
          return yield* _(parseReport(html, info))
        }),
        Effect.either,
      ),
    ),
  )

// Re-export types
export type { EvalInfo, YearQuarterPair, ProcessedReport }
export { Quarter, QuarterSchema }
