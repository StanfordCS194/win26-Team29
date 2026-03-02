export interface SearchQuery {
  q: string
  subject?: string
  year?: string
  minUnits?: number
  maxUnits?: number
  limit?: number
}

export interface CourseResult {
  id: number
  courseCode: string
  title: string
  description: string
  subject: string
  subjectLongname: string | null
  year: string
  instructors: string[]
  similarity: number
  units: {
    min: number
    max: number
  }
}

export interface SearchResponse {
  success: boolean
  data?: {
    results: CourseResult[]
    stats: {
      totalSearched: number
      resultsReturned: number
      processingTimeMs: number
    }
    query: {
      text: string
      filters: Record<string, unknown>
    }
  }
  error?: {
    message: string
    code: string
  }
}
