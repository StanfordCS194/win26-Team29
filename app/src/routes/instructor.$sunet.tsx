import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { getEvalMetricMeta, getEvalValueColor } from '@/data/search/eval-metrics'
import { DEFAULT_YEAR, SEARCH_DEFAULTS } from '@/data/search/search.params'
import type { SearchParams } from '@/data/search/search.params'
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
      className="block rounded-xl border border-white/60 bg-white/50 p-3 backdrop-blur-md transition-all hover:bg-white/70 hover:shadow-md"
    >
      <div className="text-sm font-semibold text-[#150F21]">{entry.displayCode}</div>
      <div className="mt-0.5 truncate text-xs text-[#4A4557]/70">{entry.title}</div>
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
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-sky-50 font-['Satoshi']">
        <p className="text-lg text-[#4A4557]">Instructor not found.</p>
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-sky-50 font-['Satoshi']">
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@300,400,500,700&display=swap');
      `}</style>

      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-gradient-to-bl from-purple-300/30 via-blue-300/20 to-transparent blur-3xl" />

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-grow px-4 pt-24 pb-14">
        <Link
          to="/courses"
          search={SEARCH_DEFAULTS as unknown as Required<SearchParams>}
          className="mb-6 inline-block text-sm text-[#4A4557]/60 transition-colors hover:text-primary"
        >
          &larr; Back to search
        </Link>

        <div className="mb-10 space-y-1">
          {isPending ? (
            <>
              <div className="h-12 w-2/5 animate-pulse rounded bg-[#4A4557]/20" />
              <div className="h-5 w-1/5 animate-pulse rounded bg-[#4A4557]/10" />
            </>
          ) : (
            <>
              <h1 className="font-['Clash_Display'] text-5xl leading-tight font-semibold tracking-tight text-[#150F21] md:text-6xl">
                {profile?.name}
              </h1>
              <a
                href={`mailto:${sunet}@stanford.edu`}
                className="text-sm text-[#4A4557]/50 transition-colors hover:text-primary hover:underline"
              >
                {sunet}@stanford.edu
              </a>
            </>
          )}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <h2 className="font-['Clash_Display'] text-xl font-semibold text-[#150F21]">Teaching History</h2>
        </div>

        {isPending ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-5 w-24 animate-pulse rounded bg-[#4A4557]/15" />
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 4 }, (_, j) => (
                    <div key={j} className="h-20 animate-pulse rounded-xl bg-white/40" />
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
                  <h3 className="mb-2 text-sm font-bold text-[#150F21]/70">{year}</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {QUARTER_COLUMNS.map((q) => {
                      const courses = quarterMap.get(q)
                      return (
                        <div key={q} className="space-y-2">
                          <div className="text-xs font-medium text-[#4A4557]/50">{q}</div>
                          {courses != null && courses.length > 0 ? (
                            courses.map((entry, idx) => (
                              <CourseEntryCard key={`${entry.courseCodeSlug}-${idx}`} entry={entry} />
                            ))
                          ) : (
                            <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-[#4A4557]/10 text-xs text-[#4A4557]/20">
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
          <p className="py-12 text-center text-sm text-[#4A4557]/60">No teaching history found.</p>
        )}
      </main>
    </div>
  )
}
