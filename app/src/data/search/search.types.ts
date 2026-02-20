import type { MvSection } from '@courses/db/db-bun'
import { z } from 'zod'

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

// --- Route search params schema (Zod v4 Standard Schema — no adapter needed) ---

export const coursesSearchSchema = z.object({
  query: z.string().default(''),
  year: z.string().default(DEFAULT_YEAR),
  quarters: quartersSearchParam,
  ways: waysSearchParam,
  unitsMin: optionalIntParam,
  unitsMax: optionalIntParam,
})

export type CoursesSearch = z.infer<typeof coursesSearchSchema>

// --- Server function input schema ---

export const searchInputSchema = z.object({
  year: z.string().trim().min(1),
  query: z.string().trim(),
  quarters: z.array(quarterEnum),
  ways: z.array(waysEnum),
  unitsMin: z.number().int().optional(),
  unitsMax: z.number().int().optional(),
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
