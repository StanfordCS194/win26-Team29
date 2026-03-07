import { pipeline } from '@xenova/transformers'

export class EmbeddingError extends Error {
  cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'EmbeddingError'
    this.cause = cause
  }
}

type PipelineFn = (input: string, options: Record<string, unknown>) => Promise<unknown>
let embeddingModel: PipelineFn | null = null
const embeddingCache = new Map<string, number[]>()

async function loadModel() {
  if (embeddingModel === null) {
    try {
      embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    } catch (error) {
      throw new EmbeddingError('Failed to load embedding model', error)
    }
  }
  return embeddingModel
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const cached = embeddingCache.get(text)
  if (cached) return cached

  try {
    const model = await loadModel()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = (await model(text, { pooling: 'mean', normalize: true } as any)) as any

    const embedding = Array.from(output.data as Float32Array)

    if (embedding.length !== 384) {
      throw new EmbeddingError(`Unexpected embedding dimension: ${embedding.length}, expected 384`)
    }

    embeddingCache.set(text, embedding)
    return embedding
  } catch (error) {
    if (error instanceof EmbeddingError) throw error
    throw new EmbeddingError('Failed to generate query embedding', error)
  }
}

export async function preloadModel(): Promise<void> {
  try {
    await loadModel()
  } catch (error) {
    throw new EmbeddingError('Failed to preload embedding model', error)
  }
}
