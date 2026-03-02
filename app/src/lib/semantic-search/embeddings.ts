import { pipeline } from '@xenova/transformers'
import { EmbeddingError } from './errors'

// Singleton pattern for model - load once, reuse across requests
let embeddingModel: Awaited<ReturnType<typeof pipeline>> | null = null

/**
 * Load the embedding model (cached after first load)
 */
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

/**
 * Generate embedding for a text query
 * @param text - The search query text
 * @returns 384-dimensional embedding vector
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  try {
    const model = await loadModel()

    // Generate embedding with pooling='mean' and normalize=true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = (await model(text, { pooling: 'mean', normalize: true } as any)) as any

    // Convert output to number array
    const embedding = Array.from(output.data as Float32Array)

    // Verify dimension (should be 384 for all-MiniLM-L6-v2)
    if (embedding.length !== 384) {
      throw new EmbeddingError(`Unexpected embedding dimension: ${embedding.length}, expected 384`)
    }

    return embedding
  } catch (error) {
    if (error instanceof EmbeddingError) {
      throw error
    }
    throw new EmbeddingError('Failed to generate query embedding', error)
  }
}

/**
 * Preload the model to avoid cold start on first search
 * Call this during app initialization
 */
export async function preloadModel(): Promise<void> {
  try {
    await loadModel()
  } catch (error) {
    throw new EmbeddingError('Failed to preload embedding model', error)
  }
}
