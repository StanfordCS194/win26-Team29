import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { PLAN_QUERY_KEY } from '@/data/plan/plan-query-options'
import { getCourseReaction, setCourseReaction } from '@/data/reactions/reactions-server'
import type { ReactionType } from '@/data/reactions/reactions-server'
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

const INSTRUCTOR_VISIBLE_LIMIT = 4

function CourseDetailsCard({ course }: { course: SearchCourseResult }) {
  const instructorsByQuarter = getInstructorsByQuarter(course.sections ?? [])
  const qualityMap = course.instructorQualityBySunet
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set())

  function toggleQuarter(quarter: string) {
    setExpandedQuarters((prev) => {
      const next = new Set(prev)
      if (next.has(quarter)) next.delete(quarter)
      else next.add(quarter)
      return next
    })
  }

  return (
    <div>
      {instructorsByQuarter.size === 0 ? (
        <p className="text-sm text-slate-500">—</p>
      ) : (
        <div className="space-y-2">
          {Array.from(instructorsByQuarter.entries()).map(([quarter, instructors]) => {
            const isExpanded = expandedQuarters.has(quarter)
            const hasOverflow = instructors.length > INSTRUCTOR_VISIBLE_LIMIT
            const visible =
              hasOverflow && !isExpanded ? instructors.slice(0, INSTRUCTOR_VISIBLE_LIMIT) : instructors
            const hiddenCount = instructors.length - INSTRUCTOR_VISIBLE_LIMIT

            return (
              <div key={quarter} className="text-sm text-slate-600">
                <div className="font-semibold text-slate-800">{quarter}</div>
                {instructors.length ? (
                  <div className="mt-0.5 space-y-0.5 pl-3">
                    {visible.map((inst) => (
                      <InstructorRow
                        key={inst.sunet || inst.name}
                        instructor={inst}
                        qualityMap={qualityMap}
                      />
                    ))}
                    {hasOverflow && (
                      <button
                        type="button"
                        onClick={() => toggleQuarter(quarter)}
                        className="mt-0.5 text-[11px] text-primary/70 hover:text-primary hover:underline"
                      >
                        {isExpanded ? 'See less' : `+${hiddenCount} more`}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="ml-1.5">—</span>
                )}
              </div>
            )
          })}
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
          <span key={i} className="text-[10px] leading-tight text-slate-400">
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
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
        onClick={() => setOpen(!open)}
      >
        <span className="max-w-[160px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-48 min-w-[180px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-900 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="rounded border-slate-300"
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-base font-semibold text-slate-900">Evaluation Distribution</h3>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as EvalSlug)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
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
          <p className="mt-3 text-xs text-slate-400">
            Based on {distribution.totalResponses} response{distribution.totalResponses !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">No distribution data for this selection.</p>
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-primary" />
        <h3 className="text-base font-semibold text-slate-900">Student Reviews</h3>
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
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white focus:outline-none"
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
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-2 text-xs text-slate-400">
                <span className="font-medium text-slate-500">
                  {review.quarter} {review.year}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                {normalizedSearch.length > 0
                  ? highlightSearchMatch(review.responseText, normalizedSearch)
                  : review.responseText}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">
          {reviews != null && reviews.length > 0 && normalizedSearch.length > 0
            ? 'No reviews match your search.'
            : 'No reviews available for this selection.'}
        </p>
      )}

      {!isReviewsLoading && filteredReviews.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
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

  const queryClient = useQueryClient()
  const [calendarKey, setCalendarKey] = useState(0)

  const courseCodeStr = course
    ? `${course.subject_code} ${course.code_number}${course.code_suffix ?? ''}`
    : ''

  // ── Reactions ──────────────────────────────────────────────────────────────
  const [reactionData, setReactionData] = useState<{
    userReaction: ReactionType
    likes: number
    dislikes: number
  } | null>(null)
  const [reactionPending, setReactionPending] = useState(false)

  useEffect(() => {
    if (!courseCodeStr) return
    void getCourseReaction({ data: { courseCode: courseCodeStr } }).then(setReactionData)
  }, [courseCodeStr])

  async function handleReaction(reaction: 'like' | 'dislike') {
    if (reactionPending || !courseCodeStr) return
    setReactionPending(true)
    try {
      const next: ReactionType = reactionData?.userReaction === reaction ? null : reaction
      const updated = await setCourseReaction({ data: { courseCode: courseCodeStr, reaction: next } })
      setReactionData(updated)
    } catch {
      // not authenticated — ignore
    } finally {
      setReactionPending(false)
    }
  }

  const likePercent =
    reactionData && reactionData.likes + reactionData.dislikes >= 10
      ? Math.round((reactionData.likes / (reactionData.likes + reactionData.dislikes)) * 100)
      : null

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [courseCodeSlug])

  async function handleAddToQuarter(quarter: string, planYear?: number) {
    if (!course) return
    try {
      const plan = await getUserPlan()
      if (!plan) return
      const actualYear = planYear ?? plan.startYear
      await addPlanCourse({
        data: {
          planId: plan.planId,
          actualYear,
          quarter: quarter as 'Autumn' | 'Winter' | 'Spring' | 'Summer',
          courseCode: courseCodeStr,
          units: course.units_max,
        },
      })
      setCalendarKey((k) => k + 1)
      void queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEY })
    } catch (err) {
      console.error('[plan] addPlanCourse error:', err)
    }
  }

  async function handleRemoveFromQuarter(quarter: string, planYear?: number) {
    if (!course) return
    try {
      const plan = await getUserPlan()
      if (!plan) return
      const yearOffset = planYear != null ? planYear - plan.startYear : null
      for (const [key, courses] of Object.entries(plan.planned)) {
        const dashIdx = key.indexOf('-')
        const offset = parseInt(key.slice(0, dashIdx), 10)
        const q = key.slice(dashIdx + 1)
        if (q !== quarter) continue
        if (yearOffset !== null && offset !== yearOffset) continue
        const match = courses.find((c) => c.code === courseCodeStr)
        if (match) {
          await removePlanCourse({ data: { courseDbId: match.dbId } })
          setCalendarKey((k) => k + 1)
          void queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEY })
          break
        }
      }
    } catch (err) {
      console.error('[plan] removePlanCourse error:', err)
    }
  }

  if (!isPending && (course === null || course === undefined)) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-sky-50">
        <p className="text-lg text-slate-600">Course not found.</p>
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
    <div className="relative min-h-screen bg-sky-50">
      <div className="mx-auto flex max-w-6xl items-start gap-6 px-4 pt-8 pb-14">
        <main className="min-w-0 flex-1">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h1 className="text-2xl leading-snug font-bold text-slate-900 md:text-3xl">
                      {courseCode}
                    </h1>
                    {isPending ? (
                      <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
                    ) : (
                      <h2 className="text-xl font-normal text-slate-700 md:text-2xl">
                        {course?.title ?? '—'}
                      </h2>
                    )}
                  </div>
                  {!isPending && course && (
                    <p className="flex flex-wrap text-sm text-slate-400">
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
                              <span className="mx-1.5 inline-block h-[3px] w-[3px] rounded-full bg-slate-300 align-middle" />
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
                      className="mt-1 text-sm leading-relaxed text-slate-600"
                      renderText={(t) => renderDescriptionWithLinks(t, validSubjects, DEFAULT_YEAR)}
                    />
                  ) : (
                    !isPending &&
                    course && <p className="mt-1 text-sm text-slate-500">No description available.</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleReaction('like')}
                      disabled={reactionPending}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-colors disabled:opacity-60 ${
                        reactionData?.userReaction === 'like'
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                      aria-label="Like"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReaction('dislike')}
                      disabled={reactionPending}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-colors disabled:opacity-60 ${
                        reactionData?.userReaction === 'dislike'
                          ? 'border-red-300 bg-red-50 text-red-500 hover:bg-red-100'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                      aria-label="Dislike"
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </button>
                  </div>
                  {reactionData !== null && reactionData.likes + reactionData.dislikes >= 10 && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                          style={{ width: `${likePercent}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {likePercent}% liked
                      </span>
                    </div>
                  )}
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
          <div className="sticky top-8">
            <WeeklyCalendar
              year={DEFAULT_YEAR}
              courseCode={courseCodeStr || undefined}
              onAddToQuarter={
                course
                  ? (quarter, planYear) => {
                      void handleAddToQuarter(quarter, planYear)
                    }
                  : undefined
              }
              onRemoveFromQuarter={
                course
                  ? (quarter, planYear) => {
                      void handleRemoveFromQuarter(quarter, planYear)
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
