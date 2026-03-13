import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getUserPlan } from '@/data/plan/plan-server'
import { getCourseByCode } from '@/data/search/search'
import { parseCourseCodeSlug, toCourseCodeSlug } from '@/lib/course-code'
import { courseClassmatesQueryOptions } from '@/data/social/social-query-options'
import { userQueryOptions } from '@/data/auth'

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
type QuarterKey = (typeof QUARTERS)[number]

const PLAN_SPAN_STORAGE_KEY = 'plan-span'

function getStoredPlanSpan(): number {
  if (typeof window === 'undefined') return 4
  const stored = localStorage.getItem(PLAN_SPAN_STORAGE_KEY)
  if (stored == null) return 4
  const n = parseInt(stored, 10)
  return n >= 1 && n <= 5 ? n : 4
}

type PlanSlot = { quarter: QuarterKey; planYear: number }

function buildAllSlots(startYear: number, span: number): PlanSlot[] {
  return Array.from({ length: span * 4 }, (_, i) => ({
    planYear: startYear + Math.floor(i / 4),
    quarter: QUARTERS[i % 4]!,
  }))
}

function guessCurrentSlot(): { quarter: QuarterKey; planYear: number } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  if (month >= 9) return { quarter: 'Autumn', planYear: year }
  if (month >= 6) return { quarter: 'Summer', planYear: year - 1 }
  if (month >= 3) return { quarter: 'Spring', planYear: year - 1 }
  return { quarter: 'Winter', planYear: year - 1 }
}

const START_MIN = 8 * 60
const END_MIN = 19 * 60
const SLOT_MINUTES = 60
const SLOT_COUNT = (END_MIN - START_MIN) / SLOT_MINUTES
const ROW_HEIGHT = 24

function slotLabel(index: number): string {
  const totalMin = START_MIN + index * SLOT_MINUTES
  const h = Math.floor(totalMin / 60)
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
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
  { bg: 'rgba(99,102,241,0.15)', text: '#3730a3' },
  { bg: 'rgba(16,185,129,0.15)', text: '#065f46' },
  { bg: 'rgba(245,158,11,0.15)', text: '#92400e' },
  { bg: 'rgba(244,63,94,0.15)', text: '#9f1239' },
  { bg: 'rgba(6,182,212,0.15)', text: '#155e75' },
  { bg: 'rgba(168,85,247,0.15)', text: '#6b21a8' },
  { bg: 'rgba(249,115,22,0.15)', text: '#9a3412' },
]

type CalendarBlock = {
  code: string
  title: string
  day: DayKey
  startMin: number
  endMin: number
  sectionNumber: string
  colorIdx: number
  isPreview: boolean
}

// ── Overlap layout algorithm ─────────────────────────────────────────

type LayoutBlock = CalendarBlock & { column: number; totalColumns: number }

function layoutBlocksForDay(dayBlocks: CalendarBlock[]): LayoutBlock[] {
  if (dayBlocks.length === 0) return []

  const sorted = [...dayBlocks].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - b.startMin - (a.endMin - a.startMin),
  )

  const columnEnds: number[] = []
  const assigned: { block: CalendarBlock; column: number }[] = []

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

// ── Helpers ──────────────────────────────────────────────────────────

function courseCodeToSlug(code: string) {
  return toCourseCodeSlug({
    subjectCode: code.split(' ')[0]!,
    codeNumber: parseInt(code.split(' ')[1]!, 10),
    codeSuffix: code.split(' ')[1]?.replace(/^\d+/, '') || null,
  })
}

async function resolveScheduleBlocks(
  courses: { code: string; colorIdx: number }[],
  quarter: string,
  year: string | undefined,
  isPreview: boolean,
): Promise<CalendarBlock[]> {
  const results = await Promise.allSettled(
    courses.map((c) =>
      getCourseByCode({ data: { courseCodeSlug: courseCodeToSlug(c.code), year } }).then((result) => ({
        course: c,
        result,
      })),
    ),
  )

  const blocks: CalendarBlock[] = []
  for (const settled of results) {
    if (settled.status !== 'fulfilled' || !settled.value.result) continue
    const { course: c, result } = settled.value
    const sections = (result.sections ?? []).filter(
      (s) => s.termQuarter === quarter && !s.cancelled && (s.unitsMin != null || s.unitsMax != null),
    )
    for (const sec of sections) {
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
          blocks.push({
            code: c.code,
            title: result.title,
            day,
            startMin,
            endMin,
            sectionNumber: sec.sectionNumber,
            colorIdx: c.colorIdx,
            isPreview,
          })
        }
      }
    }
  }
  return blocks
}

// ── Section info derived from blocks ─────────────────────────────────

type SectionOption = { sectionNumber: string; label: string }

function buildSectionOptions(blocks: CalendarBlock[]): Record<string, SectionOption[]> {
  const info: Record<string, SectionOption[]> = {}
  for (const block of blocks) {
    if (info[block.code] === undefined) info[block.code] = []
    if (info[block.code].some((s) => s.sectionNumber === block.sectionNumber)) continue
    const secBlocks = blocks.filter((b) => b.code === block.code && b.sectionNumber === block.sectionNumber)
    const days = [...new Set(secBlocks.map((b) => b.day))].join(', ')
    const first = secBlocks[0]
    const time = first !== undefined ? `${formatTime(first.startMin)}-${formatTime(first.endMin)}` : ''
    info[block.code].push({ sectionNumber: block.sectionNumber, label: `${days} ${time}` })
  }
  return info
}

// ── Component ────────────────────────────────────────────────────────

export function WeeklyCalendar({
  year: _year,
  onAddToQuarter,
  onRemoveFromQuarter,
  onSlotChange,
  availableQuarters,
  courseCode,
  refreshTrigger,
}: {
  year?: string
  onAddToQuarter?: (quarter: string, planYear: number) => void
  onRemoveFromQuarter?: (quarter: string, planYear: number) => void
  onSlotChange?: (quarter: string, planYear: number, isCourseAdded: boolean) => void
  availableQuarters?: string[]
  courseCode?: string
  refreshTrigger?: number
}) {
  const [planStartYear, setPlanStartYear] = useState<number | null>(null)
  const [slotIdx, setSlotIdx] = useState(0)
  const [planCourses, setPlanCourses] = useState<{ code: string; quarter: string; planYear: string }[]>([])
  const [planBlocks, setPlanBlocks] = useState<CalendarBlock[]>([])
  const [previewBlocks, setPreviewBlocks] = useState<CalendarBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSections, setSelectedSections] = useState<Record<string, string>>({})

  // ── All navigable quarter-slots across the plan ──────────────────
  const allSlots = useMemo((): PlanSlot[] => {
    if (planStartYear === null) return []
    return buildAllSlots(planStartYear, getStoredPlanSpan())
  }, [planStartYear])

  // Auto-jump to the current academic quarter the first time slots load
  const didJumpRef = useRef(false)
  useEffect(() => {
    if (didJumpRef.current || allSlots.length === 0) return
    didJumpRef.current = true
    const guess = guessCurrentSlot()
    const idx = allSlots.findIndex((s) => s.quarter === guess.quarter && s.planYear === guess.planYear)
    if (idx >= 0) setSlotIdx(idx)
  }, [allSlots])

  const currentSlot: PlanSlot = allSlots[slotIdx] ?? guessCurrentSlot()
  const quarter = currentSlot.quarter
  const academicYear = `${currentSlot.planYear}-${currentSlot.planYear + 1}`

  // ── Load plan courses ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    getUserPlan()
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setLoading(false)
          return
        }
        setPlanStartYear(data.startYear)
        const courses: { code: string; quarter: string; planYear: string }[] = []
        for (const [key, list] of Object.entries(data.planned)) {
          // Server keys are year-offset based: "0-Autumn", "1-Winter", etc.
          const dashIdx = key.indexOf('-')
          const yearOffset = parseInt(key.slice(0, dashIdx), 10)
          const q = key.slice(dashIdx + 1)
          const actualPlanYear = data.startYear + yearOffset
          for (const c of list) courses.push({ code: c.code, quarter: q, planYear: String(actualPlanYear) })
        }
        setPlanCourses(courses)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshTrigger])

  // ── Courses in current quarter ───────────────────────────────────
  // planYear is the Autumn calendar year of the academic year (all 4 quarters share it)
  const coursesInQuarter = useMemo(
    () => planCourses.filter((c) => c.quarter === quarter && c.planYear === String(currentSlot.planYear)),
    [planCourses, quarter, currentSlot.planYear],
  )
  const coursesKey = useMemo(
    () =>
      coursesInQuarter
        .map((c) => c.code)
        .sort()
        .join(','),
    [coursesInQuarter],
  )

  const isCurrentCourseInPlan =
    courseCode != null && courseCode !== '' ? coursesInQuarter.some((c) => c.code === courseCode) : false

  // Notify parent of current slot and whether the course is in it
  useEffect(() => {
    onSlotChange?.(currentSlot.quarter, currentSlot.planYear, isCurrentCourseInPlan)
  }, [currentSlot.quarter, currentSlot.planYear, isCurrentCourseInPlan, onSlotChange])

  // ── Resolve schedule blocks for planned courses ──────────────────
  const resolveIdRef = useRef(0)

  useEffect(() => {
    if (coursesInQuarter.length === 0) {
      setPlanBlocks([])
      return
    }
    const id = ++resolveIdRef.current

    void resolveScheduleBlocks(
      coursesInQuarter.map((c, i) => ({ code: c.code, colorIdx: i })),
      quarter,
      academicYear,
      false,
    )
      .then((blocks) => {
        if (resolveIdRef.current === id) setPlanBlocks(blocks)
      })
      .catch(() => {})
  }, [coursesKey, academicYear, quarter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve preview blocks ───────────────────────────────────────
  const previewIdRef = useRef(0)

  useEffect(() => {
    if (courseCode == null || courseCode === '' || isCurrentCourseInPlan) {
      setPreviewBlocks([])
      return
    }
    const id = ++previewIdRef.current

    void resolveScheduleBlocks([{ code: courseCode, colorIdx: -1 }], quarter, academicYear, true)
      .then((blocks) => {
        if (previewIdRef.current === id) setPreviewBlocks(blocks)
      })
      .catch(() => {})
  }, [courseCode, isCurrentCourseInPlan, academicYear, quarter])

  // ── Section options & auto-selection ─────────────────────────────
  const allRawBlocks = useMemo(() => [...planBlocks, ...previewBlocks], [planBlocks, previewBlocks])

  const sectionOptions = useMemo(() => buildSectionOptions(allRawBlocks), [allRawBlocks])

  // Auto-select the first section for any course that doesn't have a selection yet
  useEffect(() => {
    setSelectedSections((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [code, sections] of Object.entries(sectionOptions)) {
        if (sections.length === 0) continue
        if (!next[code] || !sections.some((s) => s.sectionNumber === next[code])) {
          next[code] = sections[0]!.sectionNumber
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [sectionOptions])

  // ── Filter blocks to selected sections ───────────────────────────
  const displayBlocks = useMemo(() => {
    return allRawBlocks.filter((b) => {
      const selected = selectedSections[b.code]
      if (!selected) return true
      return b.sectionNumber === selected
    })
  }, [allRawBlocks, selectedSections])

  // ── Layout ───────────────────────────────────────────────────────
  const layoutByDay = useMemo(() => {
    const map = new Map<DayKey, LayoutBlock[]>()
    for (const day of DAYS) {
      map.set(day, layoutBlocksForDay(displayBlocks.filter((b) => b.day === day)))
    }
    return map
  }, [displayBlocks])

  // ── Section picker helpers ───────────────────────────────────────
  function cycleSection(code: string, delta: number) {
    const options = sectionOptions[code]
    if (options === undefined || options.length <= 1) return
    const currentIdx = options.findIndex((s) => s.sectionNumber === selectedSections[code])
    const nextIdx = (currentIdx + delta + options.length) % options.length
    setSelectedSections((prev) => ({ ...prev, [code]: options[nextIdx]!.sectionNumber }))
  }

  // ── Render helpers ───────────────────────────────────────────────
  const times = Array.from({ length: SLOT_COUNT }, (_, i) => i)
  const gridHeight = SLOT_COUNT * ROW_HEIGHT
  const totalUnits = coursesInQuarter.length * 4

  // All courses to show in summary: planned + preview (if any)
  const summaryCourses = useMemo(() => {
    const items: { code: string; isPreview: boolean }[] = coursesInQuarter.map((c) => ({
      code: c.code,
      isPreview: false,
    }))
    if (courseCode != null && courseCode !== '' && !isCurrentCourseInPlan && previewBlocks.length > 0) {
      items.push({ code: courseCode, isPreview: true })
    }
    return items
  }, [coursesInQuarter, courseCode, isCurrentCourseInPlan, previewBlocks])

  return (
    <div className="flex flex-col gap-3">
      {/* Quarter nav + add/remove */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm text-white">
          <button
            type="button"
            onClick={() => setSlotIdx((i) => Math.max(0, i - 1))}
            disabled={slotIdx === 0}
            className="px-1 disabled:opacity-30"
          >
            ←
          </button>
          <span className="font-medium">
            {quarter} {currentSlot.planYear}–{String(currentSlot.planYear + 1).slice(-2)}
          </span>
          <button
            type="button"
            onClick={() => setSlotIdx((i) => Math.min(Math.max(allSlots.length - 1, 0), i + 1))}
            disabled={allSlots.length > 0 && slotIdx >= allSlots.length - 1}
            className="px-1 disabled:opacity-30"
          >
            →
          </button>
        </div>
        {(onAddToQuarter || onRemoveFromQuarter) &&
          (() => {
            const isAdded =
              courseCode != null && courseCode !== ''
                ? coursesInQuarter.some((c) => c.code === courseCode)
                : false
            const canAdd = !availableQuarters || availableQuarters.includes(quarter)
            if (isAdded && onRemoveFromQuarter) {
              return (
                <button
                  type="button"
                  onClick={() => onRemoveFromQuarter(quarter, currentSlot.planYear)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-500 text-lg font-bold text-white shadow-sm transition-all hover:scale-110 hover:bg-slate-600"
                  title={`Remove from ${quarter}`}
                >
                  ✕
                </button>
              )
            }
            if (onAddToQuarter) {
              return (
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => onAddToQuarter(quarter, currentSlot.planYear)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold shadow-sm transition-all ${
                    canAdd
                      ? 'bg-primary text-white hover:scale-110 hover:bg-primary-hover'
                      : 'cursor-not-allowed bg-slate-200 text-slate-400'
                  }`}
                  title={canAdd ? `Add to ${quarter}` : `Not offered in ${quarter}`}
                >
                  +
                </button>
              )
            }
            return null
          })()}
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] border-b border-slate-100 bg-slate-50/60 px-1 py-1.5 text-[10px] font-medium text-slate-500">
          <div />
          {DAYS.map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '40px repeat(5, minmax(0, 1fr))', padding: 4 }}>
          <div style={{ height: gridHeight }}>
            {times.map((i) => (
              <div
                key={i}
                className="flex items-center justify-end pr-1 text-[9px] text-slate-400"
                style={{ height: ROW_HEIGHT }}
              >
                {slotLabel(i)}
              </div>
            ))}
          </div>

          {DAYS.map((day) => {
            const dayLayout = layoutByDay.get(day) ?? []
            return (
              <div key={day} className="relative" style={{ height: gridHeight }}>
                {times.map((i) => (
                  <div
                    key={i}
                    className="border-b border-slate-100/60 bg-slate-50/30"
                    style={{ height: ROW_HEIGHT }}
                  />
                ))}

                {dayLayout.map((block, idx) => {
                  const top = ((block.startMin - START_MIN) / SLOT_MINUTES) * ROW_HEIGHT
                  const height = ((block.endMin - block.startMin) / SLOT_MINUTES) * ROW_HEIGHT
                  const leftPct = (block.column / block.totalColumns) * 100
                  const widthPct = (1 / block.totalColumns) * 100
                  const color = block.isPreview ? null : BLOCK_COLORS[block.colorIdx % BLOCK_COLORS.length]!

                  return (
                    <div
                      key={`${block.code}-${block.sectionNumber}-${idx}`}
                      className={`absolute rounded ${block.isPreview ? 'border border-dashed border-primary/40' : ''}`}
                      style={{
                        top,
                        height: Math.max(height - 1, ROW_HEIGHT - 1),
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        backgroundColor: block.isPreview ? 'rgba(140,21,21,0.08)' : color?.bg,
                        color: block.isPreview ? 'rgba(140,21,21,0.5)' : color?.text,
                        zIndex: block.isPreview ? 0 : 1,
                      }}
                    >
                      <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 text-[10px]">
                        <span className="truncate leading-tight font-semibold">{block.code}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary with section pickers */}
      {!loading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              Pinned units: <strong>{totalUnits}</strong>
            </span>
          </div>
          {summaryCourses.length > 0 && (
            <div className="space-y-1">
              {summaryCourses.map((item) => {
                const options = sectionOptions[item.code] ?? []
                const selected = selectedSections[item.code]
                const selectedOption = options.find((s) => s.sectionNumber === selected)
                const selectedIdx = options.findIndex((s) => s.sectionNumber === selected)

                return (
                  <div
                    key={item.code}
                    className={`rounded-lg px-2 py-1.5 text-[11px] ${
                      item.isPreview ? 'border border-dashed border-primary/30 bg-primary/5' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium ${item.isPreview ? 'text-primary/70' : 'text-slate-800'}`}
                      >
                        {item.code}
                        {item.isPreview && (
                          <span className="ml-1 font-normal text-primary/40 italic">preview</span>
                        )}
                      </span>
                      {options.length > 1 && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => cycleSection(item.code, -1)}
                            className="px-1 text-slate-400 transition-colors hover:text-slate-700"
                          >
                            ‹
                          </button>
                          <span className="min-w-[28px] text-center text-[10px] text-slate-400 tabular-nums">
                            {selectedIdx + 1}/{options.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => cycleSection(item.code, 1)}
                            className="px-1 text-slate-400 transition-colors hover:text-slate-700"
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                    {selectedOption && (
                      <div className={`mt-0.5 ${item.isPreview ? 'text-primary/40' : 'text-slate-500'}`}>
                        {selectedOption.label}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {summaryCourses.length === 0 && (
            <p className="text-center text-xs text-slate-400">No courses planned for {quarter}</p>
          )}
        </div>
      )}

      {/* Classmates planning this course */}
      {courseCode != null && courseCode !== '' && (
        <CalendarClassmates courseCode={courseCode} quarter={quarter} year={academicYear} />
      )}
    </div>
  )
}

// ── Classmates sub-component ──────────────────────────────────────────

function CalendarClassmates({
  courseCode,
  quarter,
  year,
}: {
  courseCode: string
  quarter: string
  year: string | undefined
}) {
  const { data: authUser } = useQuery(userQueryOptions)
  // courseCode may be a slug ("cs161") or display format ("CS 161") — handle both
  const parsed = useMemo(() => {
    // Try slug parse first
    const slugResult = parseCourseCodeSlug(courseCode)
    if (slugResult) return slugResult
    // Try spaced format: "CS 161", "MATH 51A"
    const m = courseCode.match(/^([A-Z]+(?:\s[A-Z]+)?)\s+(\d+)([A-Za-z]*)$/)
    if (m) return { subjectCode: m[1]!, codeNumber: parseInt(m[2]!, 10), codeSuffix: m[3] || null }
    return null
  }, [courseCode])

  // Derive numeric year: Autumn uses start year, Winter/Spring/Summer use end year
  const numericYear = useMemo(() => {
    if (year == null || year === '') return undefined
    const parts = year.split('-')
    if (parts.length !== 2) return undefined
    const startYear = parseInt(parts[0]!, 10)
    const endYear = parseInt(parts[1]!, 10)
    return quarter === 'Autumn' ? startYear : endYear
  }, [year, quarter])

  const { data: classmates } = useQuery({
    ...courseClassmatesQueryOptions(
      parsed?.subjectCode ?? '',
      parsed?.codeNumber ?? 0,
      parsed?.codeSuffix,
      quarter,
      numericYear,
    ),
    enabled: !!parsed && !!authUser && numericYear != null,
  })

  if (!classmates || classmates.length === 0) return null

  const MAX_VISIBLE = 6
  const visible = classmates.slice(0, MAX_VISIBLE)
  const overflowCount = classmates.length - MAX_VISIBLE

  return (
    <div className="rounded-xl border border-white/50 bg-white/40 p-3 shadow-sm backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="h-3.5 w-0.5 rounded-full bg-primary" />
        <span className="text-[11px] font-semibold text-[#150F21]">
          {classmates.length} {classmates.length === 1 ? 'person' : 'people'} planning this
        </span>
        <span className="ml-auto text-[10px] text-[#4A4557]/50">
          {quarter} {numericYear}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map((cm) => (
          <Link
            key={cm.userId}
            to="/profile/$userId"
            params={{ userId: cm.userId }}
            title={cm.displayName}
            className="group relative"
          >
            {cm.avatarUrl != null ? (
              <img
                src={cm.avatarUrl}
                alt={cm.displayName}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-white transition-transform group-hover:scale-110"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-2 ring-white transition-transform group-hover:scale-110">
                {cm.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
        ))}
        {overflowCount > 0 && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4A4557]/10 text-xs font-semibold text-[#4A4557] ring-2 ring-white">
            +{overflowCount}
          </div>
        )}
      </div>
    </div>
  )
}
