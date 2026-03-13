import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addPlanCourse, removePlanCourse, searchCoursesForPlan } from '@/data/plan/plan-server'
import type { PlanSearchResult } from '@/data/plan/plan-server'
import { planQueryOptions } from '@/data/plan/plan-query-options'
import { getCourseByCode } from '@/data/search/search'
import { toCourseCodeSlug } from '@/lib/course-code'
import { getCurrentQuarter } from '@/lib/quarter-utils'
import { SLUG_TO_QUESTION_TEXT } from '@/data/search/eval-questions'

export const Route = createFileRoute('/schedule')({ component: SchedulePage })

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
type DayKey = (typeof DAYS)[number]

const DAY_MAP: Record<string, DayKey> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
}

const QUARTERS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const

const SLOT_MINUTES = 60
const START_MIN = 8 * 60
const END_MIN = 19 * 60
const SLOT_COUNT = (END_MIN - START_MIN) / SLOT_MINUTES
const ROW_HEIGHT = 28

const HOURS_QUESTION_TEXT = SLUG_TO_QUESTION_TEXT.hours
const QUALITY_QUESTION_TEXT = SLUG_TO_QUESTION_TEXT.quality

function slotLabel(index: number): string {
  const totalMin = START_MIN + index * SLOT_MINUTES
  const h = Math.floor(totalMin / 60)
  if (h === 0) return '12:00 AM'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

function parseTime(t: string): number {
  const [hh, mm] = t.split(':').map(Number)
  return hh! * 60 + (mm ?? 0)
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const hour = h % 12 || 12
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

const BLOCK_COLORS = [
  { bg: 'rgba(140,21,21,0.12)', text: '#3b0b0b', border: 'rgba(140,21,21,0.25)' },
  { bg: 'rgba(99,102,241,0.15)', text: '#3730a3', border: 'rgba(99,102,241,0.3)' },
  { bg: 'rgba(16,185,129,0.15)', text: '#065f46', border: 'rgba(16,185,129,0.3)' },
  { bg: 'rgba(245,158,11,0.15)', text: '#92400e', border: 'rgba(245,158,11,0.3)' },
  { bg: 'rgba(6,182,212,0.15)', text: '#155e75', border: 'rgba(6,182,212,0.3)' },
  { bg: 'rgba(168,85,247,0.15)', text: '#6b21a8', border: 'rgba(168,85,247,0.3)' },
  { bg: 'rgba(249,115,22,0.15)', text: '#9a3412', border: 'rgba(249,115,22,0.3)' },
]

type ScheduleBlock = {
  code: string
  title: string
  day: DayKey
  startMin: number
  endMin: number
  location: string | null
  colorIdx: number
}

// Enriched course data with units, hours, rating
type EnrichedCourse = {
  code: string
  dbId: string
  title: string
  units: number
  medianHours: number | null
  rating: number | null
  timing: string
  colorIdx: number
  enrollStatus: string | null
  enrolled: number | null
  maxEnrolled: number | null
  instructors: string[]
}

type SortOption = 'name' | 'units' | 'hours' | 'rating'

// ── Overlap layout ───────────────────────────────────────────────────

type LayoutBlock = ScheduleBlock & { column: number; totalColumns: number }

function layoutBlocksForDay(dayBlocks: ScheduleBlock[]): LayoutBlock[] {
  if (dayBlocks.length === 0) return []

  const sorted = [...dayBlocks].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - b.startMin - (a.endMin - a.startMin),
  )

  const columnEnds: number[] = []
  const assigned: { block: ScheduleBlock; column: number }[] = []

  for (const block of sorted) {
    let col = -1
    for (let c = 0; c < columnEnds.length; c++) {
      if (columnEnds[c]! <= block.startMin) {
        col = c
        break
      }
    }
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(0)
    }
    columnEnds[col] = block.endMin
    assigned.push({ block, column: col })
  }

  const n = assigned.length
  const parent = Array.from({ length: n }, (_, i) => i)
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  function union(a: number, b: number) {
    const ra = find(a),
      rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = assigned[i]!.block,
        b = assigned[j]!.block
      if (a.startMin < b.endMin && a.endMin > b.startMin) union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }

  const result: LayoutBlock[] = []
  for (const indices of groups.values()) {
    const totalColumns = Math.max(...indices.map((i) => assigned[i]!.column)) + 1
    for (const i of indices) {
      result.push({ ...assigned[i]!.block, column: assigned[i]!.column, totalColumns })
    }
  }
  return result
}

// ── Conflict detection ───────────────────────────────────────────────

type Conflict = { courseA: string; courseB: string; day: DayKey; overlapMin: number }

function detectConflicts(blocks: ScheduleBlock[]): Conflict[] {
  const conflicts: Conflict[] = []
  const seen = new Set<string>()
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!,
        b = blocks[j]!
      if (a.day !== b.day || a.code === b.code) continue
      if (a.startMin < b.endMin && a.endMin > b.startMin) {
        const key = [a.code, b.code].sort().join('|') + '|' + a.day
        if (seen.has(key)) continue
        seen.add(key)
        const overlapStart = Math.max(a.startMin, b.startMin)
        const overlapEnd = Math.min(a.endMin, b.endMin)
        conflicts.push({
          courseA: a.code,
          courseB: b.code,
          day: a.day,
          overlapMin: overlapEnd - overlapStart,
        })
      }
    }
  }
  return conflicts
}

// ── Academic year helpers ────────────────────────────────────────────

function getActualYear(academicStartYear: number, quarter: string): number {
  return quarter === 'Autumn' ? academicStartYear : academicStartYear + 1
}

function formatAcademicYear(startYear: number): string {
  return `${startYear}–${startYear + 1}`
}

// ── Course Browser Panel ─────────────────────────────────────────────

function CourseBrowser({
  planId,
  academicYear,
  quarter,
}: {
  planId: string | null
  academicYear: number
  quarter: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlanSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingCode, setAddingCode] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q === '') {
      setResults([])
      return
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setSearching(true)
      searchCoursesForPlan({ data: { query: q } })
        .then(setResults)
        .catch((err: unknown) => {
          console.error('Course search failed:', err)
          setResults([])
        })
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [query])

  useEffect(() => {
    if (open && inputRef.current !== null) {
      inputRef.current.focus()
    }
  }, [open])

  const handleAdd = (course: PlanSearchResult) => {
    if (planId === null) return
    setAddingCode(course.code)

    void addPlanCourse({
      data: {
        planId,
        actualYear: academicYear,
        quarter: quarter as 'Autumn' | 'Winter' | 'Spring' | 'Summer',
        courseCode: course.code,
        units: course.unitsMax,
      },
    })
      .then(() => {
        setAddingCode(null)
        void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey })
      })
      .catch(() => {
        setAddingCode(null)
      })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2.5 text-xs text-slate-500 transition hover:border-slate-400 hover:bg-white hover:text-slate-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        Add a course
      </button>
    )
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <h3 className="text-xs font-semibold text-slate-700">Add a course</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setQuery('')
            setResults([])
          }}
          className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close course browser"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="CS 106A, machine learning..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#8C1515] focus:ring-1 focus:ring-[#8C1515] focus:outline-none"
          />
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto px-2 pb-2">
        {searching && (
          <div className="flex items-center justify-center py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
          </div>
        )}

        {!searching && query.trim() !== '' && results.length === 0 && (
          <p className="py-3 text-center text-[11px] text-slate-400">No courses found</p>
        )}

        {results.length > 0 && (
          <ul className="space-y-1">
            {results.map((course) => {
              const offeredThisQuarter = course.quarters.includes(quarter)
              const isAdding = addingCode === course.code
              return (
                <li
                  key={course.code}
                  className={`rounded-lg border px-2.5 py-2 transition ${
                    offeredThisQuarter
                      ? 'border-slate-100 bg-slate-50/80 hover:border-slate-200 hover:bg-slate-100/80'
                      : 'border-slate-100 bg-slate-50/40 opacity-55'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-800">{course.code}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {course.unitsMin === course.unitsMax
                            ? `${course.unitsMin}u`
                            : `${course.unitsMin}–${course.unitsMax}u`}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">
                        {course.title}
                      </p>
                      {!offeredThisQuarter && (
                        <p className="mt-0.5 text-[9px] text-amber-600">
                          Not in {quarter}
                          {course.quarters.length > 0 && (
                            <span className="text-slate-400"> · {course.quarters.join(', ')}</span>
                          )}
                        </p>
                      )}
                    </div>
                    {offeredThisQuarter && planId !== null && (
                      <button
                        type="button"
                        disabled={isAdding}
                        onClick={() => handleAdd(course)}
                        className="mt-0.5 shrink-0 rounded-md bg-[#8C1515] px-2 py-0.5 text-[10px] font-medium text-white shadow-sm transition hover:bg-[#7A1212] disabled:opacity-50"
                      >
                        {isAdding ? '...' : 'Add'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {query.trim() === '' && (
          <p className="py-3 text-center text-[11px] text-slate-400">Search by code or title</p>
        )}
      </div>
    </div>
  )
}

// ── Sort label helper ────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'units', label: 'Units' },
  { value: 'hours', label: 'Hours/wk' },
  { value: 'rating', label: 'Rating' },
]

function sortCourses(courses: EnrichedCourse[], sort: SortOption): EnrichedCourse[] {
  return [...courses].sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.code.localeCompare(b.code)
      case 'units':
        return b.units - a.units
      case 'hours':
        return (b.medianHours ?? 0) - (a.medianHours ?? 0)
      case 'rating':
        return (b.rating ?? 0) - (a.rating ?? 0)
    }
  })
}

// ── Rating stars ─────────────────────────────────────────────────────

function RatingDisplay({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] text-slate-300">No rating</span>
  const full = Math.floor(value)
  const partial = value - full
  return (
    <span className="inline-flex items-center gap-0.5" title={`${value.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        let fill: string
        if (i < full) fill = 'text-amber-400'
        else if (i === full && partial >= 0.5) fill = 'text-amber-300'
        else fill = 'text-slate-200'
        return (
          <svg key={i} className={`h-2.5 w-2.5 ${fill}`} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )
      })}
      <span className="ml-0.5 text-[10px] font-medium text-slate-500">{value.toFixed(1)}</span>
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────

type PlanCourse = { code: string; dbId: string; units: number; quarter: string; actualYear: number }

function SchedulePage() {
  const queryClient = useQueryClient()

  // Navigation state: academic year start + quarter index
  const [academicYear, setAcademicYear] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const date = now.getDate()
    const onOrAfterAug25 = month > 7 || (month === 7 && date >= 25)
    return onOrAfterAug25 ? year : year - 1
  })
  const [quarterIdx, setQuarterIdx] = useState(() => {
    const current = getCurrentQuarter()
    const idx = QUARTERS.indexOf(current as (typeof QUARTERS)[number])
    return idx >= 0 ? idx : 0
  })

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [enrichedCourses, setEnrichedCourses] = useState<EnrichedCourse[]>([])
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [removingId, setRemovingId] = useState<string | null>(null)

  const quarter = QUARTERS[quarterIdx]!

  // Navigate quarters with year rollover
  const goNext = () => {
    if (quarterIdx < QUARTERS.length - 1) {
      setQuarterIdx(quarterIdx + 1)
    } else {
      setAcademicYear(academicYear + 1)
      setQuarterIdx(0)
    }
  }
  const goPrev = () => {
    if (quarterIdx > 0) {
      setQuarterIdx(quarterIdx - 1)
    } else {
      setAcademicYear(academicYear - 1)
      setQuarterIdx(QUARTERS.length - 1)
    }
  }

  // Load plan via shared query (synced with plan.tsx)
  const { data: planData, isPending: loading } = useQuery(planQueryOptions)
  const planId = planData?.planId ?? null

  const planCourses = useMemo<PlanCourse[]>(() => {
    if (!planData) return []
    const courses: PlanCourse[] = []
    for (const [key, list] of Object.entries(planData.planned)) {
      const dashIdx = key.indexOf('-')
      const yearOffset = parseInt(key.slice(0, dashIdx), 10)
      const q = key.slice(dashIdx + 1)
      const actualYear = planData.startYear + yearOffset
      for (const c of list) {
        courses.push({ code: c.code, dbId: c.dbId, units: c.units, quarter: q, actualYear })
      }
    }
    return courses
  }, [planData])

  // Filter courses for current quarter + year.
  // The plan page stores all quarters of an academic year with the same year (the start year),
  // so we match on academicYear directly, not the calendar year of the quarter.
  const coursesInQuarter = useMemo(() => {
    return planCourses.filter((c) => c.quarter === quarter && c.actualYear === academicYear)
  }, [planCourses, quarter, academicYear])

  const coursesKey = useMemo(
    () =>
      coursesInQuarter
        .map((c) => c.code)
        .sort()
        .join(','),
    [coursesInQuarter],
  )

  // Resolve schedules + enriched data
  const resolveIdRef = useRef(0)
  useEffect(() => {
    if (coursesInQuarter.length === 0) {
      setBlocks([])
      setEnrichedCourses([])
      return
    }
    const id = ++resolveIdRef.current
    const yearStr = `${academicYear}-${academicYear + 1}`

    void Promise.allSettled(
      coursesInQuarter.map((c, i) => {
        const parts = c.code.split(' ')
        const numMatch = parts[1]?.match(/^(\d+)(.*)$/)
        const slug = toCourseCodeSlug({
          subjectCode: parts[0]!,
          codeNumber: parseInt(numMatch?.[1] ?? '0', 10),
          codeSuffix: numMatch?.[2] != null && numMatch[2] !== '' ? numMatch[2] : null,
        })
        return getCourseByCode({ data: { courseCodeSlug: slug, year: yearStr } }).then((result) => ({
          planCourse: c,
          result,
          colorIdx: i,
        }))
      }),
    )
      .then((results) => {
        if (resolveIdRef.current !== id) return
        const newBlocks: ScheduleBlock[] = []
        const newEnriched: EnrichedCourse[] = []

        for (const settled of results) {
          if (settled.status !== 'fulfilled' || !settled.value.result) continue
          const { planCourse: c, result, colorIdx } = settled.value
          const sections = (result.sections ?? []).filter(
            (s) => s.termQuarter === quarter && !s.cancelled && (s.unitsMin != null || s.unitsMax != null),
          )
          const sec = sections[0]

          // Extract evaluations from any matching section
          let medianHours: number | null = null
          let rating: number | null = null
          for (const s of result.sections ?? []) {
            for (const ev of s.smartEvaluations ?? []) {
              if (ev.question === HOURS_QUESTION_TEXT && medianHours === null) {
                medianHours = ev.smartAverage
              }
              if (ev.question === QUALITY_QUESTION_TEXT && rating === null) {
                rating = ev.smartAverage
              }
            }
            if (medianHours !== null && rating !== null) break
          }

          // Extract instructors
          const instructorNames: string[] = []
          if (sec != null) {
            for (const sched of sec.schedules ?? []) {
              for (const inst of sched.instructors ?? []) {
                if (!instructorNames.includes(inst.name)) instructorNames.push(inst.name)
              }
            }
          }

          // Build schedule blocks
          const courseBlocks: ScheduleBlock[] = []
          if (sec != null) {
            for (const sched of sec.schedules ?? []) {
              const days = sched.days ?? []
              if (
                sched.startTime == null ||
                sched.startTime === '' ||
                sched.endTime == null ||
                sched.endTime === '' ||
                days.length === 0
              )
                continue
              const startMin = parseTime(sched.startTime)
              const endMin = parseTime(sched.endTime)
              for (const dayName of days) {
                const day = DAY_MAP[dayName]
                if (!day) continue
                const block: ScheduleBlock = {
                  code: c.code,
                  title: result.title,
                  day,
                  startMin,
                  endMin,
                  location: sched.location ?? null,
                  colorIdx,
                }
                newBlocks.push(block)
                courseBlocks.push(block)
              }
            }
          }

          // Build timing string
          const dayList = [...new Set(courseBlocks.map((b) => b.day))].join(', ')
          const firstBlock = courseBlocks[0]
          const timeStr =
            firstBlock !== undefined
              ? `${formatTime(firstBlock.startMin)}–${formatTime(firstBlock.endMin)}`
              : ''
          const timing = dayList && timeStr ? `${dayList} · ${timeStr}` : 'No schedule data'

          newEnriched.push({
            code: c.code,
            dbId: c.dbId,
            title: result.title,
            units: c.units,
            medianHours,
            rating,
            timing,
            colorIdx,
            enrollStatus: sec?.enrollStatus ?? null,
            enrolled: sec?.numEnrolled ?? null,
            maxEnrolled: sec?.maxEnrolled ?? null,
            instructors: instructorNames,
          })
        }

        // Also add courses that didn't resolve (no data found)
        for (const c of coursesInQuarter) {
          if (!newEnriched.some((e) => e.code === c.code)) {
            newEnriched.push({
              code: c.code,
              dbId: c.dbId,
              title: '',
              units: c.units,
              medianHours: null,
              rating: null,
              timing: 'No schedule data',
              colorIdx: coursesInQuarter.indexOf(c),
              enrollStatus: null,
              enrolled: null,
              maxEnrolled: null,
              instructors: [],
            })
          }
        }

        setBlocks(newBlocks)
        setEnrichedCourses(newEnriched)
      })
      .catch(() => {})
  }, [coursesKey, quarter, academicYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const layoutByDay = useMemo(() => {
    const map = new Map<DayKey, LayoutBlock[]>()
    for (const day of DAYS) {
      map.set(day, layoutBlocksForDay(blocks.filter((b) => b.day === day)))
    }
    return map
  }, [blocks])

  const conflicts = useMemo(() => detectConflicts(blocks), [blocks])

  const sortedCourses = useMemo(() => sortCourses(enrichedCourses, sortBy), [enrichedCourses, sortBy])

  const totalUnits = useMemo(() => coursesInQuarter.reduce((sum, c) => sum + c.units, 0), [coursesInQuarter])

  const totalHours = useMemo(() => {
    const hoursValues = enrichedCourses.filter((c) => c.medianHours !== null).map((c) => c.medianHours!)
    if (hoursValues.length === 0) return null
    return hoursValues.reduce((sum, h) => sum + h, 0)
  }, [enrichedCourses])

  const handleRemoveCourse = (dbId: string) => {
    setRemovingId(dbId)
    void removePlanCourse({ data: { courseDbId: dbId } })
      .then(() => {
        setRemovingId(null)
        void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey })
      })
      .catch(() => {
        setRemovingId(null)
      })
  }

  const times = Array.from({ length: SLOT_COUNT }, (_, i) => i)
  const gridHeight = SLOT_COUNT * ROW_HEIGHT

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-10 pb-16">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-normal text-slate-900">Weekly schedule</h1>
            <p className="mt-1 text-sm text-slate-600">
              Visualize how your classes fit together across the week.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Year + quarter navigation */}
            <div className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1.5 text-sm text-white">
              <button type="button" onClick={goPrev} className="px-1 transition hover:text-slate-300">
                &larr;
              </button>
              <span className="min-w-[140px] text-center font-medium">
                {quarter} {formatAcademicYear(academicYear)}
              </span>
              <button type="button" onClick={goNext} className="px-1 transition hover:text-slate-300">
                &rarr;
              </button>
            </div>
            <Link
              to="/plan"
              className="rounded-full bg-[#8C1515] px-4 py-2 text-sm font-normal text-white shadow-sm transition hover:bg-[#7A1212]"
            >
              Edit plan
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.85fr)]">
          {/* Sidebar */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
              {quarter} {getActualYear(academicYear, quarter)}
            </h2>

            {/* Summary card */}
            <div
              className="rounded-2xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 shadow-sm"
              aria-label="Load summary"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Courses</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{coursesInQuarter.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Units</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{totalUnits}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Hrs/wk</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {totalHours !== null ? `${totalHours.toFixed(1)}` : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Conflict warnings */}
            {conflicts.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
                  Schedule conflicts
                </p>
                <ul className="mt-1.5 space-y-1">
                  {conflicts.map((c, i) => (
                    <li key={i} className="text-[11px] text-amber-700">
                      <span className="font-medium">{c.courseA}</span> &amp;{' '}
                      <span className="font-medium">{c.courseB}</span> overlap {c.overlapMin}min on {c.day}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sort controls */}
            {enrichedCourses.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                  Sort by
                </span>
                <div className="flex gap-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSortBy(opt.value)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                        sortBy === opt.value
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Course list */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              </div>
            ) : sortedCourses.length > 0 ? (
              <div className="space-y-2">
                {sortedCourses.map((course) => {
                  const color = BLOCK_COLORS[course.colorIdx % BLOCK_COLORS.length]!
                  const isRemoving = removingId === course.dbId
                  const courseId = toCourseCodeSlug({
                    subjectCode: course.code.split(' ')[0]!,
                    codeNumber: parseInt(course.code.split(' ')[1]?.match(/^\d+/)?.[0] ?? '0', 10),
                    codeSuffix: course.code.split(' ')[1]?.replace(/^\d+/, '') || null,
                  })
                  return (
                    <div
                      key={course.dbId}
                      className="group rounded-xl border bg-white p-3 shadow-sm transition hover:shadow-md"
                      style={{ borderColor: color.border }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: color.text }}
                            />
                            <Link
                              to="/course/$courseId"
                              params={{ courseId }}
                              className="text-xs font-semibold text-slate-800 transition hover:text-[#8C1515]"
                            >
                              {course.code}
                            </Link>
                            <span className="text-[10px] text-slate-400">{course.units}u</span>
                          </div>
                          {course.title && (
                            <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-600">
                              {course.title}
                            </p>
                          )}
                          <p className="mt-0.5 text-[10px] text-slate-400">{course.timing}</p>
                          {course.instructors.length > 0 && (
                            <p className="mt-0.5 truncate text-[10px] text-slate-400">
                              {course.instructors.join(', ')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isRemoving}
                          onClick={() => handleRemoveCourse(course.dbId)}
                          className="mt-0.5 shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                          aria-label={`Remove ${course.code}`}
                          title="Remove from schedule"
                        >
                          {isRemoving ? (
                            <div className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-500" />
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                            >
                              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* Metrics row */}
                      <div className="mt-2 flex items-center gap-3 border-t border-slate-50 pt-2">
                        {course.medianHours !== null && (
                          <span className="text-[10px] text-slate-500">
                            <span className="font-medium">{course.medianHours.toFixed(1)}</span> hrs/wk
                          </span>
                        )}
                        <RatingDisplay value={course.rating} />
                        {course.enrollStatus !== null && course.enrolled !== null && (
                          <span
                            className={`ml-auto text-[10px] font-medium ${
                              course.enrollStatus === 'Open'
                                ? 'text-emerald-600'
                                : course.enrollStatus === 'Waitlist'
                                  ? 'text-amber-600'
                                  : 'text-red-500'
                            }`}
                          >
                            {course.enrollStatus === 'Open'
                              ? `${course.enrolled}/${course.maxEnrolled}`
                              : course.enrollStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">
                  No courses planned for {quarter} {getActualYear(academicYear, quarter)}.
                </p>
                <Link
                  to="/plan"
                  className="mt-2 inline-block text-sm font-medium text-[#8C1515] underline-offset-2 hover:underline"
                >
                  Add courses in your plan
                </Link>
              </div>
            )}

            <CourseBrowser planId={planId} academicYear={academicYear} quarter={quarter} />
          </section>

          {/* Calendar */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
              Week at a glance
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs font-medium text-slate-500">
                <div />
                {DAYS.map((day) => (
                  <div key={day} className="text-center">
                    {day}
                  </div>
                ))}
              </div>

              <div
                className="grid"
                style={{
                  gridTemplateColumns: '64px repeat(5, minmax(0, 1fr))',
                  padding: 8,
                }}
              >
                {/* Time label column */}
                <div style={{ height: gridHeight }}>
                  {times.map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-end pr-2 text-[11px] font-medium text-slate-400"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {slotLabel(i)}
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {DAYS.map((day) => {
                  const dayLayout = layoutByDay.get(day) ?? []
                  return (
                    <div key={day} className="relative" style={{ height: gridHeight }}>
                      {/* Hour backgrounds */}
                      {times.map((i) => (
                        <div
                          key={i}
                          className="border-b border-slate-100/60 bg-slate-50/30"
                          style={{ height: ROW_HEIGHT }}
                        />
                      ))}

                      {/* Event blocks */}
                      {dayLayout.map((block, idx) => {
                        const top = ((block.startMin - START_MIN) / SLOT_MINUTES) * ROW_HEIGHT
                        const height = ((block.endMin - block.startMin) / SLOT_MINUTES) * ROW_HEIGHT
                        const leftPct = (block.column / block.totalColumns) * 100
                        const widthPct = (1 / block.totalColumns) * 100
                        const color = BLOCK_COLORS[block.colorIdx % BLOCK_COLORS.length]!

                        return (
                          <div
                            key={`${block.code}-${idx}`}
                            className="absolute rounded-md border"
                            style={{
                              top,
                              height: Math.max(height - 2, ROW_HEIGHT - 2),
                              left: `calc(${leftPct}% + 1px)`,
                              width: `calc(${widthPct}% - 2px)`,
                              backgroundColor: color.bg,
                              borderColor: color.border,
                              color: color.text,
                            }}
                          >
                            <div className="flex h-full flex-col overflow-hidden px-1.5 py-1 text-[10px]">
                              <p className="leading-tight font-semibold tracking-[0.08em]">{block.code}</p>
                              <p className="mt-0.5 text-[9px] leading-tight text-slate-600">
                                {formatTime(block.startMin)}–{formatTime(block.endMin)}
                                {block.location != null ? ` · ${block.location}` : ''}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
