import { Data, Effect, MutableHashSet } from 'effect'
import { parse } from 'node-html-parser'
import { z } from 'zod'

import { CourseCodeSchema, QuarterSchema } from '@scrape/shared/schemas.ts'
import type { CodeNumber, Quarter } from '@scrape/shared/schemas.ts'

const SectionCourseCodeSchema = z.object({
  sectionNumber: z.string().min(1),
  subject: CourseCodeSchema.shape.subject,
  codeNumber: CourseCodeSchema.shape.code,
})

export const EvalInfoSchema = z.object({
  sectionCourseCodes: z.array(SectionCourseCodeSchema).min(1),
  quarter: QuarterSchema,
  year: z.number().int().min(2000),
  responded: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  dataIds: z.tuple([z.string(), z.string(), z.string(), z.string()]),
})
export type EvalInfo = z.infer<typeof EvalInfoSchema>

export class ListingsParseError extends Data.TaggedError('ListingsParseError')<{
  message: string
  year: number
  quarter: string
  subject?: string
  htmlFragment?: string
  cause?: unknown
}> {}

/** Format EvalInfo section course codes into human-readable strings like ["CS106A-01"]. */
export const formatCourseCodes = (info: EvalInfo): Array<string> =>
  info.sectionCourseCodes.map(
    (scc) => `${scc.subject}${scc.codeNumber.number}${scc.codeNumber.suffix ?? ''}-${scc.sectionNumber}`,
  )

/** Key for (subject, code, sectionNumber) - used for deduplication */
export const sectionKey = (subject: string, code: CodeNumber, sectionNumber: string) =>
  Data.struct({
    subject,
    code: Data.struct({ number: code.number, suffix: code.suffix }),
    sectionNumber,
  })

const ListingsResponseSchema = z.object({
  hasMore: z.boolean(),
  results: z.array(z.string()),
})

const parseEvalInfo = (
  htmlFragment: string,
  year: number,
  quarter: Quarter,
): Effect.Effect<EvalInfo, ListingsParseError> =>
  Effect.gen(function* () {
    const fail = (message: string) =>
      Effect.fail(
        new ListingsParseError({
          message,
          year,
          quarter,
          htmlFragment: htmlFragment.slice(0, 300),
        }),
      )

    const root = parse(htmlFragment)

    // Parse course codes + section
    const codesP = root.querySelector('p.sr-dataitem-info-code')
    if (!codesP) {
      return yield* fail('Could not find course code element in HTML fragment')
    }

    const sectionCourseCodes: Array<z.input<typeof SectionCourseCodeSchema>> = []

    const text = codesP.text.trim()
    const chunks = text.split('/')
    for (const chunk of chunks) {
      const parts = chunk.split('-')
      if (parts.length >= 4) {
        const [, subj, num, sec] = parts
        sectionCourseCodes.push({ subject: subj, codeNumber: num, sectionNumber: sec })
      }
    }

    if (sectionCourseCodes.length === 0) {
      return yield* fail(`Could not parse any course codes from: "${text}"`)
    }

    // Parse responded / total
    const span = root.querySelector('.sr-avg span')
    if (!span) {
      return yield* fail('Could not find response count span')
    }

    const match = span.text.match(/(\d+)\s+of\s+(\d+)/)
    if (!match) {
      return yield* fail(`Could not parse response counts from: "${span.text}"`)
    }

    const responded = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)

    // Parse data-ids
    const viewA = root.querySelector('a.sr-view-report')
    if (!viewA) {
      return yield* fail('Could not find view report link')
    }

    const dataIds: [string, string, string, string] = [
      viewA.getAttribute('data-id0') ?? '',
      viewA.getAttribute('data-id1') ?? '',
      viewA.getAttribute('data-id2') ?? '',
      viewA.getAttribute('data-id3') ?? '',
    ]

    // Validate with schema
    const result = EvalInfoSchema.safeDecode({
      sectionCourseCodes,
      quarter,
      year,
      responded,
      total,
      dataIds,
    })

    if (!result.success) {
      return yield* fail(`Invalid EvalInfo structure: ${result.error.message}`)
    }

    return result.data
  })

export const parseListingsResponse = (
  response: unknown,
  year: number,
  quarter: Quarter,
): Effect.Effect<{ hasMore: boolean; entries: Array<EvalInfo> }, ListingsParseError> =>
  Effect.gen(function* () {
    // Validate API response structure
    const parseResult = ListingsResponseSchema.safeParse(response)
    if (!parseResult.success) {
      return yield* Effect.fail(
        new ListingsParseError({
          message: `Invalid API response: ${parseResult.error.message}`,
          year,
          quarter,
        }),
      )
    }

    const data = parseResult.data
    const entries: Array<EvalInfo> = []
    const seenKeys = MutableHashSet.empty<ReturnType<typeof sectionKey>>()

    // Parse each HTML fragment and dedupe by sectionKey (first section of each eval)
    for (const fragment of data.results) {
      const info = yield* parseEvalInfo(fragment, year, quarter)
      const firstScc = info.sectionCourseCodes[0]
      const key = sectionKey(firstScc.subject, firstScc.codeNumber, firstScc.sectionNumber)
      if (MutableHashSet.has(seenKeys, key)) {
        continue
      }
      MutableHashSet.add(seenKeys, key)
      entries.push(info)
    }

    return { hasMore: data.hasMore, entries }
  })
