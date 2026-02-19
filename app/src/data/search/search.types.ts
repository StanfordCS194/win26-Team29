import type { MvSection } from '@courses/db/db-bun'
import { z } from 'zod'

// --- Shared constants ---

export const quarterEnum = z.enum(['Autumn', 'Winter', 'Spring', 'Summer'])
export type Quarter = z.infer<typeof quarterEnum>
export const ALL_QUARTERS: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

const DEFAULT_YEAR = '2025-2026'

// --- Route search params schema (Zod v4 Standard Schema — no adapter needed) ---

export const coursesSearchSchema = z.object({
  query: z.string().default(''),
  year: z.string().default(DEFAULT_YEAR),
  quarters: z.array(quarterEnum).default(ALL_QUARTERS),
})

export type CoursesSearch = z.infer<typeof coursesSearchSchema>

// --- Server function input schema ---

export const searchInputSchema = z.object({
  year: z.string().trim().min(1),
  query: z.string().trim(),
  quarters: z.array(quarterEnum),
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
  gers: string[]
  sections: MvSection[]
  matched_on: string[]
}

export type SearchResultSections = SearchCourseResult['sections']
