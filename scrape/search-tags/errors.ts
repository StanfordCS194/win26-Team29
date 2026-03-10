import { Data } from 'effect'

export class GptCallError extends Data.TaggedError('GptCallError')<{
  message: string
  courseOfferingId: number
  cause?: unknown
}> {}

export class ParseError extends Data.TaggedError('ParseError')<{
  message: string
  courseOfferingId: number
  cause?: unknown
  gptResponse?: string
}> {}

export class DatabaseUpdateError extends Data.TaggedError('DatabaseUpdateError')<{
  message: string
  courseOfferingIds: number[]
  cause?: unknown
}> {}

export type SearchTagError = GptCallError | ParseError | DatabaseUpdateError

export function formatSearchTagError(error: SearchTagError): Record<string, unknown> {
  switch (error._tag) {
    case 'GptCallError':
      return {
        type: 'GptCallError',
        courseOfferingId: error.courseOfferingId,
        message: error.message,
        ...(error.cause != null && { cause: formatErrorCause(error.cause) }),
      }
    case 'ParseError':
      return {
        type: 'ParseError',
        courseOfferingId: error.courseOfferingId,
        message: error.message,
        ...(error.cause != null && { cause: formatErrorCause(error.cause) }),
        ...(error.gptResponse != null && { gptResponse: error.gptResponse }),
      }
    case 'DatabaseUpdateError':
      return {
        type: 'DatabaseUpdateError',
        courseOfferingIds: error.courseOfferingIds,
        message: error.message,
        ...(error.cause != null && { cause: formatErrorCause(error.cause) }),
      }
  }
}

export function formatErrorCause(cause: unknown): string {
  if (cause instanceof Error) {
    const parts = [cause.message]
    if (cause.cause != null) parts.push(formatErrorCause(cause.cause))
    return parts.join(' → ')
  }
  if (
    cause != null &&
    typeof cause === 'object' &&
    'message' in cause &&
    typeof (cause as { message: unknown }).message === 'string'
  ) {
    return (cause as { message: string }).message
  }
  return String(cause)
}
