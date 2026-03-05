import { z } from 'zod'
import { Temporal } from '@js-temporal/polyfill'
import { QuarterSchema, WeekdaySchema } from '@courses/scrape/shared/schemas'

/* ──────────────────────────────────────────
   Utilities
────────────────────────────────────────── */

type Comparator<T> = (a: T, b: T) => boolean

const optionalTrimmedString = z.preprocess((val) => {
  if (typeof val !== 'string') return undefined
  const trimmed = val.trim()
  return trimmed.length === 0 ? undefined : trimmed
}, z.string().optional())

const optionalIntArray = z.preprocess((val) => {
  if (!Array.isArray(val) || val.length === 0) return undefined
  return val
}, z.array(z.int()).optional())

function createRangeFilter<T>(valueSchema: z.ZodType<T>, isValidRange: Comparator<T>) {
  const base = z
    .object({
      min: valueSchema.optional(),
      max: valueSchema.optional(),
      mode: z.enum(['contained_in', 'overlaps_with']).default('overlaps_with'),
    })
    .superRefine((v, ctx) => {
      if (v.min !== undefined && v.max !== undefined) {
        if (!isValidRange(v.min, v.max)) {
          ctx.addIssue({
            code: 'custom',
            message: 'min must be <= max',
            path: ['min'],
          })
        }
      }
    })

  return z.preprocess((val) => {
    if (val == null || typeof val !== 'object') return undefined
    const v = val as Record<string, unknown>
    if (v.min === undefined && v.max === undefined) return undefined
    return v
  }, base.optional())
}

/** Range filter for fields stored as a single value in the DB (not a range).
 *  No `mode` field — overlaps_with and contained_in are identical for point values. */
function createPointRangeFilter<T>(valueSchema: z.ZodType<T>, isValidRange: Comparator<T>) {
  const base = z
    .object({
      min: valueSchema.optional(),
      max: valueSchema.optional(),
    })
    .superRefine((v, ctx) => {
      if (v.min !== undefined && v.max !== undefined) {
        if (!isValidRange(v.min, v.max)) {
          ctx.addIssue({
            code: 'custom',
            message: 'min must be <= max',
            path: ['min'],
          })
        }
      }
    })

  return z.preprocess((val) => {
    if (val == null || typeof val !== 'object') return undefined
    const v = val as Record<string, unknown>
    if (v.min === undefined && v.max === undefined) return undefined
    return v
  }, base.optional())
}

const setFilter = <T extends z.ZodTypeAny>(item: T) => {
  const base = z.object({
    include: z.array(item).min(1).optional(),
    exclude: z.array(item).min(1).optional(),
    includeMode: z.enum(['or', 'and']).default('or'),
  })

  return z.preprocess((val) => {
    if (val == null || typeof val !== 'object') return undefined
    const v = val as Record<string, unknown>

    const includeEmpty = v.include === undefined || (Array.isArray(v.include) && v.include.length === 0)

    const excludeEmpty = v.exclude === undefined || (Array.isArray(v.exclude) && v.exclude.length === 0)

    if (includeEmpty && excludeEmpty) return undefined
    return v
  }, base.optional())
}

/* ──────────────────────────────────────────
   Range Filters
────────────────────────────────────────── */

/** For DB-side range columns (e.g. units_min / units_max). Mode is meaningful. */
export const intRangeFilter = createRangeFilter(z.int(), (a, b) => a <= b)
export const numberRangeFilter = createRangeFilter(z.number(), (a, b) => a <= b)

/** For single DB-column comparisons. No mode — overlaps_with ≡ contained_in. */
export const pointIntRangeFilter = createPointRangeFilter(z.int(), (a, b) => a <= b)
export const pointNumberRangeFilter = createPointRangeFilter(z.number(), (a, b) => a <= b)

const plainTimeSchema = z.custom<Temporal.PlainTime>(
  (val) => val instanceof Temporal.PlainTime,
  'Expected Temporal.PlainTime',
)

export const pointTimeRangeFilter = createPointRangeFilter(
  plainTimeSchema,
  (a, b) => Temporal.PlainTime.compare(a, b) <= 0,
)

/* ──────────────────────────────────────────
   Eval Question Slugs (enum-style)
────────────────────────────────────────── */

export const EvalQuestionSlugEnum = z.enum([
  'quality',
  'hours',
  'learning',
  'organized',
  'goals',
  'attend_in_person',
  'attend_online',
])

export type EvalQuestionSlug = z.infer<typeof EvalQuestionSlugEnum>

// Keep this if you still need the array elsewhere
export const EVAL_QUESTION_SLUGS = EvalQuestionSlugEnum.options

/* ──────────────────────────────────────────
   Evaluation Range Filters (nested under one key)
────────────────────────────────────────── */

const evalFiltersSchema = z.preprocess((val) => {
  if (val == null || typeof val !== 'object') return undefined
  // Strip out keys that are undefined/empty
  const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== undefined)
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}, z.record(EvalQuestionSlugEnum, pointNumberRangeFilter).optional())

export const SORT_OPTIONS = ['relevance', 'code', 'units', 'num_enrolled', ...EVAL_QUESTION_SLUGS] as const

const sortSchema = z.object({
  by: z.enum(SORT_OPTIONS),
  direction: z.enum(['asc', 'desc']),
})

const defaultSort = { by: 'relevance', direction: 'desc' } as const

/* ──────────────────────────────────────────
   Subject and Code Filters
────────────────────────────────────────── */

const subjectSetFilter = z.preprocess(
  (val) => {
    if (val == null || typeof val !== 'object') return undefined
    const v = val as Record<string, unknown>
    const includeEmpty = !Array.isArray(v.include) || v.include.length === 0
    const excludeEmpty = !Array.isArray(v.exclude) || v.exclude.length === 0
    if (includeEmpty && excludeEmpty) return undefined
    return v
  },
  z
    .object({
      include: z.array(z.string().trim().min(1)).min(1).optional(),
      exclude: z.array(z.string().trim().min(1)).min(1).optional(),
      includeMode: z.enum(['or', 'and']).default('or'),
      withCrosslistings: z.boolean().default(true),
    })
    .optional(),
)

const codeSchema = z.preprocess(
  (val) => {
    if (!Array.isArray(val) || val.length === 0) {
      return undefined
    }

    return val.map((item) => {
      if (item == null || typeof item !== 'object') return item

      const obj = item as Record<string, unknown>
      const rawSuffix = obj.code_suffix
      const trimmedSuffix = typeof rawSuffix === 'string' ? rawSuffix.trim() : undefined
      return {
        ...obj,
        code_suffix: trimmedSuffix !== undefined && trimmedSuffix.length > 0 ? trimmedSuffix : undefined,
      }
    })
  },
  z
    .array(
      z.object({
        subject: z.string().trim().min(1).optional(),
        code_number: z.int(),
        code_suffix: z.string().optional(),
      }),
    )
    .optional(),
)

/* ──────────────────────────────────────────
   Main Search Schema
────────────────────────────────────────── */

export const dbQuerySchema = z.object({
  year: z.string().trim().min(1),

  code: codeSchema,

  query: optionalTrimmedString,

  querySubjects: z.array(z.string().trim().min(1)).optional(),

  subjects: subjectSetFilter.optional(),
  numSubjects: pointIntRangeFilter.optional(),
  numQuarters: pointIntRangeFilter.optional(),
  numMeetingDays: pointIntRangeFilter.optional(),
  codeNumberRange: pointIntRangeFilter.optional(),
  repeatable: z.boolean().optional(),
  gradingOptionId: optionalIntArray,
  gradingOptionIdExclude: optionalIntArray,
  units: intRangeFilter.optional(),
  academicCareerId: optionalIntArray,
  academicCareerIdExclude: optionalIntArray,
  finalExamFlagId: optionalIntArray,
  finalExamFlagIdExclude: optionalIntArray,
  gers: setFilter(z.string()).optional(),
  numGers: pointIntRangeFilter.optional(),

  quarters: setFilter(QuarterSchema).optional(),

  componentTypeId: setFilter(z.int()).optional(),
  numEnrolled: pointIntRangeFilter.optional(),
  maxEnrolled: pointIntRangeFilter.optional(),
  enrollmentStatus: z.array(z.enum(['space_available', 'waitlist_only', 'full'])).optional(),
  instructorSunets: setFilter(z.string()).optional(),

  days: setFilter(WeekdaySchema).optional(),
  startTime: pointTimeRangeFilter.optional(),
  classDuration: pointNumberRangeFilter.optional(),

  evalFilters: evalFiltersSchema,

  sort: sortSchema.default(defaultSort),
  page: z.int().min(1).default(1),
  dedupeCrosslistings: z.boolean().default(true),
})
