import { Link, createFileRoute } from '@tanstack/react-router'
import { useSemanticSearch } from '@/hooks/useSemanticSearch'
import { useState, type FormEvent } from 'react'
import type { SearchQuery, CourseResult } from '@/types/search'

// Add search validation schema
export const Route = createFileRoute('/results')({
  component: ResultsPage,
  validateSearch: (search): SearchQuery => ({
    q: (search.q as string) || '',
    subject: search.subject as string | undefined,
    year: search.year as string | undefined,
    minUnits: search.minUnits !== undefined ? Number(search.minUnits) : undefined,
    maxUnits: search.maxUnits !== undefined ? Number(search.maxUnits) : undefined,
    limit: search.limit !== undefined ? Number(search.limit) : undefined,
  }),
})

function ResultsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [searchInput, setSearchInput] = useState(search.q || '')

  // Fetch results using the hook
  const { data, isLoading, isError, error } = useSemanticSearch(search.q ? search : null)

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      void navigate({
        search: { ...search, q: searchInput.trim() },
      })
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-16">
          <SearchBox value={searchInput} onChange={setSearchInput} onSubmit={handleSearch} />

          {/* Loading skeletons */}
          <div className="flex flex-col gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-2 h-6 w-24 rounded bg-slate-200" />
                <div className="mb-1 h-5 w-3/4 rounded bg-slate-200" />
                <div className="mb-4 h-4 w-1/4 rounded bg-slate-200" />
                <div className="h-16 w-full rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-16">
          <SearchBox value={searchInput} onChange={setSearchInput} onSubmit={handleSearch} />

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-red-900">Search Error</h2>
            <p className="text-red-700">
              {error?.message || 'Failed to load search results. Please try again.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // No results
  if (data?.success === true && data.data?.results.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-16">
          <SearchBox value={searchInput} onChange={setSearchInput} onSubmit={handleSearch} />

          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-lg text-slate-600">No courses found for "{search.q}"</p>
            <p className="mt-2 text-sm text-slate-500">Try different keywords or remove filters</p>
          </div>
        </div>
      </div>
    )
  }

  // Success - display results
  const results = data?.data?.results || []

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-16">
        <SearchBox value={searchInput} onChange={setSearchInput} onSubmit={handleSearch} />

        {/* Results stats */}
        {data?.data?.stats && (
          <div className="text-sm text-slate-600">
            Found {data.data.stats.resultsReturned} courses in {data.data.stats.processingTimeMs}
            ms
          </div>
        )}

        {/* Results list */}
        <div className="flex flex-col gap-4">
          {results.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Extracted components for clarity
function SearchBox({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label htmlFor="results-search" className="sr-only">
        Search courses
      </label>
      <div className="relative">
        <input
          id="results-search"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by course, instructor, or keyword"
          className="w-full rounded-full border border-slate-300 bg-white py-3 pr-14 pl-5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
        >
          Go
        </button>
      </div>
    </form>
  )
}

function CourseCard({ course }: { course: CourseResult }) {
  return (
    <Link
      to="/course/$courseId"
      params={{ courseId: course.courseCode }}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      <article>
        <div className="flex items-start justify-between gap-4">
          <p className="text-2xl font-normal tracking-[0.15em] text-slate-900">{course.courseCode}</p>
          <div className="flex items-center gap-2">
            {/* Similarity indicator */}
            <span
              className="rounded-full px-2.5 py-1 text-xs font-normal"
              style={{
                backgroundColor: getSimilarityColor(course.similarity),
                color: course.similarity > 0.7 ? 'white' : 'inherit',
              }}
            >
              {(course.similarity * 100).toFixed(0)}% match
            </span>
          </div>
        </div>
        <h2 className="mt-2 text-xl font-normal text-slate-800">{course.title}</h2>
        {course.instructors.length > 0 && (
          <p className="mt-1 text-sm text-slate-500">{course.instructors.join(', ')}</p>
        )}
        <p className="mt-4 text-base leading-relaxed text-slate-600">{course.description}</p>
        <div className="mt-3 flex gap-2 text-xs text-slate-500">
          <span>{course.subject}</span>
          <span>•</span>
          <span>
            {course.units.min}-{course.units.max} units
          </span>
          <span>•</span>
          <span>{course.year}</span>
        </div>
      </article>
    </Link>
  )
}

// Helper to get color based on similarity score
function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.8) return '#10b981' // green-500
  if (similarity >= 0.6) return '#f59e0b' // amber-500
  return '#64748b' // slate-500
}
