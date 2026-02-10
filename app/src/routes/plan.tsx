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
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/plan')({ component: PlanPage })

const TERMS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const
type TermKey = (typeof TERMS)[number]

type PlannedCourse = { code: string; title: string; units: number }

function quarterKey(yearIndex: number, term: TermKey) {
  return `${yearIndex}-${term}`
}

// Initial planned courses (Year 1 only for demo)
const INITIAL_PLANNED: Record<string, PlannedCourse[]> = {
  '0-Autumn': [
    { code: 'PWR 1', title: 'Writing & Rhetoric', units: 4 },
    { code: 'MATH 51', title: 'Linear Algebra & Multivariable Calculus', units: 5 },
    { code: 'CS 106A', title: 'Programming Methodology', units: 5 },
    { code: 'ESF 10', title: 'Education as Self-Fashioning', units: 4 },
  ],
  '0-Winter': [
    { code: 'CS 106B', title: 'Programming Abstractions', units: 5 },
    { code: 'MATH 52', title: 'Integral Calculus of Several Variables', units: 5 },
    { code: 'PWR 2', title: 'Writing & Rhetoric 2', units: 4 },
  ],
  '0-Spring': [
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
type DragSource = { type: 'global' } | { type: 'planned'; yearIndex: number; term: TermKey } | { type: 'stash'; yearIndex: number; term: TermKey }
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
  const base = 'inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium shadow-sm transition cursor-grab active:cursor-grabbing'
  const variantClass =
    variant === 'planned'
      ? 'border-slate-300 bg-white text-slate-800 hover:border-[#8C1515]/50'
      : variant === 'stash'
        ? 'border-amber-300 bg-amber-50 text-slate-800 hover:border-amber-400'
        : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300'
  const sixDots = (
    <span className="ml-auto flex pointer-events-none" aria-hidden>
      <span className="flex flex-col gap-[2px]">
        <span className="flex gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-slate-400" /><span className="h-1 w-1 rounded-full bg-slate-400" />
        </span>
        <span className="flex gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-slate-400" /><span className="h-1 w-1 rounded-full bg-slate-400" />
        </span>
        <span className="flex gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-slate-400" /><span className="h-1 w-1 rounded-full bg-slate-400" />
        </span>
      </span>
    </span>
  )
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${base} ${variantClass} ${isDragging ? 'opacity-50' : ''}`}
    >
      <span className="tracking-wide">{course.code}</span>
      <span className="text-slate-500">({course.units})</span>
      {variant === 'stash' && (
        <span className="ml-1 flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          {onMoveToPlanned && <button type="button" onClick={() => onMoveToPlanned()} className="rounded p-0.5 text-slate-500 hover:bg-amber-200 hover:text-[#8C1515]" title="To planned">+</button>}
          {onRemove && <button type="button" onClick={() => onRemove()} className="rounded p-0.5 text-slate-400 hover:bg-amber-200 hover:text-[#8C1515]" title="Remove">×</button>}
        </span>
      )}
      {variant === 'global' && onRemove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove() }} className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-[#8C1515]" title="Remove">×</button>
      )}
      {sixDots}
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
      className={`min-h-[2.5rem] rounded-lg transition ${isOver ? 'ring-2 ring-[#8C1515]/40 bg-[#8C1515]/5' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

function PlanPage() {
  const START_YEAR = 2024
  const [viewYear, setViewYear] = useState(START_YEAR) // which single academic year we're showing
  const [planned, setPlanned] = useState<Record<string, PlannedCourse[]>>(INITIAL_PLANNED)
  const [globalStash, setGlobalStash] = useState<PlannedCourse[]>([])
  const [quarterStash, setQuarterStash] = useState<Record<string, PlannedCourse[]>>({})
  const [searchQuery, setSearchQuery] = useState('')

  const yearIndex = viewYear - START_YEAR
  const viewYearLabel = `${viewYear}-${String(viewYear + 1).slice(-2)}`
  const canGoPrev = viewYear > START_YEAR
  const canGoNext = viewYear < START_YEAR + 3

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
  }

  function removeFromGlobalStash(code: string) {
    setGlobalStash((prev) => prev.filter((c) => c.code !== code))
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
  }

  function removeFromPlanned(yearIndex: number, term: TermKey, code: string) {
    const key = quarterKey(yearIndex, term)
    setPlanned((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((c) => c.code !== code),
    }))
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
    if (!over) return
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
    if (!activeId) return null
    for (const c of globalStash) if (`global-${c.code}` === activeId) return { course: c, variant: 'global' as const }
    for (let yi = 0; yi < 4; yi++)
      for (const term of TERMS) {
        for (const c of getPlanned(yi, term)) if (`planned-${yi}-${term}-${c.code}` === activeId) return { course: c, variant: 'planned' as const }
        for (const c of getQuarterStash(yi, term)) if (`stash-${yi}-${term}-${c.code}` === activeId) return { course: c, variant: 'stash' as const }
      }
    return null
  })()

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
        <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-6 pb-16 pt-10">
          {/* Left: Search + Global stash */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-28 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Search courses
                </h2>
                <input
                  type="text"
                  placeholder="Course code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#8C1515] focus:outline-none focus:ring-1 focus:ring-[#8C1515]"
                />
                {searchResults.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {searchResults.map((c) => (
                      <li
                        key={c.code}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs"
                      >
                        <span className="font-medium text-slate-800">{c.code}</span>
                        <button
                          type="button"
                          onClick={() => addToGlobalStash(c)}
                          className="rounded bg-[#8C1515] px-2 py-0.5 text-[10px] text-white hover:bg-[#7A1212]"
                        >
                          Stash
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
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
          <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-normal text-slate-900">4-year plan</h1>
              <p className="mt-1 text-sm text-slate-600">
                Map out each quarter; use stashes to try options before committing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-800 shadow-sm transition hover:border-[#8C1515] hover:text-[#8C1515]"
              >
                Import current schedule
              </button>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => Math.max(START_YEAR, y - 1))}
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
                  onClick={() => setViewYear((y) => Math.min(START_YEAR + 3, y + 1))}
                  disabled={!canGoNext}
                  className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Next year"
                >
                  →
                </button>
              </div>
            </div>
          </header>

          <section className="grid w-full grid-cols-1 gap-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
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
                          />
                        ))}
                      </DroppableZone>
                    </div>
                    <button
                      type="button"
                      className="mt-auto w-full rounded-full bg-slate-900/90 px-2 py-1.5 text-[11px] font-normal text-slate-50 transition hover:bg-slate-900"
                    >
                      Add course
                    </button>
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
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
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
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Notes
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Leave reminders for future you.
              </p>
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
