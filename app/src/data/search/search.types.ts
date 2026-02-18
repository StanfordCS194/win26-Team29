import { z } from 'zod'

// --- Input schema ---

export const searchInputSchema = z.object({
  year: z.string().trim().min(1),
  query: z.string().trim(),
})

export type SearchInput = z.infer<typeof searchInputSchema>

// --- Output types ---

export type SearchCourseResult = {
  id: number
  year: string
  subject_code: string
  subject_longname: string | null
  code_number: number
  code_suffix: string | null
  title: string
  description: string
  academic_group: string
  academic_career: string
  academic_organization: string
  gers: string[]
  //sections: MvSection[]
  matched_on: string[]
  score: number
}
