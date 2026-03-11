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
import { useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { parseTranscriptPDF } from '@/lib/parse-transcript'
import {
  getUserPlan,
  addPlanCourse,
  removePlanCourse,
  addStashCourse,
  removeStashCourse,
  resetPlan,
} from '@/data/plan/plan-server'

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
}: {
  startYear: number
  planSpan: number
  getPlanned: (yi: number, term: TermKey) => PlannedCourse[]
  getTermUnits: (courses: PlannedCourse[]) => number
  getYearUnits: (yi: number) => number
  removeFromPlanned: (yi: number, term: TermKey, code: string) => void
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
                        <p className="text-xs font-medium text-slate-700">{term}</p>
                        <span className="text-[10px] text-slate-500">{termUnits} units</span>
                      </div>
                      <DroppableZone
                        id={plannedDropId(yi, term)}
                        className="flex min-h-[1.75rem] flex-wrap gap-1"
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

// Initial planned courses (Year 1 only for demo), keyed by actual year
const DEFAULT_START_YEAR = 2024
const INITIAL_PLANNED: Record<string, PlannedCourse[]> = {
  '2024-Autumn': [
    { code: 'PWR 1', title: 'Writing & Rhetoric', units: 4 },
    { code: 'MATH 51', title: 'Linear Algebra & Multivariable Calculus', units: 5 },
    { code: 'CS 106A', title: 'Programming Methodology', units: 5 },
    { code: 'ESF 10', title: 'Education as Self-Fashioning', units: 4 },
  ],
  '2024-Winter': [
    { code: 'CS 106B', title: 'Programming Abstractions', units: 5 },
    { code: 'MATH 52', title: 'Integral Calculus of Several Variables', units: 5 },
    { code: 'PWR 2', title: 'Writing & Rhetoric 2', units: 4 },
  ],
  '2024-Spring': [
    { code: 'CS 103', title: 'Mathematical Foundations of Computing', units: 5 },
    { code: 'CS 107', title: 'Computer Systems', units: 5 },
    { code: 'PHIL 80', title: 'Mind, Matter, and Meaning', units: 4 },
  ],
}

// Sample courses for global stash / search (mock results)
const SAMPLE_SEARCH_COURSES: PlannedCourse[] = [
  { code: 'CS 109', title: 'Probability for Computer Scientists', units: 5 },
  { code: 'CS 161', title: 'Design and Analysis of Algorithms', units: 5 },
  { code: 'ECON 1', title: 'Principles of Economics', units: 5 },
]

// Drag-and-drop: payload and drop id helpers
type DragSource =
  | { type: 'global' }
  | { type: 'planned'; yearIndex: number; term: TermKey }
  | { type: 'stash'; yearIndex: number; term: TermKey }
function plannedDropId(yearIndex: number, term: TermKey) {
  return `planned-${yearIndex}-${term}`
}
const GLOBAL_STASH_DROP_ID = 'global-stash'

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
      <span className="tracking-wide">{course.code}</span>
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

function PlanPage() {
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

  useEffect(() => {
    setMounted(true)
    const storedSpan = getStoredPlanSpan()
    setPlanSpan(storedSpan)
    getUserPlan()
      .then((data) => {
        if (!data) return
        setPlanId(data.planId)
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

  function addToGlobalStash(course: PlannedCourse) {
    setGlobalStash((prev) => [...prev, course])
    if (planId !== null) {
      addStashCourse({ data: { planId, courseCode: course.code } })
        .then((res) => {
          setGlobalStash((prev) =>
            prev.map((c) => (c.code === course.code && c.dbId === undefined ? { ...c, dbId: res.dbId } : c)),
          )
        })
        .catch((_err: unknown) => console.error('[plan] addStashCourse error:', _err))
    }
  }

  function removeFromGlobalStash(code: string) {
    const course = globalStash.find((c) => c.code === code)
    setGlobalStash((prev) => prev.filter((c) => c.code !== code))
    if (course?.dbId !== undefined) {
      removeStashCourse({ data: { stashDbId: course.dbId } }).catch((_err: unknown) =>
        console.error('[plan] removeStashCourse error:', _err),
      )
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
      removePlanCourse({ data: { courseDbId: course.dbId } }).catch((_err: unknown) =>
        console.error('[plan] removePlanCourse error:', _err),
      )
    }
  }

  // Mock search results (in real app would come from API)
  const searchResults = searchQuery.trim()
    ? SAMPLE_SEARCH_COURSES.filter(
        (c) =>
          c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : []

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

    if (overId === GLOBAL_STASH_DROP_ID) {
      if (source.type === 'planned') {
        removeFromPlanned(source.yearIndex, source.term, course.code)
        addToGlobalStash(course)
      } else if (source.type === 'stash') {
        removeFromQuarterStash(source.yearIndex, source.term, course.code)
        addToGlobalStash(course)
      }
      return
    }
    const plannedMatch = overId.match(/^planned-(\d+)-(Autumn|Winter|Spring|Summer)$/)
    if (plannedMatch) {
      const y = Number(plannedMatch[1])
      const t = plannedMatch[2] as TermKey
      if (source.type === 'global') {
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
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none"
                />
                {searchResults.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {searchResults.map((c) => (
                      <li
                        key={c.code}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs"
                      >
                        <span className="font-medium text-slate-800">{c.code}</span>
                        <Button
                          type="button"
                          variant="default"
                          size="xs"
                          onClick={() => addToGlobalStash(c)}
                          className="h-6 px-2 text-[10px]"
                        >
                          Stash
                        </Button>
                      </li>
                    ))}
                  </ul>
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
                        onRemove={() => removeFromGlobalStash(c.code)}
                      />
                    ))
                  )}
                </DroppableZone>
              </div>
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
            />
          </main>

          {/* Right: Requirements + Notes */}
          <aside className="hidden w-64 shrink-0 xl:block">
            <div className="sticky top-[var(--header-height)] space-y-3 pt-1">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  Requirements
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Track major, minor, and university requirements as you plan.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-1">
                  <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700">
                    <p className="font-semibold">Major</p>
                    <p className="mt-1 text-slate-500">0 / XX units planned</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700">
                    <p className="font-semibold">WIM / Writing</p>
                    <p className="mt-1 text-slate-500">0 / XX courses planned</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700">
                    <p className="font-semibold">Gen Ed</p>
                    <p className="mt-1 text-slate-500">WAYS, PWR, COLLEGE overview</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">Notes</h2>
                <p className="mt-1.5 text-sm text-slate-600">Leave reminders for future you.</p>
                <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-2.5 text-xs text-slate-500">
                  Example: CS 221 pairs well with a lighter humanities course.
                </div>
              </div>
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
