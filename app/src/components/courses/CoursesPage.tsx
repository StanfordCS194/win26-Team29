import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { DEFAULT_ALWAYS_VISIBLE_EVAL_SLUGS, isEvalSortOption } from '@/data/search/eval-metrics'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

import { SearchBar } from './SearchBar'
import { SearchResultsContainer } from './SearchResults'
import { SortSelect } from './SortSelect'
import { QuarterTowerMetricSettings } from './QuarterTowerMetricSettings'
import { YearSelect } from './YearSelect'
import { AppliedFilterBadges } from './AppliedFilterBadges'
import { FilterSearch } from './FilterSearch'
import { QuarterFilter } from './QuarterFilter'
import { DaysFilter } from './DaysFilter'
import { UnitsFilter } from './UnitsFilter'
import { ClassDurationFilter } from './ClassDurationFilter'
import { StartTimeFilter } from './StartTimeFilter'
import { GERFilter } from './GERFilter'
import { CareerFilter } from './CareerFilter'
import { ComponentFilter } from './ComponentFilter'
import { GradingOptionFilter } from './GradingOptionFilter'
import { FinalExamFilter } from './FinalExamFilter'
import { SubjectFilter } from './SubjectFilter'
import { NumGersFilter } from './NumGersFilter'
import { EvalFilters } from './EvalFilters'
import { EnrolledFilter, MaxClassSizeFilter, EnrollmentStatusFilter } from './EnrollmentFilters'
import { RepeatableFilter } from './RepeatableFilter'
import { DeduplicateCrosslistings } from './DeduplicateCrosslistings'
import { CodeNumberFilter } from './CodeNumberFilter'
import { SubjectCountFilter } from './SubjectCountFilter'
import { NumQuartersFilter } from './NumQuartersFilter'
import { NumMeetingDaysFilter } from './NumMeetingDaysFilter'
import { InstructorFilter } from './InstructorFilter'

import type { EvalSlug } from '@/data/search/eval-questions'

const ALWAYS_SHOW_LOCAL_STORAGE_KEY = 'courses.alwaysVisibleEvalSlugs'

export function CoursesPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true

  const [committedSearch, setCommittedSearch] = useState(search)
  const handleCommit = useCallback((s: SearchParams) => setCommittedSearch(s), [])

  const toggleAdvancedMode = () => {
    if (advancedMode) {
      void navigate({
        search: (prev) =>
          ({
            ...prev,
            advancedMode: undefined,
            quartersExclude: [],
            quartersIncludeMode: 'or',
            numQuartersMin: undefined,
            numQuartersMax: undefined,
            gersExclude: [],
            gersIncludeMode: 'or',
            numGersMin: undefined,
            numGersMax: undefined,
            subjectsExclude: [],
            subjectsIncludeMode: 'or',
            subjectsWithCrosslistings: undefined,
            numSubjectsMin: undefined,
            numSubjectsMax: undefined,
            daysExclude: undefined,
            daysIncludeMode: 'or',
            careersExclude: [],
            gradingOptionsExclude: [],
            finalExamFlagsExclude: [],
            instructorSunetsExclude: [],
            instructorSunetsIncludeMode: 'or',
            page: 1,
          }) as unknown as Required<SearchParams>,
      })
    } else {
      void navigate({
        search: (prev) => ({ ...prev, advancedMode: true }) as Required<SearchParams>,
      })
    }
  }

  const [alwaysVisibleEvalSlugs, setAlwaysVisibleEvalSlugs] = useState<EvalSlug[]>(
    DEFAULT_ALWAYS_VISIBLE_EVAL_SLUGS,
  )

  const visibleEvalSlugs = useMemo(() => {
    const combined = new Set<EvalSlug>(alwaysVisibleEvalSlugs)
    if (isEvalSortOption(search.sort)) combined.add(search.sort)
    for (const slug of EVAL_QUESTION_SLUGS) {
      const min = search[`min_eval_${slug}` as keyof SearchParams] as number | undefined
      const max = search[`max_eval_${slug}` as keyof SearchParams] as number | undefined
      if (min != null || max != null) combined.add(slug)
    }
    return EVAL_QUESTION_SLUGS.filter((slug) => combined.has(slug))
  }, [alwaysVisibleEvalSlugs, search])

  useEffect(() => {
    const stored = window.localStorage.getItem(ALWAYS_SHOW_LOCAL_STORAGE_KEY)
    if (stored === null || stored === '') return
    try {
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const safe = parsed.filter(
        (value): value is EvalSlug =>
          typeof value === 'string' && EVAL_QUESTION_SLUGS.includes(value as EvalSlug),
      )
      setAlwaysVisibleEvalSlugs(safe)
    } catch {
      // Ignore malformed persisted preferences.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ALWAYS_SHOW_LOCAL_STORAGE_KEY, JSON.stringify(alwaysVisibleEvalSlugs))
  }, [alwaysVisibleEvalSlugs])

  const filterStickyRef = useRef<HTMLDivElement>(null)
  const filterScrollRef = useRef<HTMLDivElement>(null)
  const prevStickyHeightRef = useRef(-1)

  const distanceFromBottomRef = useRef(0)

  useEffect(() => {
    const scroll = filterScrollRef.current
    if (!scroll) return
    const onScroll = () => {
      distanceFromBottomRef.current = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop
    }
    scroll.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => scroll.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const sticky = filterStickyRef.current
    const scroll = filterScrollRef.current
    if (!sticky || !scroll) return

    const newHeight = sticky.offsetHeight
    if (prevStickyHeightRef.current === -1) {
      prevStickyHeightRef.current = newHeight
      return
    }

    const delta = newHeight - prevStickyHeightRef.current
    prevStickyHeightRef.current = newHeight
    if (delta > 0) {
      scroll.scrollTop += delta
    } else if (delta < 0) {
      const newMaxScroll = scroll.scrollHeight - scroll.clientHeight
      const targetScrollTop = newMaxScroll - distanceFromBottomRef.current
      scroll.scrollTop = Math.max(targetScrollTop, scroll.scrollTop + delta)
    }

    // Keep distance-from-bottom in sync after any layout change
    distanceFromBottomRef.current = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop
  })

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] overflow-x-clip bg-sky-50">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            data-search-top-anchor
            className="sticky top-[var(--header-height)] z-40 -mx-5 -mb-6 flex items-center gap-2 bg-sky-50/60 px-6 pt-3 pb-8 backdrop-blur-lg"
            style={{
              maskImage: [
                'linear-gradient(to bottom, black 60%, transparent 100%)',
                'linear-gradient(to right, transparent 0, black 0.75rem)',
                'linear-gradient(to left, transparent 0, black 0.75rem)',
                // radial fills at each bottom corner round the sharp intersection
                'radial-gradient(circle at 0.75rem 60%, black 0.5rem, transparent 1.25rem)',
                'radial-gradient(circle at calc(100% - 0.75rem) 60%, black 0.5rem, transparent 1.25rem)',
              ].join(', '),
              WebkitMaskImage: [
                'linear-gradient(to bottom, black 60%, transparent 100%)',
                'linear-gradient(to right, transparent 0, black 0.75rem)',
                'linear-gradient(to left, transparent 0, black 0.75rem)',
                'radial-gradient(circle at 0.75rem 60%, black 0.5rem, transparent 1.25rem)',
                'radial-gradient(circle at calc(100% - 0.75rem) 60%, black 0.5rem, transparent 1.25rem)',
              ].join(', '),
              maskComposite: 'intersect, intersect, add, add',
              WebkitMaskComposite: 'destination-in, destination-in, source-over, source-over',
            }}
          >
            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>
            <SortSelect />
            <DeduplicateCrosslistings />
            <QuarterTowerMetricSettings
              alwaysVisibleEvalSlugs={alwaysVisibleEvalSlugs}
              onAlwaysVisibleEvalSlugsChange={setAlwaysVisibleEvalSlugs}
              visibleEvalSlugs={visibleEvalSlugs}
            />
          </div>
          <SearchResultsContainer
            visibleEvalSlugs={visibleEvalSlugs}
            committedSearch={committedSearch}
            onCommit={handleCommit}
          />
        </div>
        <aside className="hidden min-h-[calc(100vh-var(--header-height))] w-64 shrink-0 lg:block">
          <div className="sticky top-[var(--header-height)] flex max-h-[calc(100vh-var(--header-height)-1rem)] flex-col pt-1.5">
            <div ref={filterStickyRef} data-filter-sticky className="-mr-40 -ml-4 bg-sky-50 pr-36 pl-4">
              <div className="py-1">
                <YearSelect />
              </div>
              <div className="flex items-center gap-2 border-t border-slate-200 pt-1 pb-1">
                <div className="min-w-0 flex-1">
                  <FilterSearch />
                </div>
                <button
                  type="button"
                  onClick={toggleAdvancedMode}
                  aria-pressed={advancedMode}
                  aria-label="Toggle advanced filters"
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition',
                    advancedMode
                      ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-300'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
                  )}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Advanced
                </button>
              </div>
              <AppliedFilterBadges committedSearch={committedSearch} />
            </div>
            <div
              ref={filterScrollRef}
              data-filter-scroll
              className="-mr-40 -ml-4 min-h-0 flex-1 overflow-y-auto pr-36 pl-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex flex-col divide-y divide-slate-200">
                <div id="filter-quarters" className="flex flex-col gap-2 py-1.25">
                  <QuarterFilter />
                  {advancedMode && <NumQuartersFilter />}
                </div>
                <div id="filter-gers" className="flex flex-col gap-2 py-1.25">
                  <GERFilter />
                  {advancedMode && <NumGersFilter />}
                </div>
                <div id="filter-units" className="py-1.25">
                  <UnitsFilter />
                </div>
                <div id="filter-subjects" className="flex flex-col gap-2 py-1.25">
                  <SubjectFilter />
                  {advancedMode && <SubjectCountFilter />}
                </div>
                <div id="filter-days" className="flex flex-col gap-2 py-1.25">
                  <DaysFilter />
                  <NumMeetingDaysFilter />
                </div>
                <div id="filter-schedule" className="flex flex-col gap-2 py-1.25">
                  <StartTimeFilter />
                  <ClassDurationFilter />
                </div>
                <div id="filter-enrollment" className="flex flex-col gap-2 py-1.25">
                  <EnrolledFilter />
                  <MaxClassSizeFilter />
                  <EnrollmentStatusFilter />
                </div>
                <div id="filter-evals" className="py-1.25">
                  <EvalFilters />
                </div>
                <div id="filter-instructors" className="py-1.25">
                  <InstructorFilter />
                </div>
                <div id="filter-codeNumber" className="py-1.25">
                  <CodeNumberFilter />
                </div>
                <div id="filter-careers" className="py-1.25">
                  <CareerFilter />
                </div>
                <div id="filter-components" className="py-1.25">
                  <ComponentFilter />
                </div>
                <div id="filter-gradingOptions" className="py-1.25">
                  <GradingOptionFilter />
                </div>
                <div id="filter-finalExam" className="py-1.25">
                  <FinalExamFilter />
                </div>
                <div id="filter-repeatable" className="py-1.25 pb-1">
                  <RepeatableFilter />
                </div>
              </div>
              <div className="sticky bottom-0 border-t border-slate-200 bg-sky-50" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
