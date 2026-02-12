// fetch-evals.ts
import { HttpClient, HttpClientRequest } from '@effect/platform'
import { Chunk, Config, Data, Effect, Option, Stream, pipe } from 'effect'

import { fetchSubjects } from '@scrape/explore-courses/fetch-parse/fetch-courses.ts'
import { QuarterEnum } from '@scrape/shared/schemas.ts'
import { ListingsParseError, parseListingsResponse } from './parse-listings.ts'
import type { Quarter } from '@scrape/shared/schemas.ts'
import type {
  SubjectsFetchError,
  SubjectsXMLParseError,
} from '@scrape/explore-courses/fetch-parse/fetch-courses.ts'
import type { EvalInfo } from './parse-listings.ts'

import type { ConfigError } from 'effect/ConfigError'

export type HtmlReportItem = { html: string; evalInfo: EvalInfo; source: 'http' | 'cache' }

export class ListingsFetchError extends Data.TaggedError('ListingsFetchError')<{
  message: string
  subject: string
  year: number
  quarter: string
  page: number
  url: string
  cause?: unknown
}> {}

export class ReportFetchError extends Data.TaggedError('ReportFetchError')<{
  message: string
  url: string
  courseCodes: Array<string>
  year: number
  quarter: string
  evalInfo: EvalInfo
  cause?: unknown
}> {}

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

const quarterCodeMap = {
  Winter: 'W',
  Spring: 'Sp',
  Summer: 'Su',
  Autumn: 'F',
} as const satisfies Record<Quarter, string>

const getQuarterCode = (quarter: Quarter, year: number): string => {
  const yearSuffix = year.toString().slice(-2)
  return `${quarterCodeMap[quarter]}${yearSuffix}`
}

/** Academic year string for explore-courses (e.g. "20232024"). Autumn starts the year. */
const getAcademicYearParam = (year: number, quarter: Quarter): string => {
  const startYear = quarter === QuarterEnum.Autumn ? year : year - 1
  const endYear = startYear + 1
  return `${startYear}${endYear}`
}

/** If subjects is ['all'], resolve to all subject codes via fetchSubjects; otherwise return subjects as-is. */
export const resolveSubjects = (
  subjects: Array<string>,
  year: number,
  quarter: Quarter,
): Effect.Effect<
  Array<string>,
  SubjectsFetchError | SubjectsXMLParseError | ConfigError,
  HttpClient.HttpClient
> =>
  subjects.length === 1 && subjects[0] === 'all'
    ? pipe(
        fetchSubjects(getAcademicYearParam(year, quarter)),
        Effect.map((subs) => subs.map((s) => s.name)),
      )
    : Effect.succeed(subjects)

const buildSearchUrl = (subject: string, year: number, quarter: Quarter, page: number): string => {
  const quarterCode = getQuarterCode(quarter, year)
  return `https://stanford.evaluationkit.com/AppApi/Report/PublicReport?course=${encodeURIComponent(`${quarterCode}-${subject}-`)}&page=${page}&sort=course`
}

export const buildReportUrl = (dataIds: [string, string, string, string]): string =>
  `https://stanford.evaluationkit.com/Reports/StudentReport.aspx?id=${dataIds.join(',')}`

const fetchSearchPage = (
  subject: string,
  year: number,
  quarter: Quarter,
  page: number,
): Effect.Effect<
  { hasMore: boolean; entries: Array<EvalInfo> },
  ListingsParseError | ListingsFetchError,
  HttpClient.HttpClient
> => {
  const url = buildSearchUrl(subject, year, quarter, page)

  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const cookie = yield* Config.string('EVAL_COOKIE')

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders(createListingsHeaders(cookie)),
    )

    const response = yield* client.execute(request)
    const json = yield* response.json
    return yield* parseListingsResponse(json, year, quarter)
  }).pipe(
    Effect.mapError((error) => {
      if (error instanceof ListingsParseError) {
        return new ListingsParseError({
          message: error.message,
          year: error.year,
          quarter: error.quarter,
          htmlFragment: error.htmlFragment,
          cause: error.cause,
          subject,
        })
      }
      return new ListingsFetchError({
        message: error instanceof Error ? error.message : JSON.stringify(error),
        subject,
        year,
        quarter,
        page,
        url,
        cause: error,
      })
    }),
  )
}

export const streamEvalInfosForSubject = (
  subject: string,
  year: number,
  quarter: Quarter,
): Stream.Stream<EvalInfo, ListingsParseError | ListingsFetchError, HttpClient.HttpClient> =>
  Stream.paginateChunkEffect(1, (page) =>
    Effect.gen(function* () {
      const pageResult = yield* fetchSearchPage(subject, year, quarter, page)

      return [
        Chunk.unsafeFromArray(pageResult.entries),
        pageResult.hasMore ? Option.some(page + 1) : Option.none(),
      ] as const
    }),
  )

export const fetchReportHtml = (
  url: string,
): Effect.Effect<string, Error | ConfigError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const cookie = yield* Config.string('EVAL_COOKIE')

    const request = HttpClientRequest.get(url).pipe(HttpClientRequest.setHeaders(createReportHeaders(cookie)))

    const response = yield* client.execute(request)
    return yield* response.text
  })
