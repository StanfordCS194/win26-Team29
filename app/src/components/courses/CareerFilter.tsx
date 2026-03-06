import { useQuery } from '@tanstack/react-query'
import { Route } from '@/routes/courses'
import { availableCareersQueryOptions } from './courses-query-options'
import { SetFilter } from './SetFilter'
import { PickFilter } from './PickFilter'
import type { SearchParams } from '@/data/search/search.params'

export function CareerFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true
  const { data: careerCodes = [] } = useQuery(availableCareersQueryOptions(search.year))

  const items = careerCodes.map((c) => ({ value: c, label: c }))

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  if (!advancedMode) {
    return (
      <PickFilter
        label="Career"
        mode="multi"
        options={items}
        value={search.careers}
        onChange={(v) => navigate_({ careers: v })}
        onClear={search.careers.length > 0 ? () => navigate_({ careers: [] }) : undefined}
      />
    )
  }

  return (
    <SetFilter
      label="Career"
      items={items}
      include={search.careers}
      exclude={search.careersExclude}
      onIncludeChange={(v) => navigate_({ careers: v })}
      onExcludeChange={(v) => navigate_({ careersExclude: v })}
      onClear={() => navigate_({ careers: [], careersExclude: [] })}
    />
  )
}
