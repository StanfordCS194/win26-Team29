import { Effect } from 'effect'
import { parse } from 'node-html-parser'
import { z } from 'zod'

export enum Quarter {
  Winter = 'Winter',
  Spring = 'Spring',
  Summer = 'Summer',
  Fall = 'Fall',
}

export const QuarterSchema = z.enum(Quarter)

export const CourseCodeSchema = z.object({
  subject: z.string().min(1),
  number: z.string().min(1),
})
export type CourseCode = z.infer<typeof CourseCodeSchema>

export const EvalInfoSchema = z.object({
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
export type EvalInfo = z.infer<typeof EvalInfoSchema>

const ListingsResponseSchema = z.object({
  hasMore: z.boolean(),
  results: z.array(z.string()),
})

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

const parseEvalInfo = (htmlFragment: string): Effect.Effect<EvalInfo, Error> =>
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
    const result = EvalInfoSchema.safeParse({
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
          new Error(`Invalid EvalInfo structure: ${result.error.message}`),
        ),
      )
    }

    return result.data
  })

export const parseListingsResponse = (
  response: unknown,
): Effect.Effect<{ hasMore: boolean; entries: Array<EvalInfo> }, Error> =>
  Effect.gen(function* (_) {
    // Validate API response structure
    const parseResult = ListingsResponseSchema.safeParse(response)
    if (!parseResult.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid API response: ${parseResult.error.message}`),
        ),
      )
    }

    const data = parseResult.data
    const entries: Array<EvalInfo> = []

    // Parse each HTML fragment
    for (const fragment of data.results) {
      const info = yield* _(parseEvalInfo(fragment))
      entries.push(info)
    }

    return { hasMore: data.hasMore, entries }
  })
