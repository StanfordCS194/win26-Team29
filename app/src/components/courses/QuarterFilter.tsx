import { Route } from '@/routes/courses'
import { ALL_QUARTERS, CoursesSearch, extractEvalFilters } from '@/data/search/search.types'
import { searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { EvalFilterParam } from '@/data/search/search.queries'
import type { Quarter, SortOption, Way } from '@/data/search/search.types'

function QuarterCheckbox({
  quarter,
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
  quarter: Quarter
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
      checked ? quarters.filter((q) => q !== quarter) : [...quarters, quarter],
      ways,
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
      {quarter}
    </label>
  )
}

export function QuarterFilter() {
  const search = Route.useSearch()
  const { query, year, quarters, ways, unitsMin, unitsMax, sort, order } = search
  const evalFilters = extractEvalFilters(search)
  const navigate = Route.useNavigate()

  const toggle = (quarter: Quarter) => {
    const next = quarters.includes(quarter) ? quarters.filter((q) => q !== quarter) : [...quarters, quarter]
    void navigate({
      search: (prev) => ({ ...prev, quarters: next, page: 1 }) as Required<CoursesSearch>,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Quarters</span>
      <div className="flex flex-col gap-0.5">
        {ALL_QUARTERS.map((q) => (
          <QuarterCheckbox
            key={q}
            quarter={q}
            checked={quarters.includes(q)}
            onToggle={() => toggle(q)}
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
    </div>
  )
}
