import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { getEvalMetricMeta, getEvalValueColor } from '@/data/search/eval-metrics'
import { DEFAULT_YEAR } from '@/data/search/search.params'
import type { InstructorCourseEntry } from '@/data/search/search'
import { instructorProfileQueryOptions } from '@/components/courses/courses-query-options'

export const Route = createFileRoute('/instructor/$sunet')({
  component: InstructorPage,
})

const QUARTER_COLUMNS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const

function QualityChip({ value }: { value: number | null }) {
  if (value == null) return null
  const meta = getEvalMetricMeta('quality')
  const color = getEvalValueColor(value, 'quality')
  if (color === '') return null
  return (
    <span
      className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${color}20`, color }}
      title={`${meta.label}: ${meta.formatValue(value)}`}
    >
      {meta.formatValue(value)}
    </span>
  )
}

function CourseEntryCard({ entry }: { entry: InstructorCourseEntry }) {
  return (
    <Link
      to="/course/$courseId"
      params={{ courseId: entry.courseCodeSlug }}
      className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-opacity hover:shadow-md"
    >
      <div className="text-sm font-semibold text-slate-900">{entry.displayCode}</div>
      <div className="mt-0.5 truncate text-xs text-slate-600">{entry.title}</div>
      <div className="mt-1.5">
        <QualityChip value={entry.avgQuality} />
      </div>
    </Link>
  )
}

function InstructorPage() {
  const { sunet } = Route.useParams()

  const startYear = parseInt(DEFAULT_YEAR.split('-')[0]!, 10)
  const years = useMemo(
    () => [
      DEFAULT_YEAR,
      `${startYear - 1}-${startYear}`,
      `${startYear - 2}-${startYear - 1}`,
      `${startYear - 3}-${startYear - 2}`,
    ],
    [startYear],
  )

  const { data: profile, isPending } = useQuery(instructorProfileQueryOptions(sunet, years))

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [sunet])

  if (!isPending && profile == null) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] flex-col items-center justify-center bg-sky-50">
        <p className="text-lg text-slate-800">Instructor not found.</p>
      </div>
    )
  }

  const entriesByYearQuarter = useMemo(() => {
    if (!profile) return new Map<string, Map<string, InstructorCourseEntry[]>>()
    const map = new Map<string, Map<string, InstructorCourseEntry[]>>()
    for (const entry of profile.entries) {
      let yearMap = map.get(entry.year)
      if (!yearMap) {
        yearMap = new Map<string, InstructorCourseEntry[]>()
        map.set(entry.year, yearMap)
      }
      let list = yearMap.get(entry.quarter)
      if (!list) {
        list = []
        yearMap.set(entry.quarter, list)
      }
      list.push(entry)
    }
    return map
  }, [profile])

  const sortedYears = useMemo(
    () => Array.from(entriesByYearQuarter.keys()).sort((a, b) => b.localeCompare(a)),
    [entriesByYearQuarter],
  )

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] overflow-x-clip bg-sky-50">
      <main className="mx-auto w-full max-w-6xl px-2.5 pt-5 pb-8">
        <div className="mb-5 space-y-1">
          {isPending ? (
            <>
              <div className="h-12 w-2/5 animate-pulse rounded bg-slate-200" />
              <div className="h-5 w-1/5 animate-pulse rounded bg-slate-100" />
            </>
          ) : (
            <>
              <h1 className="text-3xl leading-tight font-semibold tracking-tight text-slate-900 md:text-4xl">
                {profile?.name}
              </h1>
              <a
                href={`mailto:${sunet}@stanford.edu`}
                className="text-sm text-slate-500 transition-colors hover:text-primary hover:underline"
              >
                {sunet}@stanford.edu
              </a>
            </>
          )}
        </div>

        {isPending ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 4 }, (_, j) => (
                    <div key={j} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : sortedYears.length > 0 ? (
          <div className="space-y-6">
            {sortedYears.map((year) => {
              const quarterMap = entriesByYearQuarter.get(year)!
              return (
                <div key={year}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">{year}</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {QUARTER_COLUMNS.map((q) => {
                      const courses = quarterMap.get(q)
                      return (
                        <div key={q} className="space-y-2">
                          <div className="text-xs font-medium text-slate-500">{q}</div>
                          {courses != null && courses.length > 0 ? (
                            courses.map((entry, idx) => (
                              <CourseEntryCard key={`${entry.courseCodeSlug}-${idx}`} entry={entry} />
                            ))
                          ) : (
                            <div className="flex min-h-[5rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400">
                              —
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">No teaching history found.</p>
        )}
      </main>
    </div>
  )
}
