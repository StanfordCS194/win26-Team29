// routes/results.tsx
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { z } from 'zod'

import { searchCourses } from '@/data/search/search'
import type { SearchCourseResult } from '@/data/search/search.types'

const DEFAULT_YEAR = '2022-2023'

const resultsSearchSchema = z.object({
  query: z.string().optional(),
  year: z.string().optional(),
})

const searchQueryOptions = (query: string, year: string) => {
  console.log('[searchQueryOptions] creating options with query:', query, 'year:', year)
  return {
    queryKey: ['search', query, year] as const,
    queryFn: () => {
      console.log('[searchQueryOptions.queryFn] calling searchCourses with:', { query, year })
      return searchCourses({ data: { query, year } })
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  }
}

export const Route = createFileRoute('/results')({
  validateSearch: (search) => {
    console.log('[Route.validateSearch] raw search:', search)
    const parsed = resultsSearchSchema.parse(search)
    console.log('[Route.validateSearch] parsed search:', parsed)
    return parsed
  },
  loaderDeps: ({ search }) => {
    const deps = {
      query: search.query ?? '',
      year: search.year ?? DEFAULT_YEAR,
    }
    console.log('[Route.loaderDeps] search:', search, '-> deps:', deps)
    return deps
  },
  loader: ({ deps, context }) => {
    console.log('[Route.loader] deps:', deps)
    console.log('[Route.loader] calling ensureQueryData with query:', deps.query, 'year:', deps.year)
    return context.queryClient.ensureQueryData(searchQueryOptions(deps.query, deps.year))
  },
  component: ResultsPage,
})

function ResultsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-16">
        <SearchControls />
        <SearchResults />
      </div>
    </div>
  )
}

function SearchControls() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [showFilters, setShowFilters] = useState(false)

  console.log('[SearchControls] current search params:', search)

  const submitSearch = (value: string) => {
    console.log('[SearchControls.submitSearch] received value:', value)
    console.log('[SearchControls.submitSearch] value.trim():', value.trim())
    console.log('[SearchControls.submitSearch] value.trim().length:', value.trim().length)

    const newQuery = value.trim().length > 0 ? value.trim() : undefined
    console.log('[SearchControls.submitSearch] newQuery:', newQuery)

    void navigate({
      to: '/results',
      search: (prev) => {
        const newSearch = {
          ...prev,
          year: prev.year ?? DEFAULT_YEAR,
          query: newQuery,
        }
        console.log('[SearchControls.submitSearch] prev search:', prev)
        console.log('[SearchControls.submitSearch] new search:', newSearch)
        return newSearch
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput defaultValue={search.query ?? ''} onSubmit={submitSearch} />

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-normal text-slate-700">Sort by</span>
          <div className="relative inline-block border-b-2 border-primary pb-0.5">
            <select
              className="appearance-none bg-transparent pr-6 text-sm font-normal text-primary focus:outline-none"
              defaultValue="best"
            >
              <option value="best">Best match</option>
              <option value="rating">Highest rated</option>
              <option value="code">Course code</option>
              <option value="relevance">Relevance</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-primary"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-normal text-slate-700 transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <SlidersHorizontal size={16} />
          Filters
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showFilters && <FiltersPanel />}
    </div>
  )
}

function SearchInput({
  defaultValue,
  onSubmit,
}: {
  defaultValue: string
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue)

  console.log('[SearchInput] defaultValue:', defaultValue, 'current value state:', value)

  // Sync local state when defaultValue changes (e.g., after navigation)
  useEffect(() => {
    console.log('[SearchInput.useEffect] defaultValue changed:', defaultValue, '-> updating state')
    setValue(defaultValue)
  }, [defaultValue])

  return (
    <form
      className="relative flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        console.log('[SearchInput.onSubmit] form submitted')
        console.log('[SearchInput.onSubmit] current value state:', value)

        // Read value directly from form data to avoid stale closure issues
        const formData = new FormData(e.currentTarget)
        const formDataValue = formData.get('query') as string | null
        console.log('[SearchInput.onSubmit] formData.get("query"):', formDataValue)

        const inputValue = formDataValue != null && formDataValue !== '' ? formDataValue : value
        console.log('[SearchInput.onSubmit] final inputValue:', inputValue)
        console.log('[SearchInput.onSubmit] calling onSubmit with:', inputValue)
        onSubmit(inputValue)
      }}
    >
      <label htmlFor="results-search" className="sr-only">
        Search courses
      </label>
      <input
        id="results-search"
        name="query"
        type="text"
        value={value}
        onChange={(e) => {
          console.log('[SearchInput.onChange] new value:', e.target.value)
          setValue(e.target.value)
        }}
        placeholder="Search by course, instructor, or keyword"
        className="w-full rounded-full border border-slate-300 bg-white py-3 pr-24 pl-5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-primary px-4 py-2 text-xs font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
      >
        Search
      </button>
    </form>
  )
}

function SearchResults() {
  const search = Route.useSearch()
  const query = search.query ?? ''
  const year = search.year ?? DEFAULT_YEAR

  console.log('[SearchResults] search params:', search)
  console.log('[SearchResults] query:', query, 'year:', year)
  console.log('[SearchResults] queryKey:', ['search', query, year])

  const { data: results = [], isLoading } = useQuery(searchQueryOptions(query, year))

  console.log('[SearchResults] isLoading:', isLoading, 'results count:', results.length)

  if (isLoading) {
    return <p className="text-sm text-slate-500">Searching...</p>
  }

  if (query && results.length === 0) {
    return <p className="text-sm text-slate-600">No matches found for "{query}".</p>
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {results.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  )
}

function CourseCard({ course }: { course: SearchCourseResult }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const primaryInstructor = getPrimaryInstructor(course)
  const displayCode = `${course.subject_code} ${course.code_number}${course.code_suffix ?? ''}`

  return (
    <Link
      to="/course/$courseId"
      params={{ courseId: String(course.id) }}
      className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <article>
        <div className="flex items-start justify-between gap-4">
          <p className="text-2xl font-normal tracking-tight text-slate-900">{displayCode}</p>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-normal text-slate-700">
            Score {course.score.toFixed(2)}
          </span>
        </div>
        <h2 className="mt-2 text-xl font-normal tracking-tight text-slate-800">{course.title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {primaryInstructor !== null ? `Professor ${primaryInstructor}` : 'Instructor TBA'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {course.academic_group} | {course.academic_career} | {course.year}
        </p>
        {course.gers.length > 0 && (
          <p className="mt-1 text-sm text-slate-500">GERs: {course.gers.join(', ')}</p>
        )}

        {isExpanded && (
          <>
            <p className="mt-4 text-base leading-relaxed text-slate-600">{course.description}</p>
            {/* <p className="mt-3 text-sm text-slate-500">Sections: {course.sections.length}</p> */}
          </>
        )}

        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
          className="mt-4 flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-[#8C1515]"
        >
          {isExpanded ? (
            <>
              Hide course description <ChevronUp size={16} />
            </>
          ) : (
            <>
              See course description <ChevronDown size={16} />
            </>
          )}
        </button>
      </article>
    </Link>
  )
}

function FiltersPanel() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="mb-3 text-sm font-normal tracking-wide text-slate-700 uppercase">
            Filter By Rating
          </h3>
          <div className="flex flex-col gap-2">
            {['4.5+ Stars', '4.0+ Stars', '3.0+ Stars'].map((label) => (
              <label key={label} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          className="rounded-lg px-4 py-2 text-sm font-normal text-slate-600 transition hover:text-slate-900"
        >
          Clear All
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-normal text-primary-foreground transition hover:bg-primary-hover"
        >
          Apply Filters
        </button>
      </div>
    </div>
  )
}

const getPrimaryInstructor = (_course: SearchCourseResult) => {
  return 'TEST'
  // for (const section of course.sections) {
  //   for (const schedule of section.schedules) {
  //     if (schedule.instructors.length > 0) {
  //       return schedule.instructors[0]?.name ?? null
  //     }
  //   }
  // }
  // return null
}
