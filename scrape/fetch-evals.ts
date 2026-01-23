import 'dotenv/config'
import { Chunk, Effect, Either, Option, Stream } from 'effect'
import { HttpClient, HttpClientRequest } from '@effect/platform'
import { parse } from 'node-html-parser'
import { z } from 'zod'
import { decode } from 'html-entities'
import type { HTMLElement } from 'node-html-parser'

// ============================================================================
// Core Domain Schemas
// ============================================================================

export enum Quarter {
  Winter = 'Winter',
  Spring = 'Spring',
  Summer = 'Summer',
  Fall = 'Fall',
}
const QuarterSchema = z.enum(Quarter)

const CourseCodeSchema = z.object({
  subject: z.string().min(1),
  number: z.string().min(1),
})
type CourseCode = z.infer<typeof CourseCodeSchema>

const CourseEvalInfoSchema = z.object({
  courseCodes: z.array(CourseCodeSchema).min(1),
  section: z.number().int().nonnegative(),
  quarter: QuarterSchema,
  year: z.number().int().min(2000),
  responded: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  dataIds: z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
  ]),
})
type CourseEvalInfo = z.infer<typeof CourseEvalInfoSchema>

const YearQuarterPairSchema = z.object({
  year: z.number().int().min(2000),
  quarter: QuarterSchema,
})
type YearQuarterPair = z.infer<typeof YearQuarterPairSchema>

// ============================================================================
// Question Schemas
// ============================================================================

const ResponseOptionSchema = z.object({
  option: z.string().min(1),
  weight: z.number(),
  frequency: z.number().int().nonnegative(),
})

const NumericQuestionSchema = z.object({
  type: z.literal('numeric'),
  responses: z.array(ResponseOptionSchema),
})

const TextQuestionSchema = z.object({
  type: z.literal('text'),
  responses: z.array(z.string().min(1)),
})

const QuestionSchema = z.discriminatedUnion('type', [
  NumericQuestionSchema,
  TextQuestionSchema,
])
type Question = z.infer<typeof QuestionSchema>

type QuestionSchemaType = (typeof QuestionSchema.options)[number]

// ============================================================================
// Known Questions Configuration
// ============================================================================

enum KnownQuestion {
  HowWellDidYouAchieve = 'How well did you achieve the learning goals of this course?',
  AboutWhatPercentInPerson = 'About what percent of the class meetings (including discussions) did you attend in person?',
  AboutWhatPercentOnline = 'About what percent of the class meetings did you attend online?',
  HowMuchDidYouLearn = 'How much did you learn from this course?',
  OverallQualityOfInstruction = 'Overall, how would you describe the quality of the instruction in this course?',
  HowManyHoursPerWeek = 'How many hours per week on average did you spend on this course (including class meetings)?',
  HowOrganized = 'How organized was the course?',
  WhatWouldYouLikeToSay = 'What would you like to say about this course to a student who is considering taking it in the future?',
}

const KnownQuestionSchema = z.enum(KnownQuestion)

const QUESTION_KIND_MAP = {
  [KnownQuestion.HowWellDidYouAchieve]: NumericQuestionSchema,
  [KnownQuestion.AboutWhatPercentInPerson]: NumericQuestionSchema,
  [KnownQuestion.AboutWhatPercentOnline]: NumericQuestionSchema,
  [KnownQuestion.HowMuchDidYouLearn]: NumericQuestionSchema,
  [KnownQuestion.OverallQualityOfInstruction]: NumericQuestionSchema,
  [KnownQuestion.HowManyHoursPerWeek]: NumericQuestionSchema,
  [KnownQuestion.HowOrganized]: NumericQuestionSchema,
  [KnownQuestion.WhatWouldYouLikeToSay]: TextQuestionSchema,
} as const satisfies Record<KnownQuestion, QuestionSchemaType>

const QuestionTypeMapSchema = z
  .object(QUESTION_KIND_MAP)
  .catchall(QuestionSchema)
type QuestionTypeMap = z.infer<typeof QuestionTypeMapSchema>

const ProcessedReportSchema = z.object({
  info: CourseEvalInfoSchema,
  questions: QuestionTypeMapSchema,
})
type ProcessedReport = z.infer<typeof ProcessedReportSchema>

// ============================================================================
// API Response Schema
// ============================================================================

const ApiResponseSchema = z.object({
  hasMore: z.boolean(),
  results: z.array(z.string()),
})

// ============================================================================
// Configuration
// ============================================================================

const getEvalCookie = (): Effect.Effect<string, Error> =>
  Effect.gen(function* (_) {
    const cookie = process.env.EVAL_COOKIE
    if (!cookie) {
      return yield* _(
        Effect.fail(
          new Error(
            'EVAL_COOKIE environment variable is required. Please set it in your .env file.',
          ),
        ),
      )
    }
    return cookie
  })

const createApiHeaders = (cookie: string) => ({
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json; charset=utf-8',
  Cookie: cookie,
})

const createReportHeaders = (cookie: string) => ({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Cookie: cookie,
})

// ============================================================================
// URL Building
// ============================================================================

const getQuarterCode = (quarter: Quarter, year: number): string => {
  const yearSuffix = year.toString().slice(-2) // Last 2 digits of year
  switch (quarter) {
    case 'Winter':
      return `W${yearSuffix}`
    case 'Spring':
      return `Sp${yearSuffix}`
    case 'Summer':
      return `Su${yearSuffix}`
    case 'Fall':
      return `F${yearSuffix}`
    default:
      throw new Error(`Unknown quarter: ${quarter}`)
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

// ============================================================================
// HTML Parsing Utilities
// ============================================================================

const cleanQuestionText = (text: string): string =>
  text.replace(/^\d+\s*-\s*/, '').trim()

function normalizeText(str: string): string {
  return decode(str) // decode all HTML entities
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .normalize('NFC')
    .trim()
}

const matchKnownQuestion = (cleanedText: string): KnownQuestion | string => {
  const knownQuestions = KnownQuestionSchema.options
  for (const question of knownQuestions) {
    if (cleanedText.startsWith(question)) {
      return question
    }
  }
  // Return the cleaned text as-is for unknown questions
  return cleanedText
}

const parseNumber = (value: string): Effect.Effect<number, Error> =>
  Effect.gen(function* (_) {
    const normalized = value.replace(/,/g, '').trim()
    if (normalized.length === 0) {
      return yield* _(
        Effect.fail(new Error(`Cannot parse empty string as number`)),
      )
    }
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) {
      return yield* _(Effect.fail(new Error(`Invalid number: "${value}"`)))
    }
    return parsed
  })

const parseWeight = (value: string): Effect.Effect<number, Error> =>
  Effect.gen(function* (_) {
    const match = value.match(/\(([0-9.]+)\)/)
    if (!match) {
      return yield* _(
        Effect.fail(new Error(`Could not extract weight from: "${value}"`)),
      )
    }
    return yield* _(parseNumber(match[1]))
  })

const findAncestorWithClass = (
  node: HTMLElement,
  className: string,
): HTMLElement => {
  let current: HTMLElement | null = node
  while (current) {
    const classes = (current.getAttribute('class') || '').split(/\s+/)
    if (classes.includes(className)) return current
    current = current.parentNode as HTMLElement | null
  }
  throw new Error(
    `Could not find ancestor with class "${className}" for node ${node.tagName}`,
  )
}

// ============================================================================
// CourseEvalInfo Parsing
// ============================================================================

const parseQuarter = (text: string): Effect.Effect<Quarter, Error> =>
  Effect.gen(function* (_) {
    const match = text.match(/(Winter|Spring|Summer|Fall)\s+(\d{4})/)
    if (!match) {
      return yield* _(
        Effect.fail(new Error(`Could not parse quarter from: "${text}"`)),
      )
    }
    const quarterStr = match[1]
    const result = QuarterSchema.safeParse(quarterStr)
    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid quarter "${quarterStr}": ${result.error.message}`),
        ),
      )
    }
    return result.data
  })

const parseYear = (text: string): Effect.Effect<number, Error> =>
  Effect.gen(function* (_) {
    const match = text.match(/(Winter|Spring|Summer|Fall)\s+(\d{4})/)
    if (!match) {
      return yield* _(
        Effect.fail(new Error(`Could not parse year from: "${text}"`)),
      )
    }
    return parseInt(match[2], 10)
  })

const parseCourseEvalInfo = (
  htmlFragment: string,
): Effect.Effect<CourseEvalInfo, Error> =>
  Effect.gen(function* (_) {
    const root = parse(htmlFragment)

    // Parse course codes + section
    const codesP = root.querySelector('p.sr-dataitem-info-code')
    if (!codesP) {
      return yield* _(
        Effect.fail(
          new Error('Could not find course code element in HTML fragment'),
        ),
      )
    }

    const codes: Array<CourseCode> = []
    let section = 0

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

    if (codes.length === 0) {
      return yield* _(
        Effect.fail(
          new Error(`Could not parse any course codes from: "${text}"`),
        ),
      )
    }

    // Parse term
    const infoDiv = root.querySelector('div.sr-dataitem-info')
    if (!infoDiv) {
      return yield* _(
        Effect.fail(new Error('Could not find sr-dataitem-info div')),
      )
    }

    const termP = infoDiv.querySelector('p.small')
    if (!termP) {
      return yield* _(Effect.fail(new Error('Could not find term paragraph')))
    }

    const termText = termP.text.trim()
    const quarter = yield* _(parseQuarter(termText))
    const year = yield* _(parseYear(termText))

    // Parse responded / total
    const span = root.querySelector('.sr-avg span')
    if (!span) {
      return yield* _(
        Effect.fail(new Error('Could not find response count span')),
      )
    }

    const match = span.text.match(/(\d+)\s+of\s+(\d+)/)
    if (!match) {
      return yield* _(
        Effect.fail(
          new Error(`Could not parse response counts from: "${span.text}"`),
        ),
      )
    }

    const responded = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)

    // Parse data-ids
    const viewA = root.querySelector('a.sr-view-report')
    if (!viewA) {
      return yield* _(Effect.fail(new Error('Could not find view report link')))
    }

    const dataIds: [string, string, string, string] = [
      viewA.getAttribute('data-id0') || '',
      viewA.getAttribute('data-id1') || '',
      viewA.getAttribute('data-id2') || '',
      viewA.getAttribute('data-id3') || '',
    ]

    // Validate with schema
    const result = CourseEvalInfoSchema.safeParse({
      courseCodes: codes,
      section,
      quarter,
      year,
      responded,
      total,
      dataIds,
    })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(
            `Invalid CourseEvalInfo structure: ${result.error.message}`,
          ),
        ),
      )
    }

    return result.data
  })

const parseApiResponse = (
  response: unknown,
): Effect.Effect<{ hasMore: boolean; entries: Array<CourseEvalInfo> }, Error> =>
  Effect.gen(function* (_) {
    // Validate API response structure
    const parseResult = ApiResponseSchema.safeParse(response)
    if (!parseResult.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid API response: ${parseResult.error.message}`),
        ),
      )
    }

    const data = parseResult.data
    const entries: Array<CourseEvalInfo> = []

    // Parse each HTML fragment
    for (const fragment of data.results) {
      const info = yield* _(parseCourseEvalInfo(fragment))
      entries.push(info)
    }

    return { hasMore: data.hasMore, entries }
  })

// ============================================================================
// HTTP Layer - CourseEvalInfo Fetching
// ============================================================================

const fetchSearchPage = (
  subject: string,
  year: number,
  quarter: Quarter,
  page: number,
): Effect.Effect<
  { hasMore: boolean; entries: Array<CourseEvalInfo> },
  Error,
  HttpClient.HttpClient
> =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const cookie = yield* _(getEvalCookie())
    const url = buildSearchUrl(subject, year, quarter, page)

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders(createApiHeaders(cookie)),
    )

    const response = yield* _(client.execute(request))
    const json = yield* _(response.json)
    return yield* _(parseApiResponse(json))
  })

// ============================================================================
// Stream - CourseEvalInfo Pagination
// ============================================================================

const streamCourseEvalInfosForSubjectYearQuarter = (
  subject: string,
  year: number,
  quarter: Quarter,
): Stream.Stream<CourseEvalInfo, Error, HttpClient.HttpClient> =>
  Stream.paginateChunkEffect(1, (page) =>
    Effect.gen(function* (_) {
      const pageResult = yield* _(fetchSearchPage(subject, year, quarter, page))

      // Filter for specific quarter and subject
      const filtered = pageResult.entries.filter(
        (entry) =>
          entry.quarter === quarter &&
          entry.courseCodes.some((cc) => cc.subject === subject),
      )

      return [
        Chunk.unsafeFromArray(filtered),
        pageResult.hasMore ? Option.some(page + 1) : Option.none(),
      ] as const
    }),
  )

const streamCourseEvalInfos = (
  yearQuarterPairs: Array<YearQuarterPair>,
  subjects: Array<string>,
): Stream.Stream<CourseEvalInfo, Error, HttpClient.HttpClient> => {
  const streams = subjects.flatMap((subject) =>
    yearQuarterPairs.map(({ year, quarter }) =>
      streamCourseEvalInfosForSubjectYearQuarter(subject, year, quarter),
    ),
  )

  return Stream.mergeAll(streams, { concurrency: 'unbounded' })
}

// ============================================================================
// HTML Report Fetching
// ============================================================================

const fetchReportHtml = (
  url: string,
): Effect.Effect<string, Error, HttpClient.HttpClient> =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const cookie = yield* _(getEvalCookie())

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders(createReportHeaders(cookie)),
    )

    const response = yield* _(client.execute(request))
    return yield* _(response.text)
  })

// ============================================================================
// Question Block Extraction
// ============================================================================

type QuestionBlock = {
  questionText: string
  siblings: Array<HTMLElement>
}

const extractQuestionBlocks = (root: HTMLElement): Array<QuestionBlock> =>
  root.querySelectorAll('h4.question-text').map((questionNode) => {
    const questionText = questionNode.text.trim()
    const siblings: Array<HTMLElement> = []

    // Try to find panel structure first
    try {
      const heading = findAncestorWithClass(questionNode, 'panel-heading')
      const panelBody =
        heading.nextElementSibling &&
        (heading.nextElementSibling.getAttribute('class') || '').includes(
          'panel-body',
        )
          ? heading.nextElementSibling
          : undefined

      if (panelBody) {
        siblings.push(panelBody)
        return { questionText, siblings }
      }
    } catch {
      // Fall through to sibling collection
    }

    // Collect siblings until next H4
    let current = questionNode.nextElementSibling
    while (current && current.tagName !== 'H4') {
      siblings.push(current)
      current = current.nextElementSibling
    }

    return { questionText, siblings }
  })

// ============================================================================
// Question Parsing
// ============================================================================

const parseNumericQuestion = (
  questionKey: string,
  siblings: Array<HTMLElement>,
): Effect.Effect<z.infer<typeof NumericQuestionSchema>, Error> =>
  Effect.gen(function* (_) {
    const responses: Array<z.infer<typeof ResponseOptionSchema>> = []

    // Find options table
    const optionsTable = siblings
      .flatMap((node) => node.querySelectorAll('table'))
      .find((table) => {
        const headers = table.querySelectorAll('th')
        const headerTexts = Array.from(headers).map((h) => h.text.trim())
        return (
          headerTexts.includes('Response Option') &&
          headerTexts.includes('Weight') &&
          headerTexts.includes('Frequency')
        )
      })

    if (!optionsTable) {
      return yield* _(
        Effect.fail(
          new Error(
            `Could not find options table for numeric question: "${questionKey}"`,
          ),
        ),
      )
    }

    const rows = optionsTable.querySelectorAll('tr')
    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      if (cells.length >= 3) {
        const option = cells[0].text.trim().replace(/\s+/g, ' ')
        const weightText = cells[1].text.trim()
        const frequencyText = cells[2].text.trim()

        // Skip if any required field is empty
        if (!option || !weightText || !frequencyText) {
          continue
        }

        const weight = yield* _(parseWeight(weightText))
        const frequency = yield* _(parseNumber(frequencyText))

        responses.push({ option, weight, frequency })
      }
    }

    const result = NumericQuestionSchema.safeParse({
      type: 'numeric',
      responses,
    })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(
            `Invalid numeric question data for "${questionKey}": ${result.error.message}`,
          ),
        ),
      )
    }

    return result.data
  })

const parseTextQuestion = (
  questionKey: string,
  siblings: Array<HTMLElement>,
): Effect.Effect<z.infer<typeof TextQuestionSchema>, Error> =>
  Effect.gen(function* (_) {
    const responses: Array<string> = []

    // Find write-in responses list
    const list = siblings
      .flatMap((node) => node.querySelectorAll('ul'))
      .find((ul) => ul.getAttribute('role') === 'list')

    const items = list?.querySelectorAll('li[role="listitem"]') ?? []
    for (const item of items) {
      const text = item.text.trim()
      if (text.length > 0) {
        responses.push(text)
      }
    }

    const result = TextQuestionSchema.safeParse({
      type: 'text',
      responses,
    })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(
            `Invalid text question data for "${questionKey}": ${result.error.message}`,
          ),
        ),
      )
    }

    return result.data
  })

// ============================================================================
// Report Parsing
// ============================================================================

const parseReport = (
  html: string,
  info: CourseEvalInfo,
): Effect.Effect<ProcessedReport, Error> =>
  Effect.gen(function* (_) {
    const root = parse(html)
    const questions: Record<string, Question> = {}

    const blocks = extractQuestionBlocks(root)

    if (blocks.length === 0) {
      return yield* _(
        Effect.fail(new Error('No question blocks found in HTML report')),
      )
    }

    // log the current course info
    console.log(
      info.courseCodes.map((cc) => `${cc.subject}-${cc.number}`).join(', '),
    )

    for (const { questionText, siblings } of blocks) {
      const cleanedText = cleanQuestionText(normalizeText(questionText))
      const questionKey = matchKnownQuestion(cleanedText)

      // Determine expected type for this question
      const expectedSchema =
        questionKey in QUESTION_KIND_MAP
          ? QUESTION_KIND_MAP[questionKey as KnownQuestion]
          : null

      let parsedQuestion: Question

      if (expectedSchema === NumericQuestionSchema) {
        parsedQuestion = yield* _(parseNumericQuestion(questionKey, siblings))
      } else if (expectedSchema === TextQuestionSchema) {
        parsedQuestion = yield* _(parseTextQuestion(questionKey, siblings))
      } else {
        // Unknown question - try to infer type
        const numericResult = yield* _(
          parseNumericQuestion(questionKey, siblings).pipe(Effect.either),
        )
        const textResult = yield* _(
          parseTextQuestion(questionKey, siblings).pipe(Effect.either),
        )

        if (Either.isRight(numericResult) && Either.isLeft(textResult)) {
          parsedQuestion = numericResult.right
        } else if (Either.isLeft(numericResult) && Either.isRight(textResult)) {
          parsedQuestion = textResult.right
        } else if (
          Either.isRight(numericResult) &&
          Either.isRight(textResult)
        ) {
          return yield* _(
            Effect.fail(
              new Error(
                `Ambiguous question type for "${questionKey}": parsed as both numeric and text`,
              ),
            ),
          )
        } else {
          return yield* _(
            Effect.fail(
              new Error(
                `Could not parse question "${questionKey}" as either numeric or text`,
              ),
            ),
          )
        }
      }

      questions[questionKey] = parsedQuestion
    }

    // Validate final result with schema
    const result = ProcessedReportSchema.safeParse({ info, questions })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid processed report: ${result.error.message}`),
        ),
      )
    }

    return result.data
  })

// ============================================================================
// Main Pipeline
// ============================================================================

export const processReports = (
  yearQuarterPairs: Array<YearQuarterPair>,
  subjects: Array<string>,
): Stream.Stream<ProcessedReport, Error, HttpClient.HttpClient> =>
  streamCourseEvalInfos(yearQuarterPairs, subjects).pipe(
    Stream.mapEffect((info) =>
      Effect.gen(function* (_) {
        const url = buildReportUrl(info.dataIds)
        const html = yield* _(fetchReportHtml(url))
        return yield* _(parseReport(html, info))
      }),
    ),
  )

// ============================================================================
// Exports
// ============================================================================

export type {
  CourseCode,
  CourseEvalInfo,
  YearQuarterPair,
  Question,
  QuestionTypeMap,
  ProcessedReport,
}

export {
  QuarterSchema,
  CourseCodeSchema,
  CourseEvalInfoSchema,
  YearQuarterPairSchema,
  QuestionSchema,
  QuestionTypeMapSchema,
  ProcessedReportSchema,
  KnownQuestion,
  KnownQuestionSchema,
}
