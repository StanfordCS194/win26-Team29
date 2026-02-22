import { Route } from '@/routes/courses'
import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CoursesSearch, extractEvalFilters } from '@/data/search/search.types'
import { availableYearsQueryOptions, searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { EvalFilterParam } from '@/data/search/search.queries'
import type { Quarter, SortOption, Way } from '@/data/search/search.types'

function YearOption({
  value,
  query,
  quarters,
  ways,
  unitsMin,
  unitsMax,
  sort,
  order,
  evalFilters,
}: {
  value: string
  query: string
  quarters: Quarter[]
  ways: Way[]
  unitsMin: number | undefined
  unitsMax: number | undefined
  sort: SortOption
  order: 'asc' | 'desc'
  evalFilters: EvalFilterParam[]
}) {
  const hoverProps = usePrefetchOnHover(() =>
    searchQueryOptions(query, value, quarters, ways, unitsMin, unitsMax, sort, order, evalFilters, 1),
  )

  return (
    <SelectItem value={value} {...hoverProps}>
      {value}
    </SelectItem>
  )
}

export function YearSelect() {
  const search = Route.useSearch()
  const { query, year, quarters, ways, unitsMin, unitsMax, sort, order } = search
  const evalFilters = extractEvalFilters(search)
  const navigate = Route.useNavigate()
  const { data: years } = useQuery(availableYearsQueryOptions)

  if (!years || years.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Academic Year</span>
      <Select
        value={year}
        onValueChange={(val) => {
          if (val !== undefined && val !== '')
            void navigate({
              search: (prev) =>
                ({
                  ...prev,
                  year: val ?? undefined,
                  page: 1,
                }) as Required<CoursesSearch>,
            })
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <YearOption
              key={y}
              value={y}
              query={query}
              quarters={quarters}
              ways={ways}
              unitsMin={unitsMin}
              unitsMax={unitsMax}
              sort={sort}
              order={order}
              evalFilters={evalFilters}
            />
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
