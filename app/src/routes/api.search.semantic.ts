import { createFileRoute } from '@tanstack/react-router'
import { createDb } from '@/lib/db'
import { searchCourses, preloadModel } from '@/lib/semantic-search'
import { parseSearchParams } from '@/lib/semantic-search/api-validation'
import { buildSuccessResponse, buildErrorResponse } from '@/lib/semantic-search/api-response'

// Preload the embedding model on server startup
preloadModel().catch((err: unknown) => {
  console.error('Failed to preload embedding model:', err)
})

export const Route = createFileRoute('/api/search/semantic')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)

          // Validate and parse parameters
          const { query, options } = parseSearchParams(url.searchParams)

          // Create database connection
          const db = createDb(process.env.DATABASE_URL!)

          try {
            // Perform search
            const searchResponse = await searchCourses(db, query, options)

            // Build success response
            const response = buildSuccessResponse(searchResponse, query, options)

            return new Response(JSON.stringify(response), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
              },
            })
          } finally {
            await db.destroy()
          }
        } catch (error) {
          console.error('Search API error:', error)

          const { response, status } = buildErrorResponse(error as Error)

          return new Response(JSON.stringify(response), {
            status,
            headers: {
              'Content-Type': 'application/json',
            },
          })
        }
      },
    },
  },
})
