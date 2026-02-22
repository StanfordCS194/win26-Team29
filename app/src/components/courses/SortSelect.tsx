import { Route } from '@/routes/courses'
import { ArrowUp, ArrowDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { SORT_OPTIONS, SORT_LABELS, SORT_DEFAULT_ORDER, extractEvalFilters } from '@/data/search/search.types'
import { searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { EvalFilterParam } from '@/data/search/search.queries'
import type { CoursesSearch, SortOption, Quarter, Way } from '@/data/search/search.types'

const EVAL_SORT_OPTIONS = SORT_OPTIONS.filter(
  (o): o is Exclude<SortOption, 'relevance' | 'code' | 'units'> =>
    o !== 'relevance' && o !== 'code' && o !== 'units',
)

function SortOptionItem({
  value,
  label,
  query,
  year,
  quarters,
  ways,
  unitsMin,
  unitsMax,
  evalFilters,
}: {
  value: SortOption
  label: string
  query: string
  year: string
  quarters: Quarter[]
  ways: Way[]
  unitsMin: number | undefined
  unitsMax: number | undefined
  evalFilters: EvalFilterParam[]
}) {
  const hoverProps = usePrefetchOnHover(() =>
    searchQueryOptions(
      query,
      year,
      quarters,
      ways,
      unitsMin,
      unitsMax,
      value,
      SORT_DEFAULT_ORDER[value],
      evalFilters,
      1,
    ),
  )

  return (
    <SelectItem value={value} {...hoverProps}>
      {label}
    </SelectItem>
  )
}

export function SortSelect() {
  const search = Route.useSearch()
  const { query, year, quarters, ways, unitsMin, unitsMax, sort, order } = search
  const evalFilters = extractEvalFilters(search)
  const navigate = Route.useNavigate()

  const flippedOrder = order === 'asc' ? 'desc' : 'asc'
  const orderToggleHover = usePrefetchOnHover(() =>
    searchQueryOptions(query, year, quarters, ways, unitsMin, unitsMax, sort, flippedOrder, evalFilters, 1),
  )

  const itemProps = { query, year, quarters, ways, unitsMin, unitsMax, evalFilters }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-400">Sort by</span>
      <div className="flex items-center gap-1.5">
        <Select
          value={sort}
          onValueChange={(val) => {
            if (val == null) return
            const newSort = val as SortOption
            void navigate({
              search: (prev) =>
                ({
                  ...prev,
                  sort: newSort,
                  order: SORT_DEFAULT_ORDER[newSort],
                  page: 1,
                }) as Required<CoursesSearch>,
            })
          }}
        >
          <SelectTrigger size="default" className="bg-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false} className="min-w-52">
            <SelectGroup>
              <SortOptionItem value="relevance" label={SORT_LABELS.relevance} {...itemProps} />
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Course info</SelectLabel>
              <SortOptionItem value="code" label={SORT_LABELS.code} {...itemProps} />
              <SortOptionItem value="units" label={SORT_LABELS.units} {...itemProps} />
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Evaluations</SelectLabel>
              {EVAL_SORT_OPTIONS.map((slug) => (
                <SortOptionItem key={slug} value={slug} label={SORT_LABELS[slug]} {...itemProps} />
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="bg-white"
          onClick={() => {
            void navigate({
              search: (prev) =>
                ({
                  ...prev,
                  order: prev.order === 'asc' ? 'desc' : 'asc',
                  page: 1,
                }) as Required<CoursesSearch>,
            })
          }}
          {...orderToggleHover}
        >
          {order === 'asc' ? <ArrowUp /> : <ArrowDown />}
          {order === 'asc' ? 'ascending' : 'descending'}
        </Button>
      </div>
    </div>
  )
}
