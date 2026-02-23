export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number
  /** Filter by subject code (e.g., "CS", "MATH") */
  subject?: string
  /** Filter by academic year (e.g., "2023-2024") */
  year?: string
  /** Minimum units */
  minUnits?: number
  /** Maximum units */
  maxUnits?: number
  /** Similarity threshold (0-1, default: 0.0) */
  similarityThreshold?: number
}

export interface CourseSearchResult {
  /** Course offering ID */
  id: number
  /** Course code (e.g., "CS106A") */
  courseCode: string
  /** Course title */
  title: string
  /** Course description (truncated to 200 chars) */
  description: string
  /** Subject code */
  subject: string
  /** Subject long name */
  subjectLongname: string | null
  /** Academic year */
  year: string
  /** Instructor names */
  instructors: string[]
  /** Similarity score (0-1, higher is more similar) */
  similarity: number
  /** Units */
  units: {
    min: number
    max: number
  }
}

export interface SearchStats {
  /** Total courses searched */
  totalSearched: number
  /** Number of results returned */
  resultsReturned: number
  /** Query processing time in ms */
  processingTimeMs: number
}

export interface SearchResponse {
  results: CourseSearchResult[]
  stats: SearchStats
}
