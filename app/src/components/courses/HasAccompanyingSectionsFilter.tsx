import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'
import { PickFilter } from './PickFilter'

type HasAccompanyingSectionsValue = 'true' | 'false'

const OPTIONS: { label: string; value: HasAccompanyingSectionsValue }[] = [
  { label: 'Has accompanying sections', value: 'true' },
  { label: 'No accompanying sections', value: 'false' },
]

export function HasAccompanyingSectionsFilter() {
  const hasAccompanyingSections = Route.useSearch({ select: (s) => s.hasAccompanyingSections })
  const navigate = Route.useNavigate()

  const setHasAccompanyingSections = (value: boolean | undefined) => {
    void navigate({
      search: (prev) => ({ ...prev, hasAccompanyingSections: value, page: 1 }) as Required<SearchParams>,
    })
  }

  const value: HasAccompanyingSectionsValue | undefined =
    hasAccompanyingSections === true ? 'true' : hasAccompanyingSections === false ? 'false' : undefined

  return (
    <PickFilter
      mode="single"
      label="Accompanying sections"
      options={OPTIONS}
      value={value}
      onChange={(v) => setHasAccompanyingSections(v === undefined ? undefined : v === 'true')}
      onClear={() => setHasAccompanyingSections(undefined)}
    />
  )
}
