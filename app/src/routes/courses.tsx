import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useDebouncer } from '@tanstack/react-pacer'
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { getAvailableYears, searchCourses } from '@/data/search/search'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ALL_QUARTERS, coursesSearchSchema } from '@/data/search/search.types'

import type { Quarter, SearchCourseResult, SearchResultSections } from '@/data/search/search.types'

// --- Shared query options factory ---

const availableYearsQueryOptions = {
  queryKey: ['available-years'] as const,
  queryFn: () => getAvailableYears(),
  staleTime: 1000 * 60 * 60 * 24,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
}

const searchQueryOptions = (query: string, year: string, quarters: Quarter[]) => {
  const sortedQuarters = [...quarters].sort()
  return {
    queryKey: ['search', query, year, sortedQuarters] as const,
    queryFn: () => searchCourses({ data: { query, year, quarters: sortedQuarters } }),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  }
}

// --- Prefetch-on-hover hook ---

function usePrefetchOnHover(
  getQueryOptions: () => ReturnType<typeof searchQueryOptions> | null,
  delay = 120,
) {
  const queryClient = useQueryClient()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const onPointerEnter = () => {
    timeoutRef.current = setTimeout(() => {
      const opts = getQueryOptions()
      if (opts) void queryClient.prefetchQuery(opts)
    }, delay)
  }

  const onPointerLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  return { onPointerEnter, onPointerLeave }
}

// --- Route definition ---

export const Route = createFileRoute('/courses')({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => ({
    query: search.query,
    year: search.year,
    quarters: search.quarters,
  }),
  loader: ({ deps, context }) => {
    void context.queryClient.prefetchQuery(availableYearsQueryOptions)
    if (deps.query.length > 0) {
      void context.queryClient.prefetchQuery(searchQueryOptions(deps.query, deps.year, deps.quarters))
    }
  },
  component: CoursesPage,
})

// --- Page layout ---

function CoursesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 pt-10 pb-16">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <SearchBar />
          <SearchResultsContainer />
        </div>
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-28 flex flex-col gap-6">
            <YearSelect />
            <QuarterFilter />
          </div>
        </aside>
      </div>
    </div>
  )
}

// --- SearchBar ---

function SearchBar() {
  const query = Route.useSearch({ select: (s) => s.query })
  const year = Route.useSearch({ select: (s) => s.year })
  const quarters = Route.useSearch({ select: (s) => s.quarters })
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(query)

  useEffect(() => {
    setValue(query)
  }, [query])

  const prefetchDebouncer = useDebouncer(
    (trimmed: string) => {
      void queryClient.prefetchQuery(searchQueryOptions(trimmed, year, quarters))
    },
    { wait: 250, enabled: value.trim().length > 0 },
  )

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        prefetchDebouncer.cancel()
        void navigate({
          search: (prev) => ({ ...prev, query: value.trim() }),
        })
      }}
    >
      <label htmlFor="courses-search" className="sr-only">
        Search courses
      </label>
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
      />
      <input
        id="courses-search"
        name="query"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          prefetchDebouncer.maybeExecute(e.target.value.trim())
        }}
        placeholder="Search by course, instructor, or keyword"
        className="w-full rounded-full border border-slate-300 bg-white py-3 pr-24 pl-11 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
      />
      <button
        type="submit"
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-primary px-4 py-2 text-xs font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
      >
        Search
      </button>
    </form>
  )
}

// --- YearSelect ---

function YearSelect() {
  const query = Route.useSearch({ select: (s) => s.query })
  const year = Route.useSearch({ select: (s) => s.year })
  const quarters = Route.useSearch({ select: (s) => s.quarters })
  const navigate = Route.useNavigate()
  const { data: years } = useQuery(availableYearsQueryOptions)

  if (!years || years.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Academic Year</span>
      <Select
        value={year}
        onValueChange={(val) => {
          if (val !== undefined && val !== '')
            void navigate({ search: (prev) => ({ ...prev, year: val ?? undefined }) })
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <YearOption key={y} value={y} query={query} quarters={quarters} />
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function YearOption({ value, query, quarters }: { value: string; query: string; quarters: Quarter[] }) {
  const hoverProps = usePrefetchOnHover(() => (query ? searchQueryOptions(query, value, quarters) : null))

  return (
    <SelectItem value={value} {...hoverProps}>
      {value}
    </SelectItem>
  )
}

// --- QuarterFilter ---

function QuarterFilter() {
  const query = Route.useSearch({ select: (s) => s.query })
  const year = Route.useSearch({ select: (s) => s.year })
  const quarters = Route.useSearch({ select: (s) => s.quarters })
  const navigate = Route.useNavigate()

  const toggle = (quarter: Quarter) => {
    const next = quarters.includes(quarter) ? quarters.filter((q) => q !== quarter) : [...quarters, quarter]
    if (next.length === 0) return
    void navigate({ search: (prev) => ({ ...prev, quarters: next }) })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Quarters</span>
      <div className="flex flex-col gap-1.5">
        {ALL_QUARTERS.map((q) => (
          <QuarterCheckbox
            key={q}
            quarter={q}
            checked={quarters.includes(q)}
            onToggle={() => toggle(q)}
            query={query}
            year={year}
            quarters={quarters}
          />
        ))}
      </div>
    </div>
  )
}

function QuarterCheckbox({
  quarter,
  checked,
  onToggle,
  query,
  year,
  quarters,
}: {
  quarter: Quarter
  checked: boolean
  onToggle: () => void
  query: string
  year: string
  quarters: Quarter[]
}) {
  const hoverProps = usePrefetchOnHover(() => {
    const next = checked ? quarters.filter((q) => q !== quarter) : [...quarters, quarter]
    if (next.length === 0 || !query) return null
    return searchQueryOptions(query, year, next)
  })

  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
      {...hoverProps}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
      />
      {quarter}
    </label>
  )
}

// --- SearchResultsContainer ---

function SearchResultsContainer() {
  const query = Route.useSearch({ select: (s) => s.query })

  if (!query) {
    return <p className="py-8 text-center text-sm text-slate-500">Enter a search to find courses.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchResults />
    </div>
  )
}

// --- SearchResults ---

function SearchResults() {
  const { query, year, quarters } = Route.useSearch()

  const {
    data: results,
    isPending,
    isError,
    error,
    isPlaceholderData,
  } = useQuery({
    ...searchQueryOptions(query, year, quarters),
    placeholderData: keepPreviousData,
  })

  if (isPending) {
    return <p className="py-8 text-center text-sm text-slate-500">Searching…</p>
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-red-600">Something went wrong — {error?.message ?? 'please try again.'}</p>
      </div>
    )
  }

  if (results === undefined || results.length === 0) {
    return <p className="text-sm text-slate-600">No matches found for &ldquo;{query}&rdquo;.</p>
  }

  return (
    <TooltipProvider>
      <div className={`transition-opacity duration-150 ${isPlaceholderData ? 'opacity-60' : 'opacity-100'}`}>
        {results.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </TooltipProvider>
  )
}

// --- Quarter tower helpers ---

const QUARTER_ORDER: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

const QUARTER_COLORS: Record<Quarter, { bg: string; text: string; dot: string }> = {
  Autumn: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  Winter: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-400' },
  Spring: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  Summer: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
}

function getInstructorsForQuarter(sections: SearchResultSections, quarter: Quarter): string[] {
  const quarterSections = sections.filter((s) => s.termQuarter === quarter)
  if (quarterSections.length === 0) return []

  const seen = new Set<string>()
  const names: string[] = []

  for (const section of quarterSections) {
    for (const schedule of section.schedules) {
      for (const instructor of schedule.instructors) {
        // exclude TAs — role is typically 'TA' or 'Teaching Assistant'
        const role = instructor.role?.toLowerCase() ?? ''
        if (role.includes('ta') || role.includes('teaching assistant')) continue
        if (!seen.has(instructor.name)) {
          seen.add(instructor.name)
          names.push(instructor.name)
        }
      }
    }
  }

  return names
}

// --- QuarterTower ---

const MAX_INSTRUCTORS_SHOWN = 2

function QuarterSlot({ quarter, instructors }: { quarter: Quarter; instructors: string[] }) {
  const active = instructors.length > 0
  const colors = QUARTER_COLORS[quarter]
  const overflow = instructors.length > MAX_INSTRUCTORS_SHOWN
  const shown = overflow ? instructors.slice(0, MAX_INSTRUCTORS_SHOWN) : instructors
  const hidden = overflow ? instructors.slice(MAX_INSTRUCTORS_SHOWN) : []

  return (
    <div
      className={`relative w-[152px] rounded-md px-2.5 py-1.5 text-xs leading-snug transition-colors ${
        active ? `${colors.bg} ${colors.text}` : 'bg-slate-50 text-slate-300'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${active ? colors.dot : 'bg-slate-200'}`}
        />
        <span className="font-semibold">{quarter}</span>
      </div>
      {active && (
        <div className="mt-0.5 pl-3 opacity-75">
          <span>{shown.join(', ')}</span>
          {overflow && (
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className="ml-1 cursor-default font-semibold opacity-60 transition-opacity hover:opacity-100"
              >
                +{hidden.length}
              </TooltipTrigger>
              <TooltipContent align="end" sideOffset={8} className="max-w-56 text-[11px] leading-relaxed">
                {hidden.join(', ')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

function QuarterTower({ sections }: { sections: SearchResultSections }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {QUARTER_ORDER.map((quarter) => (
        <QuarterSlot
          key={quarter}
          quarter={quarter}
          instructors={getInstructorsForQuarter(sections, quarter)}
        />
      ))}
    </div>
  )
}

// --- CourseCard ---

const DESCRIPTION_TRUNCATE_LENGTH = 440

function CourseCard({ course }: { course: SearchCourseResult }) {
  const [showMore, setShowMore] = useState(false)
  const displayCode = `${course.subject_code} ${course.code_number}${course.code_suffix ?? ''}`
  const isLong = course.description.length > DESCRIPTION_TRUNCATE_LENGTH
  const truncated = isLong && !showMore

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowMore((prev) => !prev)
  }

  return (
    <Link
      to="/course/$courseId"
      params={{ courseId: String(course.id) }}
      className="mb-3 block rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <article className="flex gap-4">
        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Title line: bold code + title inline */}
          <h2 className="text-base leading-snug font-medium text-slate-800">
            <span className="font-semibold text-slate-900">{displayCode}</span>
            <span className="mx-1.5 font-normal text-slate-300">·</span>
            <span className="font-normal text-slate-700">{course.title}</span>
          </h2>

          {course.gers.length > 0 && <p className="text-sm text-slate-400">GERs: {course.gers.join(', ')}</p>}

          {/* Description inline with show more/less */}
          {course.description && (
            <p className="text-[15px] leading-relaxed text-slate-500">
              {truncated
                ? course.description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()
                : course.description}
              {truncated && (
                <>
                  {'… '}
                  <button
                    onClick={handleToggle}
                    className="font-medium text-slate-400 transition-colors hover:text-primary"
                  >
                    show more
                  </button>
                </>
              )}
              {!truncated && isLong && (
                <>
                  {' '}
                  <button
                    onClick={handleToggle}
                    className="font-medium text-slate-400 transition-colors hover:text-primary"
                  >
                    show less
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        {/* Quarter tower */}
        <QuarterTower sections={course.sections} />
      </article>
    </Link>
  )
}
