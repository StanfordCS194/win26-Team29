import { useQuery } from '@tanstack/react-query'
import { Route } from '@/routes/courses'
import { availableGersQueryOptions } from './courses-query-options'
import { SetFilter } from './SetFilter'
import type { SearchParams } from '@/data/search/search.params'

export function GERFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: gerCodes = [] } = useQuery(availableGersQueryOptions)

  const items = gerCodes.map((g) => ({ value: g, label: g }))

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <SetFilter
      label="GERs"
      items={items}
      include={search.gers}
      exclude={search.gersExclude}
      includeMode={search.gersIncludeMode}
      onIncludeChange={(v) => navigate_({ gers: v })}
      onExcludeChange={(v) => navigate_({ gersExclude: v })}
      onIncludeModeChange={(gersIncludeMode) => navigate_({ gersIncludeMode })}
      onClear={() => navigate_({ gers: [], gersExclude: [] })}
    />
  )
}
