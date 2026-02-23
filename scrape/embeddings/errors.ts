import { Data } from 'effect'

export class EmbeddingGenerationError extends Data.TaggedError('EmbeddingGenerationError')<{
  message: string
  courseId: number
  courseCode: string
  cause?: unknown
}> {}

export class DatabaseUpdateError extends Data.TaggedError('DatabaseUpdateError')<{
  message: string
  courseIds: number[]
  cause?: unknown
}> {}

export class ModelLoadError extends Data.TaggedError('ModelLoadError')<{
  message: string
  modelName: string
  cause?: unknown
}> {}
