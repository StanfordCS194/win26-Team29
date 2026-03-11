import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Search, ThumbsDown, ThumbsUp } from 'lucide-react'
import { DescriptionClamp } from '@/components/courses/DescriptionClamp'
import { getEvalMetricMeta, getEvalValueColor } from '@/data/search/eval-metrics'
import { SLUG_LABEL } from '@/data/search/eval-questions'
import type { EvalSlug } from '@/data/search/eval-questions'
import { DEFAULT_YEAR, SEARCH_DEFAULTS } from '@/data/search/search.params'
import type { SearchCourseResult, SearchParams } from '@/data/search/search.params'
import {
  courseByCodeQueryOptions,
  evalDistributionQueryOptions,
  instructorCourseQuartersQueryOptions,
  courseTextReviewsQueryOptions,
  availableSubjectsQueryOptions,
} from '@/components/courses/courses-query-options'
import { formatCourseCodeForDisplay } from '@/lib/course-code'
import { renderDescriptionWithLinks } from '@/components/courses/render-description-links'
import { getCurrentQuarter, getNextQuarter } from '@/lib/quarter-utils'
import { getUserPlan, addPlanCourse, removePlanCourse } from '@/data/plan/plan-server'
import { WeeklyCalendar } from '@/components/WeeklyCalendar'

const PREFETCH_START_YEAR = parseInt(DEFAULT_YEAR.split('-')[0]!, 10)
const PREFETCH_YEARS = [
  `${PREFETCH_START_YEAR - 1}-${PREFETCH_START_YEAR}`,
  `${PREFETCH_START_YEAR - 2}-${PREFETCH_START_YEAR - 1}`,
  `${PREFETCH_START_YEAR - 3}-${PREFETCH_START_YEAR - 2}`,
]

export const Route = createFileRoute('/course/$courseId')({
  loader: ({ params, context }) => {
    void context.queryClient.prefetchQuery(courseByCodeQueryOptions(DEFAULT_YEAR, params.courseId))
    void context.queryClient.prefetchQuery(
      instructorCourseQuartersQueryOptions({
        courseCodeSlug: params.courseId,
        instructorSunets: [],
        years: PREFETCH_YEARS,
      }),
    )
  },
  component: ClassPage,
})

const EXCLUDED_COMPONENT_TYPES = new Set(['INS', 'T/D'])

function isIndividualInstructionCourse(sections: SearchCourseResult['sections']) {
  const principal = (sections ?? []).filter(
    (sec) => (sec.unitsMin != null || sec.unitsMax != null) && !sec.cancelled,
  )
  return principal.length > 0 && principal.every((sec) => EXCLUDED_COMPONENT_TYPES.has(sec.componentType))
}

interface InstructorInfo {
  name: string
  sunet: string
}

function getInstructorsByQuarter(sections: SearchCourseResult['sections']) {
  function isPrincipalSection(sec: SearchCourseResult['sections'][number]) {
    return sec.unitsMin != null || sec.unitsMax != null
  }
  const principal = (sections ?? []).filter((sec) => isPrincipalSection(sec) && !sec.cancelled)
  const byQuarter = new Map<string, InstructorInfo[]>()
  for (const sec of principal) {
    const existing = byQuarter.get(sec.termQuarter) ?? []
    const seen = new Set(existing.map((i) => i.sunet || i.name))
    for (const sched of sec.schedules ?? []) {
      for (const inst of sched.instructors ?? []) {
        const role = (inst.role ?? '').toLowerCase()
        if (role.includes('ta') || role.includes('teaching assistant')) continue
        const key = inst.sunet || inst.name
        if (key && !seen.has(key)) {
          seen.add(key)
          existing.push({ name: inst.name, sunet: inst.sunet })
        }
      }
    }
    byQuarter.set(sec.termQuarter, existing)
  }
  return byQuarter
}

function InstructorRow({
  instructor,
  qualityMap,
}: {
  instructor: InstructorInfo
  qualityMap?: Record<string, number>
}) {
  const rating = instructor.sunet && qualityMap?.[instructor.sunet]
  const qualityMeta = getEvalMetricMeta('quality')
  const color = typeof rating === 'number' ? getEvalValueColor(rating, 'quality') : undefined

  const nameContent =
    instructor.sunet !== '' ? (
      <Link
        to="/instructor/$sunet"
        params={{ sunet: instructor.sunet }}
        className="min-w-0 truncate hover:text-primary hover:underline"
      >
        {instructor.name}
      </Link>
    ) : (
      <span className="min-w-0 truncate">{instructor.name}</span>
    )

  return (
    <div className="flex items-center justify-between">
      {nameContent}
      <span className="ml-2 w-10 shrink-0">
        {typeof rating === 'number' && color !== undefined && color !== '' && (
          <span
            className="inline-flex w-full items-center justify-center rounded px-1.5 py-0.5 text-sm font-semibold"
            style={{ backgroundColor: `${color}20`, color }}
            title={`${qualityMeta.label} (avg past 2 yrs): ${qualityMeta.formatValue(rating)}`}
          >
            {qualityMeta.formatValue(rating)}
          </span>
        )}
      </span>
    </div>
  )
}

function CourseDetailsCard({ course }: { course: SearchCourseResult }) {
  const instructorsByQuarter = getInstructorsByQuarter(course.sections ?? [])
  const qualityMap = course.instructorQualityBySunet

  return (
    <div className="rounded-3xl border border-white/50 bg-white/40 p-6 shadow-sm backdrop-blur-xl">
      {instructorsByQuarter.size === 0 ? (
        <p className="text-base text-[#4A4557]">—</p>
      ) : (
        <div className="space-y-2">
          {Array.from(instructorsByQuarter.entries()).map(([quarter, instructors]) => (
            <div key={quarter} className="text-base text-[#4A4557]">
              <div className="font-bold text-[#150F21]">{quarter}</div>
              {instructors.length ? (
                <div className="mt-0.5 space-y-0.5 pl-4">
                  {instructors.map((inst) => (
                    <InstructorRow key={inst.sunet || inst.name} instructor={inst} qualityMap={qualityMap} />
                  ))}
                </div>
              ) : (
                <span className="ml-1.5">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


const DISTRIBUTION_METRICS: EvalSlug[] = ['hours', 'quality', 'learning', 'organized', 'goals']

function useDistributionDefaults(course: SearchCourseResult | null | undefined) {
  return useMemo(() => {
    if (!course) return { allInstructors: [] as InstructorInfo[], defaultSunets: [] as string[] }

    const instructorsByQuarter = getInstructorsByQuarter(course.sections ?? [])
    const nextQ = getNextQuarter(getCurrentQuarter())
    const availableQuarters = Array.from(instructorsByQuarter.keys())

    const defaultQuarter = availableQuarters.includes(nextQ) ? nextQ : (availableQuarters[0] ?? null)

    const allInstructors: InstructorInfo[] = []
    const seen = new Set<string>()
    for (const instructors of instructorsByQuarter.values()) {
      for (const inst of instructors) {
        const key = inst.sunet || inst.name
        if (!seen.has(key)) {
          seen.add(key)
          allInstructors.push(inst)
        }
      }
    }

    const defaultSunets = defaultQuarter
      ? (instructorsByQuarter.get(defaultQuarter) ?? []).map((i) => i.sunet).filter(Boolean)
      : allInstructors.map((i) => i.sunet).filter(Boolean)

    return { allInstructors, defaultSunets }
  }, [course])
}

function DistributionBarChart({
  buckets,
  totalResponses,
  boundaryLabels,
}: {
  buckets: { label: string; count: number }[]
  totalResponses: number
  boundaryLabels: string[]
}) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1)

  return (
    <div className="space-y-1">
      <div className="flex items-end" style={{ height: 180 }}>
        {buckets.map((bucket, i) => {
          const pct = totalResponses > 0 ? (bucket.count / totalResponses) * 100 : 0
          const barHeight = totalResponses > 0 ? (bucket.count / maxCount) * 100 : 0
          return (
            <div
              key={bucket.label}
              className="group flex flex-1 flex-col items-center justify-end"
              style={{ height: '100%', marginLeft: i === 0 ? 0 : 1 }}
            >
              <div className="relative mb-1 text-center text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                {pct.toFixed(1)}%
              </div>
              <div
                className="w-full rounded-t bg-primary/60 transition-all group-hover:bg-primary"
                style={{ height: `${barHeight}%`, minHeight: bucket.count > 0 ? 4 : 0 }}
                title={`${bucket.label}: ${bucket.count} (${pct.toFixed(1)}%)`}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between">
        {boundaryLabels.map((label, i) => (
          <span key={i} className="text-[10px] leading-tight text-[#4A4557]/70">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function MultiSelect({
  options,
  selected,
  onChange,
  label,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  label: string
}) {
  const [open, setOpen] = useState(false)

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val))
    } else {
      onChange([...selected, val])
    }
  }

  const display =
    selected.length === 0
      ? `All ${label}`
      : selected.length === options.length
        ? `All ${label}`
        : options
            .filter((o) => selected.includes(o.value))
            .map((o) => o.label)
            .join(', ')

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-lg border border-white/60 bg-white/60 px-3 py-1.5 text-sm text-[#150F21] shadow-sm backdrop-blur-xl transition-colors hover:bg-white/80"
        onClick={() => setOpen(!open)}
      >
        <span className="max-w-[160px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#4A4557]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-48 min-w-[180px] overflow-y-auto rounded-lg border border-white/60 bg-white/90 py-1 shadow-lg backdrop-blur-xl">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[#150F21] hover:bg-[#150F21]/5"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="rounded border-[#4A4557]/30"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EvalDistributionSection({
  course,
  courseCodeSlug,
  hideInstructorSelector,
}: {
  course: SearchCourseResult
  courseCodeSlug: string
  hideInstructorSelector?: boolean
}) {
  const { allInstructors, defaultSunets } = useDistributionDefaults(course)

  const [selectedSunets, setSelectedSunets] = useState<string[]>(
    hideInstructorSelector === true ? [] : defaultSunets,
  )
  const [selectedQuarterKeys, setSelectedQuarterKeys] = useState<string[]>([])
  const [metric, setMetric] = useState<EvalSlug>('hours')

  const startYear = parseInt(DEFAULT_YEAR.split('-')[0]!, 10)
  // Past 3 whole academic years only (exclude current year and future)
  const years = useMemo(
    () => [
      `${startYear - 1}-${startYear}`,
      `${startYear - 2}-${startYear - 1}`,
      `${startYear - 3}-${startYear - 2}`,
    ],
    [startYear],
  )

  const { data: availableQuarters } = useQuery(
    instructorCourseQuartersQueryOptions({
      courseCodeSlug,
      instructorSunets: selectedSunets,
      years,
    }),
  )

  const prevSunetsRef = useRef(selectedSunets)
  useEffect(() => {
    if (prevSunetsRef.current !== selectedSunets) {
      prevSunetsRef.current = selectedSunets
      if (availableQuarters && availableQuarters.length > 0) {
        setSelectedQuarterKeys(availableQuarters.map((qy) => `${qy.quarter}|${qy.year}`))
      } else {
        setSelectedQuarterKeys([])
      }
    }
  }, [selectedSunets, availableQuarters])

  useEffect(() => {
    if (selectedQuarterKeys.length === 0 && availableQuarters && availableQuarters.length > 0) {
      setSelectedQuarterKeys(availableQuarters.map((qy) => `${qy.quarter}|${qy.year}`))
    }
  }, [availableQuarters, selectedQuarterKeys.length])

  const selectedQuarterYears = useMemo(
    () =>
      selectedQuarterKeys.map((key) => {
        const [quarter, year] = key.split('|')
        return { quarter: quarter!, year: year! }
      }),
    [selectedQuarterKeys],
  )

  const {
    data: distribution,
    isPending,
    fetchStatus,
  } = useQuery(
    evalDistributionQueryOptions({
      courseCodeSlug,
      quarterYears: selectedQuarterYears,
      instructorSunets: selectedSunets,
      metric,
    }),
  )
  const isDistributionLoading = isPending && fetchStatus === 'fetching'

  const quarterOptions = useMemo(
    () =>
      (availableQuarters ?? []).map((qy) => ({
        value: `${qy.quarter}|${qy.year}`,
        label: `${qy.quarter} ${qy.year}`,
      })),
    [availableQuarters],
  )

  const instructorOptions = allInstructors.map((i) => ({
    value: i.sunet || i.name,
    label: i.name,
  }))

  return (
    <div className="rounded-3xl border border-white/50 bg-white/40 p-6 shadow-sm backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="font-['Clash_Display'] text-xl font-semibold text-[#150F21]">
          Evaluation Distribution
        </h3>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as EvalSlug)}
          className="rounded-lg border border-white/60 bg-white/60 px-3 py-1.5 text-sm text-[#150F21] shadow-sm backdrop-blur-xl transition-colors hover:bg-white/80"
        >
          {DISTRIBUTION_METRICS.map((slug) => (
            <option key={slug} value={slug}>
              {SLUG_LABEL[slug]}
            </option>
          ))}
        </select>

        {hideInstructorSelector !== true && instructorOptions.length > 0 && (
          <MultiSelect
            label="instructors"
            options={instructorOptions}
            selected={selectedSunets}
            onChange={setSelectedSunets}
          />
        )}

        {quarterOptions.length > 0 && (
          <MultiSelect
            label="quarters"
            options={quarterOptions}
            selected={selectedQuarterKeys}
            onChange={setSelectedQuarterKeys}
          />
        )}
      </div>

      {isDistributionLoading ? (
        <div className="flex h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      ) : distribution && distribution.totalResponses > 0 ? (
        <div>
          <DistributionBarChart
            buckets={distribution.buckets}
            totalResponses={distribution.totalResponses}
            boundaryLabels={distribution.boundaryLabels}
          />
          <p className="mt-3 text-xs text-[#4A4557]/60">
            Based on {distribution.totalResponses} response{distribution.totalResponses !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-[#4A4557]/60">No distribution data for this selection.</p>
      )}
    </div>
  )
}

function highlightSearchMatch(text: string, query: string) {
  if (query.length === 0) return text
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let idx = lower.indexOf(query)
  let key = 0
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx))
    }
    parts.push(
      <mark key={key++} className="rounded bg-primary/15 px-0.5 text-inherit">
        {text.slice(idx, idx + query.length)}
      </mark>,
    )
    lastIndex = idx + query.length
    idx = lower.indexOf(query, lastIndex)
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

function TextReviewsSection({
  course,
  courseCodeSlug,
  hideInstructorSelector,
}: {
  course: SearchCourseResult
  courseCodeSlug: string
  hideInstructorSelector?: boolean
}) {
  const { allInstructors, defaultSunets } = useDistributionDefaults(course)

  const [selectedSunets, setSelectedSunets] = useState<string[]>(
    hideInstructorSelector === true ? [] : defaultSunets,
  )
  const [selectedQuarterKeys, setSelectedQuarterKeys] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const startYear = parseInt(DEFAULT_YEAR.split('-')[0]!, 10)
  const years = useMemo(
    () => [
      `${startYear - 1}-${startYear}`,
      `${startYear - 2}-${startYear - 1}`,
      `${startYear - 3}-${startYear - 2}`,
    ],
    [startYear],
  )

  const { data: availableQuarters } = useQuery(
    instructorCourseQuartersQueryOptions({
      courseCodeSlug,
      instructorSunets: selectedSunets,
      years,
    }),
  )

  const prevSunetsRef = useRef(selectedSunets)
  useEffect(() => {
    if (prevSunetsRef.current !== selectedSunets) {
      prevSunetsRef.current = selectedSunets
      if (availableQuarters && availableQuarters.length > 0) {
        setSelectedQuarterKeys(availableQuarters.map((qy) => `${qy.quarter}|${qy.year}`))
      } else {
        setSelectedQuarterKeys([])
      }
    }
  }, [selectedSunets, availableQuarters])

  useEffect(() => {
    if (selectedQuarterKeys.length === 0 && availableQuarters && availableQuarters.length > 0) {
      setSelectedQuarterKeys(availableQuarters.map((qy) => `${qy.quarter}|${qy.year}`))
    }
  }, [availableQuarters, selectedQuarterKeys.length])

  const selectedQuarterYears = useMemo(
    () =>
      selectedQuarterKeys.map((key) => {
        const [quarter, year] = key.split('|')
        return { quarter: quarter!, year: year! }
      }),
    [selectedQuarterKeys],
  )

  const {
    data: reviews,
    isPending: isReviewsPending,
    fetchStatus: reviewsFetchStatus,
  } = useQuery(
    courseTextReviewsQueryOptions({
      courseCodeSlug,
      quarterYears: selectedQuarterYears,
      instructorSunets: selectedSunets,
    }),
  )
  const isReviewsLoading = isReviewsPending && reviewsFetchStatus === 'fetching'

  const quarterOptions = useMemo(
    () =>
      (availableQuarters ?? []).map((qy) => ({
        value: `${qy.quarter}|${qy.year}`,
        label: `${qy.quarter} ${qy.year}`,
      })),
    [availableQuarters],
  )

  const instructorOptions = allInstructors.map((i) => ({
    value: i.sunet || i.name,
    label: i.name,
  }))

  const normalizedSearch = searchQuery.toLowerCase().trim()
  const filteredReviews = useMemo(() => {
    if (!reviews) return []
    if (normalizedSearch.length === 0) return reviews
    return reviews.filter((r) => r.responseText.toLowerCase().includes(normalizedSearch))
  }, [reviews, normalizedSearch])

  return (
    <div className="mt-8">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="h-6 w-1 rounded-full bg-primary" />
        <h3 className="font-['Clash_Display'] text-2xl font-semibold text-[#150F21]">Student Reviews</h3>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {hideInstructorSelector !== true && instructorOptions.length > 0 && (
          <MultiSelect
            label="instructors"
            options={instructorOptions}
            selected={selectedSunets}
            onChange={setSelectedSunets}
          />
        )}
        {quarterOptions.length > 0 && (
          <MultiSelect
            label="quarters"
            options={quarterOptions}
            selected={selectedQuarterKeys}
            onChange={setSelectedQuarterKeys}
          />
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#4A4557]/50" />
          <input
            type="search"
            placeholder="Search reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-white/60 bg-white/60 py-1.5 pr-3 pl-8 text-sm text-[#150F21] shadow-sm backdrop-blur-xl transition-colors placeholder:text-[#4A4557]/40 hover:bg-white/80 focus:bg-white/80 focus:outline-none"
          />
        </div>
      </div>

      {isReviewsLoading ? (
        <div className="flex h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      ) : filteredReviews.length > 0 ? (
        <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
          {filteredReviews.map((review, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/60 bg-white/50 p-5 backdrop-blur-md transition-all hover:shadow-md"
            >
              <div className="mb-2 text-xs text-[#4A4557]/60">
                <span className="font-medium text-[#150F21]/70">
                  {review.quarter} {review.year}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[#4A4557]">
                {normalizedSearch.length > 0
                  ? highlightSearchMatch(review.responseText, normalizedSearch)
                  : review.responseText}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-[#4A4557]/60">
          {reviews != null && reviews.length > 0 && normalizedSearch.length > 0
            ? 'No reviews match your search.'
            : 'No reviews available for this selection.'}
        </p>
      )}

      {!isReviewsLoading && filteredReviews.length > 0 && (
        <p className="mt-3 text-xs text-[#4A4557]/60">
          {filteredReviews.length} review{filteredReviews.length !== 1 ? 's' : ''}
          {normalizedSearch.length > 0 && reviews != null ? ` (${reviews.length} total)` : ''}
        </p>
      )}
    </div>
  )
}

function ClassPage() {
  const { courseId: courseCodeSlug } = Route.useParams()
  const courseCode = formatCourseCodeForDisplay(courseCodeSlug)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const { data: course, isPending } = useQuery(courseByCodeQueryOptions(DEFAULT_YEAR, courseCodeSlug))
  const { data: subjects } = useQuery(availableSubjectsQueryOptions(DEFAULT_YEAR))
  const validSubjects = useMemo(
    () => (subjects ? new Set(subjects.map((s) => s.code.toUpperCase())) : undefined),
    [subjects],
  )

  const [calendarKey, setCalendarKey] = useState(0)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [courseCodeSlug])

  const courseCodeStr = course
    ? `${course.subject_code} ${course.code_number}${course.code_suffix ?? ''}`
    : ''

  async function handleAddToQuarter(quarter: string) {
    if (!course) return
    try {
      const plan = await getUserPlan()
      if (!plan) return
      await addPlanCourse({
        data: {
          planId: plan.planId,
          actualYear: plan.startYear,
          quarter: quarter as 'Autumn' | 'Winter' | 'Spring' | 'Summer',
          courseCode: courseCodeStr,
          units: course.units_max,
        },
      })
      setCalendarKey((k) => k + 1)
    } catch (err) {
      console.error('[plan] addPlanCourse error:', err)
    }
  }

  async function handleRemoveFromQuarter(quarter: string) {
    if (!course) return
    try {
      const plan = await getUserPlan()
      if (!plan) return
      for (const [key, courses] of Object.entries(plan.planned)) {
        const q = key.split('-')[1]
        if (q !== quarter) continue
        const match = courses.find((c) => c.code === courseCodeStr)
        if (match) {
          await removePlanCourse({ data: { courseDbId: match.dbId } })
          setCalendarKey((k) => k + 1)
          break
        }
      }
    } catch (err) {
      console.error('[plan] removePlanCourse error:', err)
    }
  }

  if (!isPending && (course === null || course === undefined)) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-sky-50 font-['Satoshi']">
        <p className="text-lg text-[#4A4557]">Course not found.</p>
        <Link
          to="/courses"
          search={SEARCH_DEFAULTS as unknown as Required<SearchParams>}
          className="mt-4 text-primary underline-offset-2 hover:underline"
        >
          Back to search
        </Link>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-sky-50 font-['Satoshi']">
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@300,400,500,700&display=swap');
      `}</style>

      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-gradient-to-bl from-purple-300/30 via-blue-300/20 to-transparent blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl gap-6 px-4 pt-24 pb-14">
        <main className="min-w-0 flex-1">
          <div className="flex flex-col gap-8">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <h1 className="font-['Clash_Display'] text-6xl leading-none font-semibold tracking-tight text-[#150F21] md:text-7xl">
                    {courseCode}
                  </h1>
                  {isPending ? (
                    <div className="h-8 w-3/4 animate-pulse rounded bg-[#4A4557]/20" />
                  ) : (
                    <h2 className="text-2xl font-medium text-primary md:text-3xl">{course?.title ?? '—'}</h2>
                  )}
                  {!isPending && course && (
                    <p className="flex flex-wrap text-sm text-[#4A4557]">
                      {[
                        course.units_min === course.units_max
                          ? `${course.units_min} units`
                          : `${course.units_min} - ${course.units_max} units`,
                        course.gers?.length ? `GERs: ${course.gers.join(', ')}` : null,
                        course.grading_option || null,
                      ]
                        .filter(Boolean)
                        .map((item, i, arr) => (
                          <span key={i} className="whitespace-nowrap">
                            {item}
                            {i < arr.length - 1 && (
                              <span className="mx-1.5 inline-block h-[3px] w-[3px] rounded-full bg-[#4A4557]/40 align-middle" />
                            )}
                          </span>
                        ))}
                    </p>
                  )}
                  {!isPending &&
                  course != null &&
                  typeof course.description === 'string' &&
                  course.description.trim().length > 0 ? (
                    <DescriptionClamp
                      text={course.description}
                      expanded={descriptionExpanded}
                      onToggle={() => setDescriptionExpanded((prev) => !prev)}
                      maxHeight={192}
                      className="mt-2 text-base leading-relaxed text-[#4A4557]"
                      renderText={(t) => renderDescriptionWithLinks(t, validSubjects, DEFAULT_YEAR)}
                    />
                  ) : (
                    !isPending &&
                    course && <p className="mt-2 text-base text-[#4A4557]">No description available.</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-4 sm:min-w-[220px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/60 text-[#4A4557] shadow-sm backdrop-blur-xl transition-colors hover:bg-white/80 hover:text-[#150F21]"
                      aria-label="Like"
                    >
                      <ThumbsUp className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/60 text-[#4A4557] shadow-sm backdrop-blur-xl transition-colors hover:bg-white/80 hover:text-[#150F21]"
                      aria-label="Dislike"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {course && !isIndividualInstructionCourse(course.sections) && (
                    <CourseDetailsCard key={courseCodeSlug} course={course} />
                  )}
                </div>
              </div>
            </div>

            {!isPending && course && (
              <EvalDistributionSection
                course={course}
                courseCodeSlug={courseCodeSlug}
                hideInstructorSelector={isIndividualInstructionCourse(course.sections)}
              />
            )}

            {!isPending && course && (
              <TextReviewsSection
                course={course}
                courseCodeSlug={courseCodeSlug}
                hideInstructorSelector={isIndividualInstructionCourse(course.sections)}
              />
            )}
          </div>
        </main>

        {/* Weekly calendar sidebar — right */}
        <aside className="hidden w-[320px] shrink-0 lg:block">
          <div className="sticky top-28">
            <WeeklyCalendar
              year={DEFAULT_YEAR}
              courseCode={courseCodeStr || undefined}
              onAddToQuarter={
                course
                  ? (quarter) => {
                      void handleAddToQuarter(quarter)
                    }
                  : undefined
              }
              onRemoveFromQuarter={
                course
                  ? (quarter) => {
                      void handleRemoveFromQuarter(quarter)
                    }
                  : undefined
              }
              availableQuarters={
                course
                  ? [
                      ...new Set(
                        (course.sections ?? [])
                          .filter((s) => s.cancelled !== true && s.termQuarter !== '')
                          .map((s) => s.termQuarter),
                      ),
                    ]
                  : undefined
              }
              refreshTrigger={calendarKey}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
