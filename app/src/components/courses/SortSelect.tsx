import { Route } from '@/routes/courses'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { SORT_OPTIONS, SORT_LABELS, SORT_DEFAULT_ORDER } from '@/data/search/search.params'
import { searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { SearchParams, SortOption } from '@/data/search/search.params'

const SORT_USED_KEY = 'courses.sortUsed'

const EVAL_SORT_OPTIONS = SORT_OPTIONS.filter(
  (o): o is Exclude<SortOption, 'relevance' | 'code' | 'units' | 'num_enrolled'> =>
    o !== 'relevance' && o !== 'code' && o !== 'units' && o !== 'num_enrolled',
)

function SortOptionItem({
  value,
  label,
  search,
}: {
  value: SortOption
  label: string
  search: SearchParams
}) {
  const hoverProps = usePrefetchOnHover(() =>
    searchQueryOptions({ ...search, sort: value, order: SORT_DEFAULT_ORDER[value], page: 1 }),
  )

  return (
    <SelectItem value={value} {...hoverProps}>
      {label}
    </SelectItem>
  )
}

export function SortSelect() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const [hasUsedSort, setHasUsedSort] = useState(true)

  useEffect(() => {
    if (window.localStorage.getItem(SORT_USED_KEY) == null) {
      setHasUsedSort(false)
    }
  }, [])

  const markSortUsed = () => {
    setHasUsedSort(true)
    window.localStorage.setItem(SORT_USED_KEY, '1')
  }

  const { data } = useQuery({ ...searchQueryOptions(search), enabled: false })
  const hasResults = (data?.totalCount ?? 0) > 0

  const shouldHighlight = !hasUsedSort && hasResults

  const isEvalSort = EVAL_SORT_OPTIONS.includes(search.sort as (typeof EVAL_SORT_OPTIONS)[number])
  const baseLabel = SORT_LABELS[search.sort]
  const displayLabel = isEvalSort ? `Eval: ${baseLabel}` : baseLabel

  const flippedOrder = search.order === 'asc' ? 'desc' : 'asc'
  const orderToggleHover = usePrefetchOnHover(() =>
    searchQueryOptions({ ...search, order: flippedOrder, page: 1 }),
  )

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">Sort by</span>
      <div className="flex items-center gap-1.5">
        <Select
          value={search.sort}
          onOpenChange={(open) => {
            if (open) markSortUsed()
          }}
          onValueChange={(val) => {
            if (val == null) return
            markSortUsed()
            const newSort = val as SortOption
            void navigate({
              search: (prev) =>
                ({
                  ...prev,
                  sort: newSort,
                  order: SORT_DEFAULT_ORDER[newSort],
                  page: 1,
                }) as Required<SearchParams>,
            })
          }}
        >
          <SelectTrigger
            size="default"
            className={`bg-white text-sm transition-shadow ${shouldHighlight ? 'animate-pulse border-slate-500 shadow-md [animation-duration:2.5s]' : ''}`}
          >
            <SelectValue className="sr-only" />
            <span style={shouldHighlight ? { WebkitTextStroke: '0.2px currentColor' } : undefined}>
              {displayLabel}
            </span>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false} className="min-w-52">
            <SelectGroup>
              <SortOptionItem value="relevance" label={SORT_LABELS.relevance} search={search} />
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Course info</SelectLabel>
              <SortOptionItem value="code" label={SORT_LABELS.code} search={search} />
              <SortOptionItem value="units" label={SORT_LABELS.units} search={search} />
              <SortOptionItem value="num_enrolled" label={SORT_LABELS.num_enrolled} search={search} />
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Evaluations</SelectLabel>
              {EVAL_SORT_OPTIONS.map((slug) => (
                <SortOptionItem key={slug} value={slug} label={SORT_LABELS[slug]} search={search} />
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
                }) as Required<SearchParams>,
            })
          }}
          {...orderToggleHover}
        >
          {search.order === 'asc' ? <ArrowUp /> : <ArrowDown />}
          {search.order === 'asc' ? 'ascending' : 'descending'}
        </Button>
      </div>
    </div>
  )
}
