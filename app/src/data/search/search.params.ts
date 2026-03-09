import type { MvSection } from '@courses/db/db-postgres-js'
import { z } from 'zod'

import { EVAL_QUESTION_SLUGS, SLUG_LABEL } from './eval-questions'
import { WeekdaySchema } from '@courses/scrape/shared/schemas'

// --- URL coercion helpers ---
// These handle the raw values that come out of the router's deserializeValue, which
// only does dot-splitting for arrays — all other type coercion is our responsibility.

/** Wraps a plain string in a singleton array; passes arrays through unchanged. */
function coerceToArray(val: unknown): unknown {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') return [val]
  return val
}

/** Converts the strings "true"/"false" to booleans; passes everything else through. */
function coerceBoolString(val: unknown): unknown {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}

// --- Sort options ---

export const SORT_OPTIONS = ['relevance', 'code', 'units', 'num_enrolled', ...EVAL_QUESTION_SLUGS] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevance',
  code: 'Course code',
  units: 'Units',
  num_enrolled: 'Enrollment',
  quality: SLUG_LABEL.quality,
  learning: SLUG_LABEL.learning,
  organized: SLUG_LABEL.organized,
  goals: SLUG_LABEL.goals,
  attend_in_person: SLUG_LABEL.attend_in_person,
  attend_online: SLUG_LABEL.attend_online,
  hours: SLUG_LABEL.hours,
}

export const SORT_DEFAULT_ORDER: Record<SortOption, 'asc' | 'desc'> = {
  relevance: 'desc',
  code: 'asc',
  units: 'desc',
  num_enrolled: 'desc',
  quality: 'desc',
  learning: 'desc',
  organized: 'desc',
  goals: 'desc',
  attend_in_person: 'desc',
  attend_online: 'desc',
  hours: 'asc',
}

// --- Shared constants ---

export type Weekday = z.infer<typeof WeekdaySchema>

export const ALL_WEEKDAYS: Weekday[] = WeekdaySchema.options.filter(
  (d): d is Weekday => d !== 'Saturday' && d !== 'Sunday',
) as Weekday[]

/** Current academic year; boundary is August 25 (e.g. Aug 25, 2026 → "2026-2027"). */
function getCurrentAcademicYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed; August = 7
  const date = now.getDate()
  const onOrAfterAug25 = month > 7 || (month === 7 && date >= 25)
  const startYear = onOrAfterAug25 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

export const DEFAULT_YEAR = getCurrentAcademicYear()

const quarterEnum = z.enum(['Autumn', 'Winter', 'Spring', 'Summer'])
export type Quarter = z.infer<typeof quarterEnum>
export const ALL_QUARTERS: Quarter[] = quarterEnum.options

const includeModeEnum = z.enum(['or', 'and'])
const rangeModeEnum = z.enum(['overlaps_with', 'contained_in'])

// --- Search params schema ---
// Used for both URL validation (TanStack Router) and as the server function input.
// Uses .catch() so invalid URL values silently fall back to defaults rather than erroring.

export const MAX_QUERY_LENGTH = 200

export const searchParamsSchema = z.object({
  query: z
    .preprocess((v) => {
      if (v === undefined || v === null) return undefined

      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
        return String(v)
      }

      return v
    }, z.string().max(MAX_QUERY_LENGTH))
    .catch(''),
  year: z.string().catch(DEFAULT_YEAR),

  // Quarters set filter
  quarters: z.preprocess(coerceToArray, z.array(quarterEnum)).catch([]),
  quartersExclude: z.preprocess(coerceToArray, z.array(quarterEnum)).catch([]),
  quartersIncludeMode: includeModeEnum.catch('or'),

  // Subject set filter
  subjects: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  subjectsExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  subjectsIncludeMode: includeModeEnum.catch('or'),
  subjectsWithCrosslistings: z.preprocess(coerceBoolString, z.boolean().optional()).catch(undefined),

  // GER set filter
  gers: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  gersExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  gersIncludeMode: includeModeEnum.catch('or'),

  // Days set filter
  days: z.preprocess(coerceToArray, z.array(WeekdaySchema).optional()).catch(undefined),
  daysExclude: z.preprocess(coerceToArray, z.array(WeekdaySchema).optional()).catch(undefined),
  daysIncludeMode: includeModeEnum.catch('or'),

  sort: z.enum(SORT_OPTIONS).catch('relevance'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).catch(1),

  // Units range — mode is meaningful because courses store units_min AND units_max
  unitsMin: z.coerce.number().int().optional().catch(undefined),
  unitsMax: z.coerce.number().int().optional().catch(undefined),
  unitsMode: rangeModeEnum.catch('overlaps_with'),

  // Course code number range (single integer in DB — no mode)
  codeNumberMin: z.coerce.number().int().optional().catch(undefined),
  codeNumberMax: z.coerce.number().int().optional().catch(undefined),

  // Career set filter
  careers: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  careersExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),

  // Grading option set filter
  gradingOptions: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  gradingOptionsExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),

  // Final exam set filter
  finalExamFlags: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  finalExamFlagsExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),

  // Course metadata filters
  repeatable: z.preprocess(coerceBoolString, z.boolean().optional()).catch(undefined),

  // GER count range (single integer — no mode)
  numGersMin: z.coerce.number().int().optional().catch(undefined),
  numGersMax: z.coerce.number().int().optional().catch(undefined),

  // Subject count range (always across crosslistings — no mode)
  numSubjectsMin: z.coerce.number().int().optional().catch(undefined),
  numSubjectsMax: z.coerce.number().int().optional().catch(undefined),

  // Quarter count range (0–4)
  numQuartersMin: z.coerce.number().int().optional().catch(undefined),
  numQuartersMax: z.coerce.number().int().optional().catch(undefined),

  // Meeting days count range (distinct weekdays across schedules — 0–5)
  numMeetingDaysMin: z.coerce.number().int().optional().catch(undefined),
  numMeetingDaysMax: z.coerce.number().int().optional().catch(undefined),

  // Section-level filters
  componentTypes: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  componentTypesExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),

  // Enrollment filters
  numEnrolledMin: z.coerce.number().int().optional().catch(undefined),
  numEnrolledMax: z.coerce.number().int().optional().catch(undefined),

  maxEnrolledMin: z.coerce.number().int().optional().catch(undefined),
  maxEnrolledMax: z.coerce.number().int().optional().catch(undefined),

  enrollmentStatus: z
    .preprocess(coerceToArray, z.array(z.enum(['space_available', 'waitlist_only', 'full'])).optional())
    .catch(undefined),

  instructorSunets: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  instructorSunetsExclude: z.preprocess(coerceToArray, z.array(z.string().min(1))).catch([]),
  instructorSunetsIncludeMode: includeModeEnum.catch('or'),

  // Class duration (single computed value — no mode)
  classDurationMin: z.coerce.number().optional().catch(undefined),
  classDurationMax: z.coerce.number().optional().catch(undefined),

  // Class time window (ISO time string "HH:MM:SS") — startTimeMin filters start_time, endTimeMax filters end_time
  startTimeMin: z.string().optional().catch(undefined),
  endTimeMax: z.string().optional().catch(undefined),

  // Eval filters (flat per-slug min/max)
  min_eval_quality: z.coerce.number().optional().catch(undefined),
  max_eval_quality: z.coerce.number().optional().catch(undefined),
  min_eval_learning: z.coerce.number().optional().catch(undefined),
  max_eval_learning: z.coerce.number().optional().catch(undefined),
  min_eval_organized: z.coerce.number().optional().catch(undefined),
  max_eval_organized: z.coerce.number().optional().catch(undefined),
  min_eval_goals: z.coerce.number().optional().catch(undefined),
  max_eval_goals: z.coerce.number().optional().catch(undefined),
  min_eval_attend_in_person: z.coerce.number().optional().catch(undefined),
  max_eval_attend_in_person: z.coerce.number().optional().catch(undefined),
  min_eval_attend_online: z.coerce.number().optional().catch(undefined),
  max_eval_attend_online: z.coerce.number().optional().catch(undefined),
  min_eval_hours: z.coerce.number().optional().catch(undefined),
  max_eval_hours: z.coerce.number().optional().catch(undefined),

  dedupeCrosslistings: z.preprocess(coerceBoolString, z.boolean().optional()).catch(undefined),

  advancedMode: z.preprocess(coerceBoolString, z.boolean().optional()).catch(undefined),
})

export type SearchParams = z.infer<typeof searchParamsSchema>
export type RangeMode = z.infer<typeof rangeModeEnum>
export type IncludeMode = z.infer<typeof includeModeEnum>

// Default values used with TanStack Router's stripSearchParams middleware.
// Keys whose values match these are removed from the URL, keeping it clean.
export const SEARCH_DEFAULTS = {
  query: '',
  year: DEFAULT_YEAR,
  quarters: [],
  quartersExclude: [],
  quartersIncludeMode: 'or',
  subjects: [],
  subjectsExclude: [],
  subjectsIncludeMode: 'or',
  gers: [],
  gersExclude: [],
  gersIncludeMode: 'or',
  careers: [],
  careersExclude: [],
  gradingOptions: [],
  gradingOptionsExclude: [],
  finalExamFlags: [],
  finalExamFlagsExclude: [],
  componentTypes: [],
  componentTypesExclude: [],
  instructorSunets: [],
  instructorSunetsExclude: [],
  instructorSunetsIncludeMode: 'or',
  daysIncludeMode: 'or',
  sort: 'relevance',
  order: 'desc',
  page: 1,
  unitsMode: 'overlaps_with',
} as const

// --- Output types ---

export type SearchCourseResult = {
  id: number
  year: string
  subject_code: string
  code_number: number
  code_suffix: string | null
  title: string
  description: string
  academic_group: string
  academic_career: string
  academic_organization: string
  grading_option: string
  final_exam_flag: string
  units_min: number
  units_max: number
  gers: string[]
  sections: MvSection[]
  instructorQualityBySunet?: Record<string, number>
}

export type SearchResultSections = SearchCourseResult['sections']

export type SearchCourseResultStub = {
  id: number
  year: string
  subject_code: string
  code_number: number
  code_suffix: string | null
  _stub: true
}

export type SearchQueryResult = Omit<SearchCourseResult, 'sections'> & { sections: MvSection[] | null }
