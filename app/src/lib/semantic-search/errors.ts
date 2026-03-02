export class SearchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'SearchError'
  }
}

export class EmbeddingError extends SearchError {
  constructor(message: string, details?: unknown) {
    super(message, 'EMBEDDING_ERROR', details)
    this.name = 'EmbeddingError'
  }
}

export class QueryError extends SearchError {
  constructor(message: string, details?: unknown) {
    super(message, 'QUERY_ERROR', details)
    this.name = 'QueryError'
  }
}

export class ValidationError extends SearchError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}
