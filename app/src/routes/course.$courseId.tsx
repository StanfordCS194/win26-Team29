import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { DescriptionClamp } from '@/components/courses/DescriptionClamp'
import { getEvalMetricMeta, getEvalValueColor } from '@/data/search/eval-metrics'
import { SLUG_LABEL } from '@/data/search/eval-questions'
import type { EvalSlug } from '@/data/search/eval-questions'
import { DEFAULT_YEAR } from '@/data/search/search.params'
import type { SearchCourseResult } from '@/data/search/search.params'
import {
  courseByCodeQueryOptions,
  evalDistributionQueryOptions,
  instructorCourseQuartersQueryOptions,
} from '@/components/courses/courses-query-options'
import { formatCourseCodeForDisplay } from '@/lib/course-code'
import { getCurrentQuarter, getNextQuarter } from '@/lib/quarter-utils'

export const Route = createFileRoute('/course/$courseId')({
  component: ClassPage,
})

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

  return (
    <div className="flex items-center justify-between">
      <span className="min-w-0 truncate">{instructor.name}</span>
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
}: {
  course: SearchCourseResult
  courseCodeSlug: string
}) {
  const { allInstructors, defaultSunets } = useDistributionDefaults(course)

  const [selectedSunets, setSelectedSunets] = useState<string[]>(defaultSunets)
  const [selectedQuarterKeys, setSelectedQuarterKeys] = useState<string[]>([])
  const [metric, setMetric] = useState<EvalSlug>('hours')

  const startYear = parseInt(DEFAULT_YEAR.split('-')[0]!, 10)
  const prevYear = `${startYear - 1}-${startYear}`
  const years = useMemo(() => [DEFAULT_YEAR, prevYear], [prevYear])

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

  const { data: distribution, isPending } = useQuery(
    evalDistributionQueryOptions({
      courseCodeSlug,
      quarterYears: selectedQuarterYears,
      instructorSunets: selectedSunets,
      metric,
    }),
  )

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

        {instructorOptions.length > 0 && (
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

      {isPending ? (
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

function ClassPage() {
  const { courseId: courseCodeSlug } = Route.useParams()
  const courseCode = formatCourseCodeForDisplay(courseCodeSlug)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const { data: course, isPending } = useQuery(courseByCodeQueryOptions(DEFAULT_YEAR, courseCodeSlug))

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [courseCodeSlug])

  if (!isPending && (course === null || course === undefined)) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-sky-50 font-['Satoshi']">
        <p className="text-lg text-[#4A4557]">Course not found.</p>
        <Link to="/courses" className="mt-4 text-primary underline-offset-2 hover:underline">
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

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-grow px-4 pt-24 pb-14">
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
                  />
                ) : (
                  !isPending &&
                  course && <p className="mt-2 text-base text-[#4A4557]">No description available.</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-4 sm:min-w-[220px]">
                <div className="flex items-center gap-2">
                  <button className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-xl">
                    Add to Plan
                  </button>
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
                {course && <CourseDetailsCard key={courseCodeSlug} course={course} />}
              </div>
            </div>
          </div>

          {!isPending && course && (
            <EvalDistributionSection course={course} courseCodeSlug={courseCodeSlug} />
          )}

          <div className="mt-8">
            <div className="mb-6 flex items-center gap-2.5">
              <div className="h-6 w-1 rounded-full bg-primary" />
              <h3 className="font-['Clash_Display'] text-2xl font-semibold text-[#150F21]">
                Student Reviews
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-md transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#150F21] text-xs font-bold text-white">
                      JD
                    </div>
                    <span className="text-sm font-bold text-[#150F21]">John D.</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span className="text-xs font-bold text-[#150F21]">4.8</span>
                  </div>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-[#4A4557]">
                  "Conrad is an absolute legend. The workload is heavy but fair. Make sure you actually read
                  the textbook before lecture."
                </p>
                <div className="flex gap-2">
                  <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Heavy Workload
                  </span>
                  <span className="rounded bg-white/60 px-2 py-1 text-xs text-[#4A4557]">Great Lectures</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-md transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      AS
                    </div>
                    <span className="text-sm font-bold text-[#150F21]">Alice S.</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span className="text-xs font-bold text-[#150F21]">4.2</span>
                  </div>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-[#4A4557]">
                  "Definitely a weeder class, but you learn a ton. The p-sets take about 10 hours a week, so
                  plan accordingly."
                </p>
                <div className="flex gap-2">
                  <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Challenging
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-md transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-900 text-xs font-bold text-white">
                      MK
                    </div>
                    <span className="text-sm font-bold text-[#150F21]">Mike K.</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span className="text-xs font-bold text-[#150F21]">5.0</span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[#4A4557]">
                  "One of the best math classes I've taken. It connects concepts really well. Don't skip
                  office hours!"
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
