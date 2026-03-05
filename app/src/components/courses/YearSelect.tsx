import { Route } from '@/routes/courses'
import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { availableYearsQueryOptions, searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { SearchParams } from '@/data/search/search.params'

function YearOption({ value, search }: { value: string; search: SearchParams }) {
  const hoverProps = usePrefetchOnHover(() => searchQueryOptions({ ...search, year: value, page: 1 }))

  return (
    <SelectItem value={value} {...hoverProps}>
      {value}
    </SelectItem>
  )
}

export function YearSelect() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: years } = useQuery(availableYearsQueryOptions)

  if (!years || years.length === 0) return null

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-xs font-medium text-slate-500 uppercase">Academic Year</span>
      <Select
        value={search.year}
        onValueChange={(val) => {
          if (val != null && val !== '')
            void navigate({
              search: (prev) =>
                ({
                  ...prev,
                  year: val,
                  page: 1,
                }) as Required<SearchParams>,
            })
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <YearOption key={y} value={y} search={search} />
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
