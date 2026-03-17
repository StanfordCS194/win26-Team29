import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical, Plus, Trash2, X, Check } from 'lucide-react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toCourseCodeSlug } from '@/lib/course-code'
import { Button } from '@/components/ui/button'
import { parseTranscriptPDF } from '@/lib/parse-transcript'
import {
  getUserPlan,
  addPlanCourse,
  removePlanCourse,
  addStashCourse,
  removeStashCourse,
  resetPlan,
  searchCoursesForPlan,
  getCoursesGers,
  updateWayOverrides,
  type PlanSearchResult,
} from '@/data/plan/plan-server'
import { planQueryOptions } from '@/data/plan/plan-query-options'
import { userQueryOptions } from '@/data/auth'

export const Route = createFileRoute('/plan')({ component: PlanPage })

const TERMS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const
type TermKey = (typeof TERMS)[number]

type PlannedCourse = { code: string; title: string; units: number; dbId?: string }

const PLAN_SPAN_STORAGE_KEY = 'plan-span'

function getStoredPlanSpan(): number {
  if (typeof window === 'undefined') return 4
  const stored = localStorage.getItem(PLAN_SPAN_STORAGE_KEY)
  if (stored == null) return 4
  const n = parseInt(stored, 10)
  return n >= 1 && n <= 5 ? n : 4
}

function PlanGrid({
  startYear,
  planSpan,
  getPlanned,
  getTermUnits,
  getYearUnits,
  removeFromPlanned,
  addToPlanned: _addToPlanned,
}: {
  startYear: number
  planSpan: number
  getPlanned: (yi: number, term: TermKey) => PlannedCourse[]
  getTermUnits: (courses: PlannedCourse[]) => number
  getYearUnits: (yi: number) => number
  removeFromPlanned: (yi: number, term: TermKey, code: string) => void
  addToPlanned: (yi: number, term: TermKey, course: PlannedCourse) => void
}) {
  const gridColsClass =
    planSpan === 1
      ? 'grid-cols-1'
      : planSpan === 2
        ? 'grid-cols-2'
        : planSpan === 3
          ? 'grid-cols-3'
          : planSpan === 4
            ? 'grid-cols-4'
            : 'grid-cols-5'

  const gapClass =
    planSpan === 1
      ? 'gap-6'
      : planSpan === 2
        ? 'gap-5'
        : planSpan === 3
          ? 'gap-4'
          : planSpan === 4
            ? 'gap-3'
            : 'gap-2'

  return (
    <div className="w-full min-w-0 overflow-auto">
      <div className={`grid w-full min-w-0 ${gridColsClass} ${gapClass}`}>
        {Array.from({ length: planSpan }, (_, i) => i).map((yi) => {
          const yr = startYear + yi
          const yearLabel = `${yr}–${String(yr + 1).slice(-2)}`
          return (
            <div key={yi} className="flex flex-col rounded-2xl bg-white p-3 shadow-sm">
              {/* Year header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-base font-medium text-slate-800">{yearLabel}</span>
                <span className="rounded-full bg-slate-100/80 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {getYearUnits(yi)} units
                </span>
              </div>

              {/* Quarters */}
              <div className="flex flex-col gap-2">
                {TERMS.map((term) => {
                  const courses = getPlanned(yi, term)
                  const termUnits = getTermUnits(courses)
                  return (
                    <div key={term} className="rounded-lg bg-slate-50/60 px-2.5 py-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium text-slate-700">{term}</p>
                          <Link
                            to="/schedule"
                            search={{ year: yr, quarter: term }}
                            className="text-slate-400 transition hover:text-slate-600"
                            title={`View ${term} ${yr}–${yr + 1} schedule`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3 w-3"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </Link>
                        </div>
                        <span className="text-[10px] text-slate-500">{termUnits} units</span>
                      </div>
                      <DroppableZone
                        id={plannedDropId(yi, term)}
                        className="flex min-h-[1.75rem] flex-wrap gap-1.5"
                      >
                        {courses.map((c) => (
                          <CourseBox
                            key={c.code}
                            id={`planned-${yi}-${term}-${c.code}`}
                            course={c}
                            source={{ type: 'planned', yearIndex: yi, term }}
                            variant="planned"
                            onRemove={() => removeFromPlanned(yi, term, c.code)}
                          />
                        ))}
                      </DroppableZone>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Key by actual calendar year so courses stay with their year when startYear changes */
function absoluteQuarterKey(actualYear: number, term: TermKey) {
  return `${actualYear}-${term}`
}

const DEFAULT_START_YEAR = 2024
const INITIAL_PLANNED: Record<string, PlannedCourse[]> = {}

// Drag-and-drop: payload and drop id helpers
type DragSource =
  | { type: 'global' }
  | { type: 'search' }
  | { type: 'planned'; yearIndex: number; term: TermKey }
  | { type: 'stash'; yearIndex: number; term: TermKey }
function plannedDropId(yearIndex: number, term: TermKey) {
  return `planned-${yearIndex}-${term}`
}
const GLOBAL_STASH_DROP_ID = 'global-stash'
const DELETE_DROP_ID = 'delete-course'

function DeleteDropZone({ isDragging }: { isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: DELETE_DROP_ID })
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-[11px] font-medium transition-all duration-150 ${
        isDragging
          ? isOver
            ? 'scale-105 border-red-400 bg-red-50 text-red-500 shadow-md'
            : 'border-red-300 bg-red-50/60 text-red-400'
          : 'border-slate-200 bg-slate-50/50 text-slate-400'
      }`}
    >
      <Trash2 className={`transition-transform duration-150 ${isOver ? 'size-4 scale-110' : 'size-3.5'}`} />
      <span>{isOver ? 'Release to remove' : isDragging ? 'Drop to remove' : 'Drag here to remove'}</span>
    </div>
  )
}

function DraggableSearchResult({ result }: { result: PlanSearchResult }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `search-${result.code}`,
    data: {
      course: { code: result.code, title: result.title, units: result.unitsMax },
      source: { type: 'search' } satisfies DragSource,
    },
  })
  const parts = result.code.match(/^([A-Za-z]+(?:\s[A-Za-z]+)?)\s+(\d+)([A-Za-z]*)$/)
  const courseId = parts
    ? toCourseCodeSlug({
        subjectCode: parts[1]!,
        codeNumber: parseInt(parts[2]!, 10),
        codeSuffix: parts[3] || null,
      })
    : result.code.replace(' ', '').toLowerCase()

  return (
    <li
      ref={setNodeRef}
      className={`flex flex-col gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-xs ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span
            {...listeners}
            {...attributes}
            className="-ml-0.5 cursor-grab touch-none p-0.5 text-slate-300 active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical className="size-3" />
          </span>
          <Link
            to="/course/$courseId"
            params={{ courseId }}
            className="font-medium text-slate-800 transition hover:text-[#8C1515]"
          >
            {result.code}
          </Link>
        </div>
        <span className="text-[10px] text-slate-400">
          {result.unitsMin === result.unitsMax ? result.unitsMin : `${result.unitsMin}–${result.unitsMax}`}{' '}
          units
        </span>
      </div>
      <p className="truncate text-[10px] text-slate-500">{result.title}</p>
    </li>
  )
}

function CourseBox({
  id,
  course,
  source,
  variant,
  onMoveToPlanned,
  onRemove,
}: {
  id: string
  course: PlannedCourse
  source: DragSource
  variant: 'planned' | 'stash' | 'global'
  onMoveToPlanned?: () => void
  onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { course, source },
  })
  const navigate = useNavigate()

  function handleDoubleClick() {
    const parts = course.code.match(/^([A-Za-z]+(?:\s[A-Za-z]+)?)\s+(\d+)([A-Za-z]*)$/)
    if (!parts) return
    const slug = toCourseCodeSlug({
      subjectCode: parts[1]!,
      codeNumber: parseInt(parts[2]!, 10),
      codeSuffix: parts[3] || null,
    })
    void navigate({ to: '/course/$courseId', params: { courseId: slug } })
  }

  const base =
    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-sm transition'
  const variantClass =
    variant === 'planned'
      ? 'border-slate-300 bg-white text-slate-800 hover:border-primary/50'
      : variant === 'stash'
        ? 'border-amber-300 bg-amber-50 text-slate-800 hover:border-amber-400'
        : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300'
  return (
    <div ref={setNodeRef} className={`${base} ${variantClass} ${isDragging ? 'opacity-50' : ''}`}>
      <span
        {...listeners}
        {...attributes}
        className="-ml-1 flex shrink-0 cursor-grab touch-none p-0.5 active:cursor-grabbing"
        aria-hidden
      >
        <GripVertical className="size-3 text-slate-400" />
      </span>
      <span
        className="cursor-pointer tracking-wide"
        onDoubleClick={handleDoubleClick}
        title="Double-click to view course details"
      >
        {course.code}
      </span>
      <span className="text-[10px] text-slate-500">({course.units})</span>
      {variant === 'stash' && onMoveToPlanned && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onMoveToPlanned()
          }}
          className="-mr-0.5 flex shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Add to plan"
        >
          <Plus className="size-3" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 flex shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-500"
          aria-label="Remove"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

function DroppableZone({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[1.75rem] rounded-md transition ${isOver ? 'bg-primary/5 ring-2 ring-primary/40' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

// ── WAYS requirement definitions ─────────────────────────────────────────────

const WAYS_REQUIREMENTS = [
  { code: 'WAY-A-II', label: 'A-II', title: 'Aesthetic & Interpretive Inquiry', required: 2 },
  { code: 'WAY-AQR', label: 'AQR', title: 'Applied Quantitative Reasoning', required: 1 },
  { code: 'WAY-CE', label: 'CE', title: 'Creative Expression', required: 1 },
  { code: 'WAY-EDP', label: 'EDP', title: 'Engaging Diversity', required: 1 },
  { code: 'WAY-ER', label: 'ER', title: 'Ethical Reasoning', required: 1 },
  { code: 'WAY-FR', label: 'FR', title: 'Formal Reasoning', required: 1 },
  { code: 'WAY-SI', label: 'SI', title: 'Social Inquiry', required: 2 },
  { code: 'WAY-SMA', label: 'SMA', title: 'Science, Math & Application', required: 2 },
] as const

type GerEntry = { gers: string[]; subjectCode: string; codeNumber: number }

function RequirementsPanel({
  totalUnits,
  coursesGers,
  planned,
  planId,
  savedWayOverrides,
  onWayOverridesChange,
}: {
  totalUnits: number
  coursesGers: Record<string, GerEntry>
  planned: Record<string, PlannedCourse[]>
  planId: string | null
  savedWayOverrides: Record<string, string>
  onWayOverridesChange: (overrides: Record<string, string>) => void
}) {
  // Default greedy attribution: each course goes to the first WAYS (in list order) it qualifies for.
  const defaultAttribution = useMemo(() => {
    const result: Record<string, string> = {}
    const seen = new Set<string>()
    for (const courses of Object.values(planned)) {
      for (const c of courses) {
        if (seen.has(c.code)) continue
        seen.add(c.code)
        const entry = coursesGers[c.code]
        if (entry == null) continue
        const firstWay = WAYS_REQUIREMENTS.find((w) => entry.gers.includes(w.code))
        if (firstWay) result[c.code] = firstWay.code
      }
    }
    return result
  }, [planned, coursesGers])

  // User overrides: courseCode → wayCode chosen by the user (seeded from server data)
  const [userOverrides, setUserOverrides] = useState<Record<string, string>>(savedWayOverrides)

  // When the server data arrives (async load), sync it in once
  const didSeedRef = useRef(false)
  useEffect(() => {
    if (didSeedRef.current) return
    if (Object.keys(savedWayOverrides).length > 0) {
      didSeedRef.current = true
      setUserOverrides(savedWayOverrides)
    }
  }, [savedWayOverrides])

  // Set of all currently planned course codes — used to prune stale overrides
  const allPlannedCodesSet = useMemo(() => {
    const s = new Set<string>()
    for (const courses of Object.values(planned)) {
      for (const c of courses) s.add(c.code)
    }
    return s
  }, [planned])

  // Auto-remove overrides for courses no longer in the plan and persist the change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function persistOverrides(next: Record<string, string>) {
    onWayOverridesChange(next)
    if (planId === null) return
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void updateWayOverrides({ data: { planId, wayOverrides: next } })
    }, 600)
  }

  useEffect(() => {
    setUserOverrides((prev) => {
      const pruned = Object.fromEntries(Object.entries(prev).filter(([code]) => allPlannedCodesSet.has(code)))
      if (Object.keys(pruned).length === Object.keys(prev).length) return prev
      persistOverrides(pruned)
      return pruned
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlannedCodesSet])

  // Effective attribution = defaults merged with valid user overrides
  const courseAttribution = useMemo(() => {
    const result: Record<string, string> = { ...defaultAttribution }
    for (const [code, wayCode] of Object.entries(userOverrides)) {
      const entry = coursesGers[code]
      if (defaultAttribution[code] !== undefined && entry?.gers.includes(wayCode)) {
        result[code] = wayCode
      }
    }
    return result
  }, [defaultAttribution, userOverrides, coursesGers])

  // All courses qualifying for each WAY (for display — may exceed unit threshold)
  const waysQualifying = useMemo(() => {
    const map: Record<string, { code: string; units: number }[]> = {}
    for (const w of WAYS_REQUIREMENTS) map[w.code] = []
    const seen = new Set<string>()
    for (const courses of Object.values(planned)) {
      for (const c of courses) {
        if (seen.has(c.code)) continue
        seen.add(c.code)
        const entry = coursesGers[c.code]
        if (entry == null) continue
        for (const w of WAYS_REQUIREMENTS) {
          if (entry.gers.includes(w.code)) map[w.code]!.push({ code: c.code, units: c.units })
        }
      }
    }
    return map
  }, [planned, coursesGers])

  // Courses per WAY = count of courses attributed to that WAY
  const waysEarned = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const wayCode of Object.values(courseAttribution)) {
      totals[wayCode] = (totals[wayCode] ?? 0) + 1
    }
    return totals
  }, [courseAttribution])

  // PWR 1: any planned course with code matching PWR 1XX; PWR 2: PWR 2XX
  const allPlannedCodes = useMemo(
    () =>
      Object.values(planned)
        .flat()
        .map((c) => c.code),
    [planned],
  )
  const hasPwr1 = allPlannedCodes.some((code) => /^PWR\s+1/i.test(code))
  const hasPwr2 = allPlannedCodes.some((code) => /^PWR\s+2/i.test(code))

  // COLLEGE: subject_code = 'COLLEGE'
  const collegeCount = useMemo(
    () => Object.values(coursesGers).filter((e) => e.subjectCode === 'COLLEGE').length,
    [coursesGers],
  )

  const unitsPercent = Math.min((totalUnits / 180) * 100, 100)
  const waysCompleted = WAYS_REQUIREMENTS.filter((w) => (waysEarned[w.code] ?? 0) >= w.required).length

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">Requirements</h2>

      {/* Units */}
      <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-slate-700">Units</p>
          <p
            className={`text-xs font-semibold tabular-nums ${totalUnits >= 180 ? 'text-emerald-600' : 'text-slate-600'}`}
          >
            {totalUnits} / 180
          </p>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200">
          <div
            className={`h-1.5 rounded-full transition-all ${totalUnits >= 180 ? 'bg-emerald-500' : 'bg-primary'}`}
            style={{ width: `${unitsPercent}%` }}
          />
        </div>
      </div>

      {/* Gen Ed */}
      <div className="mt-2 rounded-xl bg-slate-50 p-2.5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-slate-700">Gen Ed</p>
          <p className="text-[10px] text-slate-400">{waysCompleted}/8 WAYS</p>
        </div>

        {/* WAYS — tracked by units; courses listed under every WAY they qualify for */}
        <div className="mt-2 space-y-1.5">
          {WAYS_REQUIREMENTS.map((w) => {
            const qualifying = waysQualifying[w.code] ?? []
            const earned = waysEarned[w.code] ?? 0
            const done = earned >= w.required
            const pct = Math.min((earned / w.required) * 100, 100)
            return (
              <div key={w.code} title={`${w.title}: ${earned}/${w.required} courses`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-red-300 bg-white'
                      }`}
                    >
                      {done && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </div>
                    <span className={`text-[11px] font-medium ${done ? 'text-slate-700' : 'text-red-500'}`}>
                      {w.label}
                    </span>
                  </div>
                  <span className={`text-[10px] tabular-nums ${done ? 'text-emerald-600' : 'text-red-400'}`}>
                    {earned}/{w.required}
                  </span>
                </div>
                {!done && earned > 0 && (
                  <div className="mt-0.5 ml-5.5 h-1 w-full rounded-full bg-red-100">
                    <div
                      className="h-1 rounded-full bg-red-400/70 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {qualifying.length > 0 && (
                  <div className="mt-0.5 ml-5.5 flex flex-wrap gap-0.5">
                    {qualifying.map((c) => {
                      const isActive = courseAttribution[c.code] === w.code
                      const qualifiesElsewhere = Object.values(coursesGers[c.code]?.gers ?? []).some(
                        (g) => g !== w.code && WAYS_REQUIREMENTS.some((wr) => wr.code === g),
                      )
                      return (
                        <button
                          key={c.code}
                          type="button"
                          disabled={isActive}
                          onClick={() => {
                            const next = { ...userOverrides, [c.code]: w.code }
                            setUserOverrides(next)
                            persistOverrides(next)
                          }}
                          title={isActive ? `${c.code} counts here` : `Click to count ${c.code} here instead`}
                          className={`rounded px-1 py-0.5 text-[9px] tabular-nums transition ${
                            isActive
                              ? done
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-600'
                              : qualifiesElsewhere
                                ? 'cursor-pointer bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500'
                                : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {c.code}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* PWR */}
        <div className="mt-2.5 border-t border-slate-200/70 pt-2">
          <p className="mb-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">PWR</p>
          <div className="flex gap-2">
            {[
              { label: 'PWR 1', done: hasPwr1 },
              { label: 'PWR 2', done: hasPwr2 },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-1" title={label}>
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                    done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {done && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
                <span className={`text-[11px] ${done ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* COLLEGE */}
        <div className="mt-2 border-t border-slate-200/70 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">COLLEGE</p>
            <p
              className={`text-[11px] font-semibold tabular-nums ${collegeCount >= 2 ? 'text-emerald-600' : 'text-slate-500'}`}
            >
              {collegeCount} / 2
            </p>
          </div>
          <div className="mt-1 flex gap-1">
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  i < collegeCount ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanPage() {
  const queryClient = useQueryClient()
  const { data: authUser } = useQuery(userQueryOptions)
  const [startYear, setStartYear] = useState(DEFAULT_START_YEAR)
  const [planned, setPlanned] = useState<Record<string, PlannedCourse[]>>(INITIAL_PLANNED)
  const [globalStash, setGlobalStash] = useState<PlannedCourse[]>([])
  const [quarterStash, setQuarterStash] = useState<Record<string, PlannedCourse[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)
  const [planSpan, setPlanSpan] = useState(() => getStoredPlanSpan())
  const [wayOverrides, setWayOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    setMounted(true)
    const storedSpan = getStoredPlanSpan()
    setPlanSpan(storedSpan)
    getUserPlan()
      .then((data) => {
        if (!data) return
        setPlanId(data.planId)
        if (Object.keys(data.wayOverrides).length > 0) {
          setWayOverrides(data.wayOverrides)
        }
        // Only hydrate from DB if it has data; keep INITIAL_PLANNED otherwise
        if (Object.keys(data.planned).length > 0) {
          setStartYear(data.startYear)
          setPlanned(
            Object.fromEntries(
              Object.entries(data.planned).map(([key, courses]) => {
                const dashIdx = key.indexOf('-')
                const yearOffsetStr = key.slice(0, dashIdx)
                const term = key.slice(dashIdx + 1)
                const actualYear = data.startYear + parseInt(yearOffsetStr, 10)
                const newKey = absoluteQuarterKey(actualYear, term as TermKey)
                return [
                  newKey,
                  courses.map((c) => ({ code: c.code, title: '', units: c.units, dbId: c.dbId })),
                ]
              }),
            ),
          )
        }
        if (data.globalStash.length > 0) {
          setGlobalStash(
            data.globalStash.map((c) => ({ code: c.code, title: '', units: c.units, dbId: c.dbId })),
          )
        }
      })
      .catch((_err: unknown) => console.error('[plan] load error:', _err))
  }, [])

  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    console.log('[transcript] onChange fired, files:', e.target.files)
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const data = await parseTranscriptPDF(file)
      console.log('[transcript] parsed:', data)
      setStartYear(data.startYear)
      const plannedWithActualYear = Object.fromEntries(
        Object.entries(data.planned).map(([key, courses]) => {
          const dashIdx = key.indexOf('-')
          const yearOffsetStr = key.slice(0, dashIdx)
          const term = key.slice(dashIdx + 1)
          const actualYear = data.startYear + parseInt(yearOffsetStr, 10)
          return [
            absoluteQuarterKey(actualYear, term as TermKey),
            courses.map((c) => ({ ...c, dbId: undefined })),
          ]
        }),
      )
      setPlanned(plannedWithActualYear)
      setQuarterStash({})

      // Persist to DB if logged in
      if (planId !== null) {
        try {
          const plannedForDb = Object.fromEntries(
            Object.entries(data.planned).map(([key, courses]) => [
              key,
              courses.map((c) => ({ code: c.code, units: c.units })),
            ]),
          )
          const dbResult = await resetPlan({
            data: { planId, startYear: data.startYear, planned: plannedForDb },
          })
          // Hydrate dbIds into local state (dbResult uses yearOffset keys like data.planned)
          setPlanned(
            Object.fromEntries(
              Object.entries(data.planned).map(([key, courses]) => {
                const dashIdx = key.indexOf('-')
                const yearOffsetStr = key.slice(0, dashIdx)
                const term = key.slice(dashIdx + 1)
                const actualYear = data.startYear + parseInt(yearOffsetStr, 10)
                const newKey = absoluteQuarterKey(actualYear, term as TermKey)
                const dbCourses = dbResult[key] ?? []
                const dbById = new Map(dbCourses.map((c) => [c.code, c.dbId]))
                return [newKey, courses.map((c) => ({ ...c, dbId: dbById.get(c.code) }))]
              }),
            ),
          )
          void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey })
        } catch (dbErr) {
          console.error('[plan] resetPlan error:', dbErr)
        }
      }
    } catch (err) {
      console.error('[transcript] error:', err)
      setImportError(err instanceof Error ? err.message : 'Failed to parse transcript.')
    } finally {
      setImporting(false)
      // Reset input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function getPlanned(yearIndex: number, term: TermKey): PlannedCourse[] {
    return planned[absoluteQuarterKey(startYear + yearIndex, term)] ?? []
  }

  function getQuarterStash(yearIndex: number, term: TermKey): PlannedCourse[] {
    return quarterStash[absoluteQuarterKey(startYear + yearIndex, term)] ?? []
  }

  function getTermUnits(courses: PlannedCourse[]): number {
    return courses.reduce((sum, c) => sum + c.units, 0)
  }

  function getYearUnits(yearIndex: number): number {
    return TERMS.reduce((sum, term) => sum + getTermUnits(getPlanned(yearIndex, term)), 0)
  }

  const totalUnits = useMemo(
    () =>
      Object.values(planned)
        .flat()
        .reduce((sum, c) => sum + c.units, 0),
    [planned],
  )

  const allPlannedCodes = useMemo(
    () => [
      ...new Set(
        Object.values(planned)
          .flat()
          .map((c) => c.code),
      ),
    ],
    [planned],
  )

  const { data: coursesGers = {} } = useQuery({
    queryKey: ['courses-gers', allPlannedCodes],
    queryFn: () => getCoursesGers({ data: { courseCodes: allPlannedCodes } }),
    staleTime: 1000 * 60 * 10,
    enabled: allPlannedCodes.length > 0,
  })

  function addToGlobalStash(course: PlannedCourse) {
    setGlobalStash((prev) => [...prev, course])
    if (planId !== null) {
      addStashCourse({ data: { planId, courseCode: course.code } })
        .then((res) => {
          setGlobalStash((prev) =>
            prev.map((c) => (c.code === course.code && c.dbId === undefined ? { ...c, dbId: res.dbId } : c)),
          )
          void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey })
        })
        .catch((_err: unknown) => console.error('[plan] addStashCourse error:', _err))
    }
  }

  function removeFromGlobalStash(code: string) {
    const course = globalStash.find((c) => c.code === code)
    setGlobalStash((prev) => prev.filter((c) => c.code !== code))
    if (course?.dbId !== undefined) {
      removeStashCourse({ data: { stashDbId: course.dbId } })
        .then(() => void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey }))
        .catch((_err: unknown) => console.error('[plan] removeStashCourse error:', _err))
    }
  }

  function addToQuarterStash(yearIndex: number, term: TermKey, course: PlannedCourse) {
    const key = absoluteQuarterKey(startYear + yearIndex, term)
    setQuarterStash((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), course],
    }))
  }

  function removeFromQuarterStash(yearIndex: number, term: TermKey, code: string) {
    const key = absoluteQuarterKey(startYear + yearIndex, term)
    setQuarterStash((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((c) => c.code !== code),
    }))
  }

  function addToPlanned(yearIndex: number, term: TermKey, course: PlannedCourse) {
    const key = absoluteQuarterKey(startYear + yearIndex, term)
    setPlanned((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), course],
    }))
    if (planId !== null) {
      addPlanCourse({
        data: {
          planId,
          actualYear: startYear + yearIndex,
          quarter: term,
          courseCode: course.code,
          units: course.units,
        },
      })
        .then((res) => {
          setPlanned((prev) => ({
            ...prev,
            [key]: (prev[key] ?? []).map((c) =>
              c.code === course.code && c.dbId === undefined ? { ...c, dbId: res.dbId } : c,
            ),
          }))
          void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey })
        })
        .catch((_err: unknown) => console.error('[plan] addPlanCourse error:', _err))
    }
  }

  function removeFromPlanned(yearIndex: number, term: TermKey, code: string) {
    const key = absoluteQuarterKey(startYear + yearIndex, term)
    const course = (planned[key] ?? []).find((c) => c.code === code)
    setPlanned((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((c) => c.code !== code),
    }))
    if (course?.dbId !== undefined) {
      removePlanCourse({ data: { courseDbId: course.dbId } })
        .then(() => void queryClient.invalidateQueries({ queryKey: planQueryOptions.queryKey }))
        .catch((_err: unknown) => console.error('[plan] removePlanCourse error:', _err))
    }
  }

  const [searchResults, setSearchResults] = useState<PlanSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedItemRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchLoading(true)
      searchCoursesForPlan({ data: { query: q } })
        .then((results) => {
          setSearchResults(results)
          setSelectedIdx(0)
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(ev: DragStartEvent) {
    setActiveId(ev.active.id as string)
  }

  function handleDragEnd(ev: DragEndEvent) {
    setActiveId(null)
    const { active, over } = ev
    if (over == null) return
    const data = active.data.current as { course: PlannedCourse; source: DragSource } | undefined
    if (!data?.course) return
    const { course, source } = data
    const overId = over.id as string

    if (overId === DELETE_DROP_ID) {
      if (source.type === 'planned') {
        removeFromPlanned(source.yearIndex, source.term, course.code)
      } else if (source.type === 'stash') {
        removeFromQuarterStash(source.yearIndex, source.term, course.code)
      } else if (source.type === 'global') {
        removeFromGlobalStash(course.code)
      }
      return
    }

    if (overId === GLOBAL_STASH_DROP_ID) {
      if (source.type === 'planned') {
        removeFromPlanned(source.yearIndex, source.term, course.code)
        addToGlobalStash(course)
      } else if (source.type === 'stash') {
        removeFromQuarterStash(source.yearIndex, source.term, course.code)
        addToGlobalStash(course)
      } else if (source.type === 'search') {
        addToGlobalStash(course)
      }
      return
    }
    const plannedMatch = overId.match(/^planned-(\d+)-(Autumn|Winter|Spring|Summer)$/)
    if (plannedMatch) {
      const y = Number(plannedMatch[1])
      const t = plannedMatch[2] as TermKey
      if (source.type === 'search') {
        addToPlanned(y, t, course)
      } else if (source.type === 'global') {
        removeFromGlobalStash(course.code)
        addToPlanned(y, t, course)
      } else if (source.type === 'stash') {
        removeFromQuarterStash(source.yearIndex, source.term, course.code)
        addToPlanned(y, t, course)
      } else if (source.type === 'planned' && (source.yearIndex !== y || source.term !== t)) {
        removeFromPlanned(source.yearIndex, source.term, course.code)
        addToPlanned(y, t, course)
      }
      return
    }
    const stashMatch = overId.match(/^stash-(\d+)-(Autumn|Winter|Spring|Summer)$/)
    if (stashMatch) {
      const y = Number(stashMatch[1])
      const t = stashMatch[2] as TermKey
      if (source.type === 'global') {
        removeFromGlobalStash(course.code)
        addToQuarterStash(y, t, course)
      } else if (source.type === 'planned') {
        removeFromPlanned(source.yearIndex, source.term, course.code)
        addToQuarterStash(y, t, course)
      } else if (source.type === 'stash' && (source.yearIndex !== y || source.term !== t)) {
        removeFromQuarterStash(source.yearIndex, source.term, course.code)
        addToQuarterStash(y, t, course)
      }
    }
  }

  const activeCourse = (() => {
    if (activeId === null) return null
    for (const c of searchResults)
      if (`search-${c.code}` === activeId)
        return { course: { code: c.code, title: c.title, units: c.unitsMax }, variant: 'global' as const }
    for (const c of globalStash)
      if (`global-${c.code}` === activeId) return { course: c, variant: 'global' as const }
    for (let yi = 0; yi < planSpan; yi++)
      for (const term of TERMS) {
        for (const c of getPlanned(yi, term))
          if (`planned-${yi}-${term}-${c.code}` === activeId)
            return { course: c, variant: 'planned' as const }
        for (const c of getQuarterStash(yi, term))
          if (`stash-${yi}-${term}-${c.code}` === activeId) return { course: c, variant: 'stash' as const }
      }
    return null
  })()

  if (!mounted) return <div className="min-h-[calc(100vh-var(--header-height))] bg-sky-50" />

  if (authUser == null) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center bg-sky-50">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Sign in to use your 4-Year Plan</h2>
          <p className="mt-2 text-sm text-slate-500">
            You need a Stanford account to save and manage your course plan.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-lg bg-[#8C1515] px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7A1212]"
          >
            Sign in with Stanford
          </Link>
        </div>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-[calc(100vh-var(--header-height))] overflow-x-clip bg-sky-50">
        <div className="mx-auto flex w-full gap-4 px-4 pt-4 pb-12">
          {/* Left: Search + Global stash */}
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-[var(--header-height)] space-y-3 pt-1">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  Search courses
                </h2>
                <input
                  type="text"
                  placeholder="Course code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (searchResults.length === 0) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedIdx((i) => Math.min(i + 1, searchResults.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedIdx((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const c = searchResults[selectedIdx]!
                      addToGlobalStash({ code: c.code, title: c.title, units: c.unitsMax })
                    }
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none"
                />
                {searchLoading && <p className="mt-2 text-xs text-slate-400">Searching…</p>}
                {!searchLoading && searchResults.length > 0 && (
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                    {searchResults.map((c, i) => (
                      <div
                        key={c.code}
                        ref={i === selectedIdx ? selectedItemRef : null}
                        className={`rounded-lg outline-2 -outline-offset-2 outline-transparent ${i === selectedIdx ? 'outline-[#8C1515]' : ''}`}
                      >
                        <DraggableSearchResult result={c} />
                      </div>
                    ))}
                  </ul>
                )}
                {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">No courses found.</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  Global stash
                </h2>
                {globalStash.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Add from search or drag here. Drag to a quarter to assign.
                  </p>
                )}
                <DroppableZone id={GLOBAL_STASH_DROP_ID} className="mt-2 flex flex-wrap gap-1">
                  {globalStash.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400">No courses in stash yet.</p>
                  ) : (
                    globalStash.map((c) => (
                      <CourseBox
                        key={c.code}
                        id={`global-${c.code}`}
                        course={c}
                        source={{ type: 'global' }}
                        variant="global"
                      />
                    ))
                  )}
                </DroppableZone>
              </div>
              <DeleteDropZone isDragging={activeId !== null} />
            </div>
          </aside>

          {/* Center: 4-year grid with year nav */}
          <main className="min-w-0 flex-1">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-3xl font-normal text-slate-900">{planSpan}-year plan</h1>
                {importError !== null && <p className="mt-0.5 text-xs text-red-600">{importError}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    void handleTranscriptUpload(e)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 rounded-full border-slate-300 px-4"
                >
                  {importing ? 'Importing…' : 'Import transcript'}
                </Button>
                <div className="flex h-8 items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setStartYear((y) => y - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Earlier years"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartYear((y) => y + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Later years"
                  >
                    →
                  </button>
                </div>
                <div className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 shadow-sm">
                  <span className="text-[11px] text-slate-500">Years:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setPlanSpan(n)
                        if (typeof window !== 'undefined')
                          localStorage.setItem(PLAN_SPAN_STORAGE_KEY, String(n))
                      }}
                      className={`h-6 rounded px-2 text-xs font-medium transition ${
                        planSpan === n
                          ? 'bg-primary text-primary-foreground'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                      aria-pressed={planSpan === n}
                      aria-label={`${n}-year plan`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <PlanGrid
              key={`${planSpan}-${startYear}`}
              startYear={startYear}
              planSpan={planSpan}
              getPlanned={getPlanned}
              getTermUnits={getTermUnits}
              getYearUnits={getYearUnits}
              removeFromPlanned={removeFromPlanned}
              addToPlanned={addToPlanned}
            />
          </main>

          {/* Right: Requirements + Notes */}
          <aside className="hidden w-64 shrink-0 xl:block">
            <div className="sticky top-[var(--header-height)] space-y-3 pt-1">
              <RequirementsPanel
                totalUnits={totalUnits}
                coursesGers={coursesGers}
                planned={planned}
                planId={planId}
                savedWayOverrides={wayOverrides}
                onWayOverridesChange={setWayOverrides}
              />
              <PlanNotes />
            </div>
          </aside>
        </div>
      </div>

      <DragOverlay>
        {activeCourse ? (
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-400 bg-white px-2 py-0.5 text-[11px] font-medium shadow-lg">
            <span className="tracking-wide">{activeCourse.course.code}</span>
            <span className="text-[10px] text-slate-500">({activeCourse.course.units})</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── Notes panel ───────────────────────────────────────────────────────────────

const NOTES_STORAGE_KEY = 'plan-notes'

function PlanNotes() {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(NOTES_STORAGE_KEY) ?? ''
  })

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    setValue(next)
    localStorage.setItem(NOTES_STORAGE_KEY, next)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">Notes</h2>
      <textarea
        className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs text-slate-700 transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-slate-300 focus:outline-none"
        rows={6}
        placeholder={'e.g. WAY A-II covered through exception'}
        value={value}
        onChange={handleChange}
      />
    </div>
  )
}
