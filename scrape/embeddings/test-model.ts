// Quick test script to verify @xenova/transformers works
// Run with: pnpm tsx scrape/embeddings/test-model.ts

import { pipeline } from '@xenova/transformers'

async function testModel() {
  console.log('Loading model...')
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')

  console.log('Generating test embedding...')
  const text = 'Introduction to Computer Science'
  const output = await extractor(text, { pooling: 'mean', normalize: true })

  const embedding = Array.from(output.data as Float32Array) as number[]

  console.log('Model loaded successfully')
  console.log(`Embedding dimensions: ${embedding.length}`)
  console.log(
    `Sample values: [${embedding
      .slice(0, 5)
      .map((n) => n.toFixed(4))
      .join(', ')}...]`,
  )

  // Test with a second embedding to verify consistency
  const text2 = 'Advanced Machine Learning and Artificial Intelligence'
  const output2 = await extractor(text2, { pooling: 'mean', normalize: true })
  const embedding2 = Array.from(output2.data as Float32Array) as number[]

  // Compute cosine similarity
  let dotProduct = 0
  for (let i = 0; i < embedding.length; i++) {
    dotProduct += embedding[i] * embedding2[i]
  }
  console.log(`\nCosine similarity between CS intro and ML course: ${dotProduct.toFixed(4)}`)
  console.log('(Values close to 1.0 = very similar, close to 0 = unrelated)')
}

void testModel()
