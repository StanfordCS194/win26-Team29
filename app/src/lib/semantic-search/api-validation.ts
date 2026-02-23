import type { SearchOptions } from './types'
import { ValidationError } from './errors'

export interface ParsedSearchParams {
  query: string
  options: SearchOptions
}

/**
 * Parse and validate search parameters from URL search params
 */
export function parseSearchParams(searchParams: URLSearchParams): ParsedSearchParams {
  // Extract query
  const query = searchParams.get('q')
  if (query === null || query.trim().length === 0) {
    throw new ValidationError('Search query (q) is required')
  }

  // Extract and validate options
  const options: SearchOptions = {}

  // limit
  const limitStr = searchParams.get('limit')
  if (limitStr !== null) {
    const limit = parseInt(limitStr, 10)
    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }
    options.limit = limit
  }

  // subject
  const subject = searchParams.get('subject')
  if (subject !== null) {
    options.subject = subject.toUpperCase().trim()
  }

  // year
  const year = searchParams.get('year')
  if (year !== null) {
    if (!/^\d{4}-\d{4}$/.test(year)) {
      throw new ValidationError('Year must be in format YYYY-YYYY')
    }
    options.year = year
  }

  // minUnits
  const minUnitsStr = searchParams.get('minUnits')
  if (minUnitsStr !== null) {
    const minUnits = parseInt(minUnitsStr, 10)
    if (isNaN(minUnits) || minUnits < 0) {
      throw new ValidationError('minUnits must be non-negative')
    }
    options.minUnits = minUnits
  }

  // maxUnits
  const maxUnitsStr = searchParams.get('maxUnits')
  if (maxUnitsStr !== null) {
    const maxUnits = parseInt(maxUnitsStr, 10)
    if (isNaN(maxUnits) || maxUnits < 0) {
      throw new ValidationError('maxUnits must be non-negative')
    }
    options.maxUnits = maxUnits
  }

  // Validate min <= max
  if (
    options.minUnits !== undefined &&
    options.maxUnits !== undefined &&
    options.minUnits > options.maxUnits
  ) {
    throw new ValidationError('minUnits cannot be greater than maxUnits')
  }

  // similarityThreshold
  const thresholdStr = searchParams.get('similarityThreshold')
  if (thresholdStr !== null) {
    const threshold = parseFloat(thresholdStr)
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      throw new ValidationError('similarityThreshold must be between 0 and 1')
    }
    options.similarityThreshold = threshold
  }

  return { query, options }
}
