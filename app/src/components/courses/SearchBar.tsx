import { Route } from '@/routes/courses'
import { useQueryClient } from '@tanstack/react-query'
import { useDebouncer } from '@tanstack/react-pacer'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CoursesSearch, extractEvalFilters } from '@/data/search/search.types'
import { searchQueryOptions } from './courses-query-options'

export function SearchBar() {
  const search = Route.useSearch()
  const { query, year, quarters, ways, unitsMin, unitsMax, sort, order } = search
  const evalFilters = extractEvalFilters(search)
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(query)

  useEffect(() => {
    setValue(query)
  }, [query])

  const prefetchDebouncer = useDebouncer(
    (trimmed: string) => {
      void queryClient.prefetchQuery(
        searchQueryOptions(trimmed, year, quarters, ways, unitsMin, unitsMax, sort, order, evalFilters, 1),
      )
    },
    { wait: 325, enabled: value.trim().length > 0 },
  )

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        prefetchDebouncer.cancel()
        void navigate({
          search: (prev) =>
            ({
              ...prev,
              query: value.trim(),
              page: 1,
            }) as Required<CoursesSearch>,
        })
      }}
    >
      <label htmlFor="courses-search" className="sr-only">
        Search courses
      </label>
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
      />
      <Input
        id="courses-search"
        name="query"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (e.target.value.trim().length > 0) {
            prefetchDebouncer.maybeExecute(e.target.value.trim())
          } else {
            prefetchDebouncer.cancel()
          }
        }}
        placeholder="Search by course, instructor, or keyword"
        className="h-10 rounded-full border-slate-300 bg-white pr-24 pl-11 text-base shadow-sm placeholder:text-slate-400"
      />
      <Button type="submit" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full">
        Search
      </Button>
    </form>
  )
}
