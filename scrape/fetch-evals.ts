import 'dotenv/config'
import { Context, Effect, Layer, Schedule } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { parse } from 'node-html-parser'
import { z } from 'zod'

// ============================================================================
// Enums and Types
// ============================================================================

export enum Quarter {
  WINTER = 'Winter',
  SPRING = 'Spring',
  SUMMER = 'Summer',
  FALL = 'Autumn', // Note: API uses "Autumn" not "Fall"
}

export type CourseCode = {
  subject: string
  number: string
}

export type CourseEvalInfo = {
  courseCodes: Array<CourseCode>
  section: number
  quarter: Quarter
  year: number
  responded: number
  total: number
  dataIds: [string, string, string, string]
}

// ============================================================================
// Schemas
// ============================================================================

const ApiResponseSchema = z.object({
  hasMore: z.boolean(),
  results: z.array(z.string()), // HTML fragments
})

// ============================================================================
// Parsing Layer
// ============================================================================

const parseQuarter = (text: string): Quarter | null => {
  const match = text.match(/(Winter|Spring|Summer|Autumn)\s+(\d{4})/)
  if (!match) return null
  
  const quarterStr = match[1]
  switch (quarterStr) {
    case 'Winter': return Quarter.WINTER
    case 'Spring': return Quarter.SPRING
    case 'Summer': return Quarter.SUMMER
    case 'Autumn': return Quarter.FALL
    default: return null
  }
}

const parseYear = (text: string): number => {
  const match = text.match(/(Winter|Spring|Summer|Autumn)\s+(\d{4})/)
  return match ? parseInt(match[2], 10) : 0
}

const parseCourseEvalInfo = (htmlFragment: string): CourseEvalInfo | null => {
  const root = parse(htmlFragment)

  // 1) Parse course codes + section
  const codesP = root.querySelector('p.sr-dataitem-info-code')
  const codes: Array<CourseCode> = []
  let section = 0

  if (codesP) {
    const text = codesP.text.trim()
    const chunks = text.split('/')
    
    for (const chunk of chunks) {
      const parts = chunk.split('-')
      if (parts.length >= 4) {
        const [, subj, num, sec] = parts
        codes.push({ subject: subj, number: num })
        section = parseInt(sec, 10)
      }
    }
  }

  // 2) Parse term → quarter & year
  const infoDiv = root.querySelector('div.sr-dataitem-info')
  const termP = infoDiv?.querySelector('p.small')
  
  let quarter: Quarter | null = null
  let year = 0

  if (termP) {
    const text = termP.text.trim()
    quarter = parseQuarter(text)
    year = parseYear(text)
  }

  // 3) Parse responded / total
  let responded = 0
  let total = 0
  const span = root.querySelector('.sr-avg span')
  
  if (span) {
    const match = span.text.match(/(\d+)\s+of\s+(\d+)/)
    if (match) {
      responded = parseInt(match[1], 10)
      total = parseInt(match[2], 10)
    }
  }

  // 4) Parse data-ids
  const viewA = root.querySelector('a.sr-view-report')
  const dataIds: [string, string, string, string] = viewA
    ? [
        viewA.getAttribute('data-id0') || '',
        viewA.getAttribute('data-id1') || '',
        viewA.getAttribute('data-id2') || '',
        viewA.getAttribute('data-id3') || '',
      ]
    : ['', '', '', '']

  // Return null if no valid quarter found
  if (quarter === null) {
    return null
  }

  return {
    courseCodes: codes,
    section,
    quarter,
    year,
    responded,
    total,
    dataIds,
  }
}

export const parseCourseEvalInfos = (
  response: unknown
): Effect.Effect<{ hasMore: boolean; entries: Array<CourseEvalInfo> }, Error> =>
  Effect.gen(function* (_) {
    // Validate response structure
    const parseResult = ApiResponseSchema.safeParse(response)
    if (!parseResult.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid API response: ${parseResult.error.message}`)
        )
      )
    }

    const data = parseResult.data
    const hasMore = data.hasMore
    const entries: Array<CourseEvalInfo> = []

    // Parse each HTML fragment
    for (const fragment of data.results) {
      const info = parseCourseEvalInfo(fragment)
      if (info !== null) {
        entries.push(info)
      }
    }

    return { hasMore, entries }
  })

// ============================================================================
// HTTP Layer
// ============================================================================

const getEvalHeaders = () => {
  const cookie = process.env.EVAL_COOKIE
  if (!cookie) {
    throw new Error('EVAL_COOKIE environment variable is required. Please set it in your .env file.')
  }
  
  return {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json; charset=utf-8',
    Cookie: cookie,
  }
}

const buildUrl = (subject: string, year: number, page: number): string =>
  `https://stanford.evaluationkit.com/AppApi/Report/PublicReport` +
  `?Course=${subject}&Year=${year}&page=${page}`

const fetchPage = (
  subject: string,
  year: number,
  page: number
): Effect.Effect<
  { hasMore: boolean; entries: Array<CourseEvalInfo> },
  Error,
  HttpClient.HttpClient
> =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const url = buildUrl(subject, year, page)

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders(getEvalHeaders())
    )

    const response = yield* _(client.execute(request))
    const json = yield* _(response.json)

    return yield* _(parseCourseEvalInfos(json))
  })

// ============================================================================
// Filtering
// ============================================================================

const matchesFilters = (
  entry: CourseEvalInfo,
  year: number,
  quarters: Array<Quarter>,
  subject: string
): boolean => {
  if (entry.year !== year) return false
  if (!quarters.includes(entry.quarter)) return false
  if (!entry.courseCodes.some((cc) => cc.subject === subject)) return false
  return true
}

// ============================================================================
// Orchestration Layer
// ============================================================================

export const fetchCourseEvalInfos = (
  year: number,
  quarters: Array<Quarter>,
  subject: string
): Effect.Effect<Array<CourseEvalInfo>, Error, HttpClient.HttpClient> =>
  Effect.gen(function* (_) {
    let page = 1
    const results: Array<CourseEvalInfo> = []
    let hasMore = true

    while (hasMore) {
      const pageResult = yield* _(fetchPage(subject, year, page))
      
      // Filter and collect matching entries
      for (const entry of pageResult.entries) {
        if (matchesFilters(entry, year, quarters, subject)) {
          results.push(entry)
        }
      }

      hasMore = pageResult.hasMore
      page += 1
    }

    return results
  })
