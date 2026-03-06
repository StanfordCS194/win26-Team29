import { Route } from '@/routes/courses'
import { ALL_QUARTERS } from '@/data/search/search.params'
import { SetFilter } from './SetFilter'
import { PickFilter } from './PickFilter'
import type { SearchParams, Quarter } from '@/data/search/search.params'

const QUARTER_ITEMS = ALL_QUARTERS.map((q) => ({ value: q, label: q }))

export function QuarterFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  if (!advancedMode) {
    return (
      <PickFilter
        label="Quarters"
        mode="multi"
        options={QUARTER_ITEMS}
        value={search.quarters}
        onChange={(v) => navigate_({ quarters: v as Quarter[] })}
        onClear={search.quarters.length > 0 ? () => navigate_({ quarters: [] }) : undefined}
      />
    )
  }

  return (
    <SetFilter
      label="Quarters"
      items={QUARTER_ITEMS}
      include={search.quarters}
      exclude={search.quartersExclude}
      includeMode={search.quartersIncludeMode}
      onIncludeChange={(v) => navigate_({ quarters: v as Quarter[] })}
      onExcludeChange={(v) => navigate_({ quartersExclude: v as Quarter[] })}
      onIncludeModeChange={(quartersIncludeMode) => navigate_({ quartersIncludeMode })}
      onClear={() => navigate_({ quarters: [], quartersExclude: [] })}
    />
  )
}
