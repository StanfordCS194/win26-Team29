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
import { createFileRoute } from '@tanstack/react-router'
import { parseTranscriptPDF } from '@/lib/parse-transcript'
import {
  getUserPlan,
  addPlanCourse,
  removePlanCourse,
  addStashCourse,
  removeStashCourse,
  resetPlan,
  searchCoursesForPlan,
  type PlanSearchResult,
} from '@/data/plan/plan-server'

export const Route = createFileRoute('/plan')({ component: PlanPage })

const TERMS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const
type TermKey = (typeof TERMS)[number]

type PlannedCourse = { code: string; title: string; units: number; dbId?: string }

function AllYearsOverview({
  startYear,
  getPlanned,
  getTermUnits,
  getYearUnits,
  removeFromPlanned,
  addToPlanned,
}: {
  startYear: number
  getPlanned: (yi: number, term: TermKey) => PlannedCourse[]
  getTermUnits: (courses: PlannedCourse[]) => number
  getYearUnits: (yi: number) => number
  removeFromPlanned: (yi: number, term: TermKey, code: string) => void
  addToPlanned: (yi: number, term: TermKey, course: PlannedCourse) => void
}) {
  return (
    <div className="overflow-auto">
      <div className="grid min-w-[700px] grid-cols-4 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {[0, 1, 2, 3].map((yi) => {
          const yr = startYear + yi
          const yearLabel = `${yr}–${String(yr + 1).slice(-2)}`
          return (
            <div key={yi} className="flex flex-col">
              {/* Sticky year header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur-sm">
                <span className="text-sm font-semibold text-slate-800">{yearLabel}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {getYearUnits(yi)} / 45 units
                </span>
              </div>

              {/* Quarters */}
              <div className="flex flex-col gap-3 p-3">
                {TERMS.map((term) => {
                  const courses = getPlanned(yi, term)
                  const termUnits = getTermUnits(courses)
                  return (
                    <div
                      key={term}
                      className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/80 text-xs"
                    >
                      {/* Quarter header */}
                      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
                        <p className="font-semibold text-slate-700">{term}</p>
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                          {termUnits} units
                        </span>
                      </div>

                      {/* Droppable zone */}
                      <div className="flex flex-col gap-2 px-3 pb-2">
                        <p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                          Planned
                        </p>
                        <DroppableZone id={plannedDropId(yi, term)} className="flex flex-wrap gap-1.5">
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

                      <div className="mx-3 mb-3">
                        <AddCourseInline onAdd={(c) => addToPlanned(yi, term, c)} targetTerm={term} />
                      </div>
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

function quarterKey(yearIndex: number, term: TermKey) {
  return `${yearIndex}-${term}`
}

const INITIAL_PLANNED: Record<string, PlannedCourse[]> = {}

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
    'inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium shadow-sm transition cursor-grab active:cursor-grabbing'
  const variantClass =
    variant === 'planned'
      ? 'border-slate-300 bg-white text-slate-800 hover:border-[#8C1515]/50'
      : variant === 'stash'
        ? 'border-amber-300 bg-amber-50 text-slate-800 hover:border-amber-400'
        : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300'
  const sixDots = (
    <span className="pointer-events-none ml-auto flex" aria-hidden>
      <span className="flex flex-col gap-[2px]">
        <span className="flex gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-slate-400" />
          <span className="h-1 w-1 rounded-full bg-slate-400" />
        </span>
        <span className="flex gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-slate-400" />
          <span className="h-1 w-1 rounded-full bg-slate-400" />
        </span>
        <span className="flex gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-slate-400" />
          <span className="h-1 w-1 rounded-full bg-slate-400" />
        </span>
      </span>
    </span>
  )

  return (
    <div className="group relative inline-flex">
      {/* Chip — old style */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className={`${base} ${variantClass} ${isDragging ? 'opacity-50' : ''}`}
      >
        <span className="tracking-wide">{course.code}</span>
        <span className="text-slate-500">({course.units})</span>
        {sixDots}
      </div>

      {/* Corner popup — appears at top-right, overlapping the chip corner */}
      {(onRemove || onMoveToPlanned) && (
        <div
          className="pointer-events-none absolute -top-1 -right-1 z-50 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-[130px] flex-col gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xl">
            <p className="text-[11px] font-semibold text-slate-800">{course.code}</p>
            {course.units > 0 && <p className="text-[10px] text-slate-400">{course.units} units</p>}
            {course.title && (
              <p className="max-w-[160px] truncate text-[10px] text-slate-400">{course.title}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-1">
              {variant === 'stash' && onMoveToPlanned && (
                <button
                  type="button"
                  onClick={() => onMoveToPlanned()}
                  className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-medium text-white hover:bg-slate-900"
                >
                  + Plan
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove()}
                  className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-100"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
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
      className={`min-h-[2.5rem] rounded-lg transition ${isOver ? 'bg-[#8C1515]/5 ring-2 ring-[#8C1515]/40' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

function AddCourseInline({
  onAdd,
  targetTerm,
}: {
  onAdd: (course: PlannedCourse) => void
  targetTerm?: TermKey
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlanSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setLoading(true)
      searchCoursesForPlan({ data: { query: q } })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full bg-slate-900/90 px-2 py-1.5 text-[11px] font-normal text-slate-50 transition hover:bg-slate-900"
      >
        Add course
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex items-center gap-1">
        <input
          type="text"
          autoFocus
          placeholder="CS 106A or title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-[#8C1515] focus:ring-1 focus:ring-[#8C1515] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setQuery('')
            setResults([])
          }}
          className="text-[11px] text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
      {loading && <p className="text-[10px] text-slate-400">Searching…</p>}
      {results.map((c) => {
        const available = !targetTerm || c.quarters.includes(targetTerm)
        return (
          <button
            key={c.code}
            type="button"
            disabled={!available}
            onClick={() => {
              onAdd({ code: c.code, title: c.title, units: c.unitsMax })
              setOpen(false)
              setQuery('')
              setResults([])
            }}
            className={`flex flex-col gap-0.5 rounded-md px-2 py-1 text-left text-[11px] ${available ? 'bg-slate-50 hover:bg-slate-100' : 'cursor-not-allowed bg-slate-50/50 opacity-50'}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-medium text-slate-800">{c.code}</span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {c.unitsMin === c.unitsMax ? c.unitsMin : `${c.unitsMin}–${c.unitsMax}`}u
              </span>
            </div>
            <span className="truncate text-[10px] text-slate-500">{c.title}</span>
            {!available && <span className="text-[9px] text-red-400">Not offered in {targetTerm}</span>}
            {available && c.quarters.length > 0 && (
              <span className="text-[9px] text-slate-400">{c.quarters.join(', ')}</span>
            )}
          </button>
        )
      })}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-[10px] text-slate-400">No results</p>
      )}
    </div>
  )
}

function PlanPage() {
  const [startYear, setStartYear] = useState(2024)
  const [viewYear, setViewYear] = useState(2024)
  const [planned, setPlanned] = useState<Record<string, PlannedCourse[]>>(INITIAL_PLANNED)
  const [globalStash, setGlobalStash] = useState<PlannedCourse[]>([])
  const [quarterStash, setQuarterStash] = useState<Record<string, PlannedCourse[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    getUserPlan()
      .then((data) => {
        if (!data) return
        setPlanId(data.planId)
        // Only hydrate from DB if it has data; keep INITIAL_PLANNED otherwise
        if (Object.keys(data.planned).length > 0) {
          setStartYear(data.startYear)
          setViewYear(data.startYear)
          setPlanned(
            Object.fromEntries(
              Object.entries(data.planned).map(([key, courses]) => [
                key,
                courses.map((c) => ({ code: c.code, title: '', units: c.units, dbId: c.dbId })),
              ]),
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
      setViewYear(data.startYear)
      setPlanned(data.planned)
      setQuarterStash({})

      // Persist to DB if logged in
      if (planId !== null) {
        try {
          const dbResult = await resetPlan({
            data: {
              planId,
              startYear: data.startYear,
              planned: Object.fromEntries(
                Object.entries(data.planned).map(([key, courses]) => [
                  key,
                  courses.map((c) => ({ code: c.code, units: c.units })),
                ]),
              ),
            },
          })
          // Hydrate dbIds into local state
          setPlanned(
            Object.fromEntries(
              Object.entries(data.planned).map(([key, courses]) => {
                const dbCourses = dbResult[key] ?? []
                const dbById = new Map(dbCourses.map((c) => [c.code, c.dbId]))
                return [key, courses.map((c) => ({ ...c, dbId: dbById.get(c.code) }))]
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

  const yearIndex = viewYear - startYear
  const viewYearLabel = `${viewYear}-${String(viewYear + 1).slice(-2)}`
  const canGoPrev = viewYear > startYear
  const canGoNext = viewYear < startYear + 3

  function getPlanned(yearIndex: number, term: TermKey): PlannedCourse[] {
    return planned[quarterKey(yearIndex, term)] ?? []
  }

  function getQuarterStash(yearIndex: number, term: TermKey): PlannedCourse[] {
    return quarterStash[quarterKey(yearIndex, term)] ?? []
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
    const key = quarterKey(yearIndex, term)
    setQuarterStash((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), course],
    }))
  }

  function removeFromQuarterStash(yearIndex: number, term: TermKey, code: string) {
    const key = quarterKey(yearIndex, term)
    setQuarterStash((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((c) => c.code !== code),
    }))
  }

  function addToPlanned(yearIndex: number, term: TermKey, course: PlannedCourse) {
    const key = quarterKey(yearIndex, term)
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
    const key = quarterKey(yearIndex, term)
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

  const [searchResults, setSearchResults] = useState<PlanSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

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
    for (let yi = 0; yi < 4; yi++)
      for (const term of TERMS) {
        for (const c of getPlanned(yi, term))
          if (`planned-${yi}-${term}-${c.code}` === activeId)
            return { course: c, variant: 'planned' as const }
        for (const c of getQuarterStash(yi, term))
          if (`stash-${yi}-${term}-${c.code}` === activeId) return { course: c, variant: 'stash' as const }
      }
    return null
  })()

  if (!mounted) return <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100" />

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
        <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-6 pt-10 pb-16">
          {/* Left: Search + Global stash */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-28 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  Search courses
                </h2>
                <input
                  type="text"
                  placeholder="Course code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#8C1515] focus:ring-1 focus:ring-[#8C1515] focus:outline-none"
                />
                {searchLoading && <p className="mt-2 text-xs text-slate-400">Searching…</p>}
                {!searchLoading && searchResults.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {searchResults.map((c) => (
                      <li
                        key={c.code}
                        className="flex flex-col gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{c.code}</span>
                          <span className="text-[10px] text-slate-400">
                            {c.unitsMin === c.unitsMax ? c.unitsMin : `${c.unitsMin}–${c.unitsMax}`} units
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-slate-500">{c.title}</p>
                        <button
                          type="button"
                          onClick={() =>
                            addToGlobalStash({ code: c.code, title: c.title, units: c.unitsMax })
                          }
                          className="mt-0.5 w-full rounded bg-[#8C1515] px-2 py-0.5 text-[10px] text-white hover:bg-[#7A1212]"
                        >
                          + Stash
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">No courses found.</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  Global stash
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Add from search or drag here. Drag to a quarter to assign.
                </p>
                <DroppableZone id={GLOBAL_STASH_DROP_ID} className="mt-2 flex flex-wrap gap-2">
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
            <header className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-3xl font-normal text-slate-900">4-year plan</h1>
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
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-800 shadow-sm transition hover:border-[#8C1515] hover:text-[#8C1515] disabled:opacity-60"
                >
                  {importing ? 'Importing…' : 'Import transcript'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverview((v) => !v)}
                  className={`rounded-full border px-4 py-2 text-sm font-normal shadow-sm transition ${
                    showOverview
                      ? 'border-[#8C1515] bg-[#8C1515] text-white'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-[#8C1515] hover:text-[#8C1515]'
                  }`}
                >
                  All years
                </button>
                <div
                  className={`flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm transition-opacity duration-200 ${showOverview ? 'pointer-events-none opacity-30' : 'opacity-100'}`}
                >
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => Math.max(startYear, y - 1))}
                    disabled={!canGoPrev}
                    className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Previous year"
                  >
                    ←
                  </button>
                  <span className="min-w-[5rem] text-center text-sm font-medium text-slate-700">
                    {viewYearLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => Math.min(startYear + 3, y + 1))}
                    disabled={!canGoNext}
                    className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Next year"
                  >
                    →
                  </button>
                </div>
              </div>
            </header>

            {/* All-years view */}
            <div
              className={`transition-all duration-200 ${showOverview ? 'opacity-100' : 'pointer-events-none absolute opacity-0'}`}
            >
              <AllYearsOverview
                startYear={startYear}
                getPlanned={getPlanned}
                getTermUnits={getTermUnits}
                getYearUnits={getYearUnits}
                removeFromPlanned={removeFromPlanned}
                addToPlanned={addToPlanned}
              />
            </div>

            {/* Single-year view */}
            <section
              className={`grid w-full grid-cols-1 gap-4 transition-all duration-200 ${showOverview ? 'pointer-events-none absolute opacity-0' : 'opacity-100'}`}
            >
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  {viewYearLabel}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {getYearUnits(yearIndex)} / 45 units
                </span>
              </div>
              {TERMS.map((term) => {
                const plannedCourses = getPlanned(yearIndex, term)
                const termUnits = getTermUnits(plannedCourses)
                return (
                  <div
                    key={term}
                    className="flex min-h-[140px] flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-700">{term}</p>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                        {termUnits} units
                      </span>
                    </div>
                    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                          Planned
                        </p>
                        <DroppableZone id={plannedDropId(yearIndex, term)} className="flex flex-wrap gap-2">
                          {plannedCourses.map((c) => (
                            <CourseBox
                              key={c.code}
                              id={`planned-${yearIndex}-${term}-${c.code}`}
                              course={c}
                              source={{ type: 'planned', yearIndex, term }}
                              variant="planned"
                              onRemove={() => removeFromPlanned(yearIndex, term, c.code)}
                            />
                          ))}
                        </DroppableZone>
                      </div>
                      <div className="mt-auto">
                        <AddCourseInline onAdd={(c) => addToPlanned(yearIndex, term, c)} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          </main>

          {/* Right: Requirements + Notes */}
          <aside className="hidden w-72 shrink-0 xl:block">
            <div className="sticky top-28 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                  Requirements
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Track major, minor, and university requirements as you plan.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-1">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold">Major</p>
                    <p className="mt-1 text-slate-500">0 / XX units planned</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold">WIM / Writing</p>
                    <p className="mt-1 text-slate-500">0 / XX courses planned</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold">Gen Ed</p>
                    <p className="mt-1 text-slate-500">WAYS, PWR, COLLEGE overview</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">Notes</h2>
                <p className="mt-2 text-sm text-slate-600">Leave reminders for future you.</p>
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-xs text-slate-500">
                  Example: CS 221 pairs well with a lighter humanities course.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <DragOverlay>
        {activeCourse ? (
          <div className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-xs font-medium shadow-lg">
            <span className="tracking-wide">{activeCourse.course.code}</span>
            <span className="text-slate-500">({activeCourse.course.units})</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
