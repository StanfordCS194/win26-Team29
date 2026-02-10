import React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/schedule')({ component: SchedulePage })

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
type DayKey = (typeof DAYS)[number]

// 1-hour slots from 8:00 (480 min) to 19:00 (7pm)
const SLOT_MINUTES = 60
const START_MIN = 8 * 60
const END_MIN = 19 * 60
const SLOT_COUNT = (END_MIN - START_MIN) / SLOT_MINUTES

function slotIndexToLabel(index: number): string {
  const totalMin = START_MIN + index * SLOT_MINUTES
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return '12:' + (m === 0 ? '00 AM' : `${m.toString().padStart(2, '0')} AM`)
  if (h < 12) return `${h}:${m === 0 ? '00' : m.toString().padStart(2, '0')} AM`
  if (h === 12) return `12:${m === 0 ? '00' : m.toString().padStart(2, '0')} PM`
  return `${h - 12}:${m === 0 ? '00' : m.toString().padStart(2, '0')} PM`
}

function formatTime(minFromMidnight: number): string {
  const h = Math.floor(minFromMidnight / 60)
  const m = minFromMidnight % 60
  const hour = h % 12 || 12
  const min = m.toString().padStart(2, '0')
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour}:${min} ${ampm}`
}

type ScheduleCourse = {
  code: string
  title: string
  timing: string
  days: readonly DayKey[]
  startMin: number // minutes from midnight
  endMin: number
  location?: string
}

const SCHEDULE_COURSES: ScheduleCourse[] = [
  {
    code: 'CS 106A',
    title: 'Programming Methodology',
    timing: 'Mon Wed Fri · 10:30–11:20',
    days: ['Mon', 'Wed', 'Fri'],
    startMin: 10 * 60 + 30,
    endMin: 11 * 60 + 20,
    location: 'Gates B01',
  },
  {
    code: 'MATH 51',
    title: 'Linear Algebra & Multivariable Calc',
    timing: 'Tue Thu · 11:30–12:20',
    days: ['Tue', 'Thu'],
    startMin: 11 * 60 + 30,
    endMin: 12 * 60 + 20,
  },
  {
    code: 'PWR 1',
    title: 'Writing & Rhetoric',
    timing: 'Tue Thu · 9:30–11:00',
    days: ['Tue', 'Thu'],
    startMin: 9 * 60 + 30,
    endMin: 11 * 60 + 0,
  },
  {
    code: 'EMED 127',
    title: 'Healthcare Leadership',
    timing: 'Wed · 5:00–7:00 pm',
    days: ['Wed'],
    startMin: 17 * 60 + 0,
    endMin: 19 * 60 + 0,
  },
]

function getBlockAt(
  rowIndex: number,
  day: DayKey,
): { course: ScheduleCourse; rowSpan: number } | null {
  const rowStartMin = START_MIN + rowIndex * SLOT_MINUTES
  for (const course of SCHEDULE_COURSES) {
    if (!course.days.includes(day)) continue
    const blockEnd = course.endMin
    if (course.startMin >= rowStartMin + SLOT_MINUTES || blockEnd <= rowStartMin) continue
    const startRow = Math.floor((course.startMin - START_MIN) / SLOT_MINUTES)
    if (startRow !== rowIndex) continue
    const endRow = Math.ceil((blockEnd - START_MIN) / SLOT_MINUTES)
    const rowSpan = Math.max(1, endRow - startRow)
    return { course, rowSpan }
  }
  return null
}

function isCoveredByBlockAbove(rowIndex: number, day: DayKey): boolean {
  if (rowIndex === 0) return false
  for (const course of SCHEDULE_COURSES) {
    if (!course.days.includes(day)) continue
    const startRow = Math.floor((course.startMin - START_MIN) / SLOT_MINUTES)
    const endRow = Math.ceil((course.endMin - START_MIN) / SLOT_MINUTES)
    if (rowIndex > startRow && rowIndex < endRow) return true
  }
  return false
}

function SchedulePage() {
  const days = DAYS
  const times = Array.from({ length: SLOT_COUNT }, (_, i) => slotIndexToLabel(i))

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-normal text-slate-900">
              Weekly schedule
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Visualize how your classes fit together across the week.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#8C1515] px-4 py-2 text-sm font-normal text-white shadow-sm transition hover:bg-[#7A1212]"
          >
            Add course
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.85fr)]">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Current term
            </h2>
            <div
              className="rounded-2xl border-2 border-slate-200 bg-slate-50/80 px-4 py-4 shadow-sm"
              aria-label="Load summary"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Load
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    16 units
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Est. hours
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    ~18 hrs
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <ul className="divide-y divide-slate-100">
                {SCHEDULE_COURSES.map((course) => (
                  <li
                    key={course.code}
                    className="flex items-start justify-between gap-4 py-3"
                  >
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                        {course.code}
                      </p>
                      <p className="mt-0.5 text-sm font-normal text-slate-900">
                        {course.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {course.timing}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-normal text-slate-500 underline-offset-2 hover:text-[#8C1515] hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Week at a glance
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs font-medium text-slate-500">
                <div />
                {days.map((day) => (
                  <div key={day} className="text-center">
                    {day}
                  </div>
                ))}
              </div>
              <div
                className="grid gap-px bg-slate-100/70 p-2 text-xs"
                style={{
                  gridTemplateColumns: '64px repeat(5, minmax(0, 1fr))',
                  gridTemplateRows: `repeat(${times.length}, 28px)`,
                }}
              >
                {times.map((time, rowIndex) => (
                  <React.Fragment key={time}>
                    <div
                      className="flex items-center justify-end pr-1 text-[11px] font-medium text-slate-400"
                      style={{
                        gridColumn: 1,
                        gridRow: rowIndex + 1,
                      }}
                    >
                      {time}
                    </div>
                    {days.map((day, dayIndex) => {
                      if (isCoveredByBlockAbove(rowIndex, day)) {
                        return (
                          <div
                            key={`${day}-${time}`}
                            style={{
                              gridColumn: dayIndex + 2,
                              gridRow: rowIndex + 1,
                            }}
                          />
                        )
                      }
                      const block = getBlockAt(rowIndex, day)
                      const rowSpan = block?.rowSpan ?? 1
                      return (
                        <div
                          key={`${day}-${time}`}
                          className="relative rounded bg-slate-50"
                          style={{
                            gridColumn: dayIndex + 2,
                            gridRow: `${rowIndex + 1} / span ${rowSpan}`,
                            minHeight: 28 * rowSpan - 2,
                          }}
                        >
                          {block ? (
                            <div className="absolute inset-0.5 flex flex-col rounded-md bg-[#8C1515]/12 px-1.5 py-1 text-[10px] text-[#3b0b0b]">
                              <p className="font-semibold leading-tight tracking-[0.08em]">
                                {block.course.code}
                              </p>
                              <p className="mt-0.5 leading-tight text-[9px] text-slate-600">
                                {formatTime(block.course.startMin)}–
                                {formatTime(block.course.endMin)}
                                {block.course.location
                                  ? ` · ${block.course.location}`
                                  : ''}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

