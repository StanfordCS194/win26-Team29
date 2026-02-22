import { Route } from '@/routes/courses'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { WAYS_OPTIONS, type CoursesSearch, extractEvalFilters } from '@/data/search/search.types'
import { searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { EvalFilterParam } from '@/data/search/search.queries'
import type { Quarter, SortOption, Way } from '@/data/search/search.types'

function WaysCheckbox({
  way,
  checked,
  onToggle,
  query,
  year,
  quarters,
  ways,
  unitsMin,
  unitsMax,
  sort,
  order,
  evalFilters,
}: {
  way: Way
  checked: boolean
  onToggle: () => void
  query: string
  year: string
  quarters: Quarter[]
  ways: Way[]
  unitsMin: number | undefined
  unitsMax: number | undefined
  sort: SortOption
  order: 'asc' | 'desc'
  evalFilters: EvalFilterParam[]
}) {
  const hoverProps = usePrefetchOnHover(() =>
    searchQueryOptions(
      query,
      year,
      quarters,
      checked ? ways.filter((w) => w !== way) : [...ways, way],
      unitsMin,
      unitsMax,
      sort,
      order,
      evalFilters,
      1,
    ),
  )

  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
      {...hoverProps}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
      />
      {way}
    </label>
  )
}

export function WaysFilter() {
  const [open, setOpen] = useState(false)
  const search = Route.useSearch()
  const { query, year, quarters, ways, unitsMin, unitsMax, sort, order } = search
  const evalFilters = extractEvalFilters(search)
  const navigate = Route.useNavigate()

  const toggle = (way: Way) => {
    const next = ways.includes(way) ? ways.filter((w) => w !== way) : [...ways, way]
    void navigate({
      search: (prev) => ({ ...prev, ways: next, page: 1 }) as Required<CoursesSearch>,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded text-xs font-medium tracking-wide text-slate-500 uppercase transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Ways
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-0.5">
          {WAYS_OPTIONS.map((way) => (
            <WaysCheckbox
              key={way}
              way={way}
              checked={ways.includes(way)}
              onToggle={() => toggle(way)}
              query={query}
              year={year}
              quarters={quarters}
              ways={ways}
              unitsMin={unitsMin}
              unitsMax={unitsMax}
              sort={sort}
              order={order}
              evalFilters={evalFilters}
            />
          ))}
        </div>
      )}
    </div>
  )
}
