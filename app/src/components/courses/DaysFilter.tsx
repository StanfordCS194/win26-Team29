import { Route } from '@/routes/courses'
import { ALL_WEEKDAYS } from '@/data/search/search.params'
import { SetFilter } from './SetFilter'
import type { SearchParams, Weekday, IncludeMode } from '@/data/search/search.params'

const DAY_ITEMS = ALL_WEEKDAYS.map((d) => ({ value: d, label: d }))

export function DaysFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <SetFilter
      label="Days"
      items={DAY_ITEMS}
      include={search.days ?? []}
      exclude={search.daysExclude ?? []}
      includeMode={advancedMode ? search.daysIncludeMode : undefined}
      onIncludeChange={(days) => navigate_({ days: days.length ? (days as Weekday[]) : undefined })}
      onExcludeChange={(daysExclude) =>
        navigate_({ daysExclude: daysExclude.length ? (daysExclude as Weekday[]) : undefined })
      }
      onIncludeModeChange={(daysIncludeMode: IncludeMode) => navigate_({ daysIncludeMode })}
      onClear={() => navigate_({ days: undefined, daysExclude: undefined })}
    />
  )
}
