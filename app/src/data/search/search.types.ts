import type { MvSection } from '@courses/db/db-bun'
import { z } from 'zod'

import { EVAL_QUESTION_SLUGS, SLUG_LABEL } from './eval-questions'

import type { EvalSlug } from './eval-questions'

// --- Sort options ---

export const SORT_OPTIONS = ['relevance', 'code', 'units', ...EVAL_QUESTION_SLUGS] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevance',
  code: 'Course code',
  units: 'Units',
  rating: SLUG_LABEL.rating,
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
  rating: 'desc',
  learning: 'desc',
  organized: 'desc',
  goals: 'desc',
  attend_in_person: 'desc',
  attend_online: 'desc',
  hours: 'asc',
}

// --- Shared constants ---

export const quarterEnum = z.enum(['Autumn', 'Winter', 'Spring', 'Summer'])
export type Quarter = z.infer<typeof quarterEnum>
export const ALL_QUARTERS: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

/** Ways (GER) filter options shown in the UI; only these are offered as filters. */
export const WAYS_OPTIONS = [
  'WAY-AQR',
  'WAY-SMA',
  'WAY-A-II',
  'WAY-EDP',
  'WAY-CE',
  'WAY-SI',
  'WAY-ER',
  'WAY-FR',
] as const
export const waysEnum = z.enum(WAYS_OPTIONS)
export type Way = z.infer<typeof waysEnum>

const DEFAULT_YEAR = '2025-2026'

/** Normalize ways from URL (may be string when single value or comma-separated) to array. */
const waysSearchParam = z.preprocess(
  (val) => (Array.isArray(val) ? val : typeof val === 'string' ? (val === '' ? [] : val.split(',')) : []),
  z.array(waysEnum).default([]),
)

/** Normalize quarters from URL (may be string when single value or comma-separated) to array. */
const quartersSearchParam = z.preprocess(
  (val) => (Array.isArray(val) ? val : typeof val === 'string' ? (val === '' ? [] : val.split(',')) : []),
  z.array(quarterEnum).default(ALL_QUARTERS),
)

/** Optional integer from URL (string or number). */
const optionalIntParam = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined
  const n = Number(val)
  return Number.isInteger(n) ? n : undefined
}, z.number().int().optional())

/** Optional float from URL (string or number). */
const optionalNumParam = z.preprocess(
  (val) => (val === undefined || val === null || val === '' ? undefined : Number(val)),
  z.number().optional(),
)

// --- Route search params schema (Zod v4 Standard Schema — no adapter needed) ---

export const coursesSearchSchema = z.object({
  query: z.string().default(''),
  year: z.string().default(DEFAULT_YEAR),
  quarters: quartersSearchParam,
  ways: waysSearchParam,
  unitsMin: optionalIntParam,
  unitsMax: optionalIntParam,
  sort: z.enum(SORT_OPTIONS).default('relevance'),
  order: z.enum(['asc', 'desc']).default('desc'),
  min_eval_rating: optionalNumParam,
  max_eval_rating: optionalNumParam,
  min_eval_learning: optionalNumParam,
  max_eval_learning: optionalNumParam,
  min_eval_organized: optionalNumParam,
  max_eval_organized: optionalNumParam,
  min_eval_goals: optionalNumParam,
  max_eval_goals: optionalNumParam,
  min_eval_attend_in_person: optionalNumParam,
  max_eval_attend_in_person: optionalNumParam,
  min_eval_attend_online: optionalNumParam,
  max_eval_attend_online: optionalNumParam,
  min_eval_hours: optionalNumParam,
  max_eval_hours: optionalNumParam,
  page: z.coerce.number().int().min(1).default(1),
})

export type CoursesSearch = z.infer<typeof coursesSearchSchema>

// --- Server function input schema ---

const evalSlugEnum = z.enum(EVAL_QUESTION_SLUGS)

export const searchInputSchema = z.object({
  year: z.string().trim().min(1),
  query: z.string().trim(),
  quarters: z.array(quarterEnum),
  ways: z.array(waysEnum),
  unitsMin: z.number().int().optional(),
  unitsMax: z.number().int().optional(),
  sort: z.enum(SORT_OPTIONS).default('relevance'),
  order: z.enum(['asc', 'desc']).default('desc'),
  evalFilters: z
    .array(
      z.object({
        slug: evalSlugEnum,
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    )
    .default([]),
  page: z.number().int().min(1).default(1),
})

export type SearchInput = z.infer<typeof searchInputSchema>

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
  units_min: number
  units_max: number
  gers: string[]
  sections: MvSection[]
  matched_on: string[]
}

export type SearchResultSections = SearchCourseResult['sections']

/** Extract eval filters from parsed URL search params (slug-based, no ID resolution). */
export function extractEvalFilters(search: CoursesSearch) {
  const filters: Array<{ slug: EvalSlug; min?: number; max?: number }> = []
  for (const slug of EVAL_QUESTION_SLUGS) {
    const min = search[`min_eval_${slug}` as keyof CoursesSearch] as number | undefined
    const max = search[`max_eval_${slug}` as keyof CoursesSearch] as number | undefined
    if (min == null && max == null) continue
    filters.push({ slug, min, max })
  }
  return filters
}
