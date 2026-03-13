import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Route } from '@/routes/courses'
import { availableComponentTypesQueryOptions } from './courses-query-options'
import { GroupedSetFilter } from './GroupedSetFilter'
import { COMPONENT_GROUPS, COMPONENT_LABELS } from './component-groups'
import type { SearchParams } from '@/data/search/search.params'

export function ComponentFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: availableCodes = [] } = useQuery(availableComponentTypesQueryOptions(search.year))

  const groups = useMemo(() => {
    const availableSet = new Set(availableCodes)
    const mapped = COMPONENT_GROUPS.map((g) => ({
      ...g,
      codes: g.codes.filter((c) => availableSet.has(c)),
    })).filter((g) => g.codes.length > 0)

    const allMapped = new Set(COMPONENT_GROUPS.flatMap((g) => g.codes))
    const unmapped = availableCodes.filter((c) => !allMapped.has(c))
    if (unmapped.length > 0) {
      const existingIdx = mapped.findIndex((g) => g.name === 'Other')
      if (existingIdx >= 0) {
        mapped[existingIdx] = { ...mapped[existingIdx]!, codes: [...mapped[existingIdx]!.codes, ...unmapped] }
      } else {
        mapped.push({ name: 'Other', codes: unmapped })
      }
    }

    return mapped
  }, [availableCodes])

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <GroupedSetFilter
      label="Component"
      groups={groups}
      getLabel={(code) => COMPONENT_LABELS[code] ?? code}
      include={search.componentTypes}
      exclude={search.componentTypesExclude}
      onIncludeChange={(v) => navigate_({ componentTypes: v })}
      onExcludeChange={(v) => navigate_({ componentTypesExclude: v })}
      onClear={() => navigate_({ componentTypes: [], componentTypesExclude: [] })}
      advancedMode={true}
    />
  )
}
