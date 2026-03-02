// Main search function
export { searchCourses } from './search'

// Types
export type { SearchOptions, CourseSearchResult, SearchStats, SearchResponse } from './types'

// Utilities
export { validateSearchQuery, validateSearchOptions, normalizeQuery } from './utils'

// Errors
export { SearchError, EmbeddingError, QueryError, ValidationError } from './errors'

// Model preloading (for app initialization)
export { preloadModel } from './embeddings'

// API helpers
export { parseSearchParams } from './api-validation'
export { buildSuccessResponse, buildErrorResponse } from './api-response'
export type { APIResponse, SuccessResponse, ErrorResponse } from './api-response'
