import type { SearchResponse, SearchOptions } from './types'
import { SearchError, ValidationError } from './errors'

export interface SuccessResponse {
  success: true
  data: {
    results: SearchResponse['results']
    stats: SearchResponse['stats']
    query: {
      text: string
      filters: SearchOptions
    }
  }
}

export interface ErrorResponse {
  success: false
  error: {
    message: string
    code: string
  }
}

export type APIResponse = SuccessResponse | ErrorResponse

/**
 * Build success response
 */
export function buildSuccessResponse(
  searchResponse: SearchResponse,
  query: string,
  filters: SearchOptions,
): SuccessResponse {
  return {
    success: true,
    data: {
      results: searchResponse.results,
      stats: searchResponse.stats,
      query: {
        text: query,
        filters,
      },
    },
  }
}

/**
 * Build error response with appropriate HTTP status code
 */
export function buildErrorResponse(error: Error): {
  response: ErrorResponse
  status: number
} {
  if (error instanceof ValidationError) {
    return {
      response: {
        success: false,
        error: {
          message: error.message,
          code: error.code,
        },
      },
      status: 400,
    }
  }

  if (error instanceof SearchError) {
    return {
      response: {
        success: false,
        error: {
          message: 'Search failed',
          code: error.code,
        },
      },
      status: 500,
    }
  }

  return {
    response: {
      success: false,
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
    },
    status: 500,
  }
}
