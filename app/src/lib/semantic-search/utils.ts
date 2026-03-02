import type { SearchOptions } from './types'
import { ValidationError } from './errors'

/**
 * Validate search query
 * @throws ValidationError if query is invalid
 */
export function validateSearchQuery(query: string): void {
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query cannot be empty')
  }

  if (query.length > 500) {
    throw new ValidationError('Search query too long (max 500 characters)')
  }
}

/**
 * Validate search options
 * @throws ValidationError if options are invalid
 */
export function validateSearchOptions(options: SearchOptions): void {
  if (options.limit !== undefined && (options.limit < 1 || options.limit > 100)) {
    throw new ValidationError('Limit must be between 1 and 100')
  }

  if (options.minUnits !== undefined && options.minUnits < 0) {
    throw new ValidationError('minUnits must be non-negative')
  }

  if (options.maxUnits !== undefined && options.maxUnits < 0) {
    throw new ValidationError('maxUnits must be non-negative')
  }

  if (
    options.minUnits !== undefined &&
    options.maxUnits !== undefined &&
    options.minUnits > options.maxUnits
  ) {
    throw new ValidationError('minUnits cannot be greater than maxUnits')
  }

  if (
    options.similarityThreshold !== undefined &&
    (options.similarityThreshold < 0 || options.similarityThreshold > 1)
  ) {
    throw new ValidationError('similarityThreshold must be between 0 and 1')
  }
}

/**
 * Normalize search query for better matching
 */
export function normalizeQuery(query: string): string {
  return (
    query
      .trim()
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
  )
}
