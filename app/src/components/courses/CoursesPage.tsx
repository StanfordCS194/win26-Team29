import { useEffect, useState } from 'react'

import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { DEFAULT_ALWAYS_VISIBLE_EVAL_SLUGS } from '@/data/search/eval-metrics'

import { SearchBar } from './SearchBar'
import { SearchResultsContainer } from './SearchResults'
import { SortSelect } from './SortSelect'
import { QuarterTowerMetricSettings } from './QuarterTowerMetricSettings'
import { YearSelect } from './YearSelect'
import { QuarterFilter } from './QuarterFilter'
import { UnitsFilter } from './UnitsFilter'
import { WaysFilter } from './WaysFilter'
import { EvalFilters } from './EvalFilters'

import type { EvalSlug } from '@/data/search/eval-questions'

const ALWAYS_SHOW_LOCAL_STORAGE_KEY = 'courses.alwaysVisibleEvalSlugs'

export function CoursesPage() {
  const [alwaysVisibleEvalSlugs, setAlwaysVisibleEvalSlugs] = useState<EvalSlug[]>(
    DEFAULT_ALWAYS_VISIBLE_EVAL_SLUGS,
  )

  useEffect(() => {
    const stored = window.localStorage.getItem(ALWAYS_SHOW_LOCAL_STORAGE_KEY)
    if (stored === null || stored === '') return
    try {
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const safe = parsed.filter(
        (value): value is EvalSlug =>
          typeof value === 'string' && EVAL_QUESTION_SLUGS.includes(value as EvalSlug),
      )
      setAlwaysVisibleEvalSlugs(safe)
    } catch {
      // Ignore malformed persisted preferences.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ALWAYS_SHOW_LOCAL_STORAGE_KEY, JSON.stringify(alwaysVisibleEvalSlugs))
  }, [alwaysVisibleEvalSlugs])

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-3 pt-6 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div data-search-top-anchor className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>
            <SortSelect />
            <QuarterTowerMetricSettings
              alwaysVisibleEvalSlugs={alwaysVisibleEvalSlugs}
              onAlwaysVisibleEvalSlugsChange={setAlwaysVisibleEvalSlugs}
            />
          </div>
          <SearchResultsContainer alwaysVisibleEvalSlugs={alwaysVisibleEvalSlugs} />
        </div>
        <aside className="hidden w-54 shrink-0 lg:block">
          <div className="sticky top-28">
            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain pt-1 pr-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col gap-4">
                <YearSelect />
                <QuarterFilter />
                <UnitsFilter />
                <EvalFilters />
                <WaysFilter />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
