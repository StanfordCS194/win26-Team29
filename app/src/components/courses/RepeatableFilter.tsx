import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'
import { PickFilter } from './PickFilter'

type RepeatableValue = 'true' | 'false'

const OPTIONS: { label: string; value: RepeatableValue }[] = [
  { label: 'Repeatable', value: 'true' },
  { label: 'Not repeatable', value: 'false' },
]

export function RepeatableFilter() {
  const repeatable = Route.useSearch({ select: (s) => s.repeatable })
  const navigate = Route.useNavigate()

  const setRepeatable = (value: boolean | undefined) => {
    void navigate({
      search: (prev) => ({ ...prev, repeatable: value, page: 1 }) as Required<SearchParams>,
    })
  }

  const value: RepeatableValue | undefined =
    repeatable === true ? 'true' : repeatable === false ? 'false' : undefined

  return (
    <PickFilter
      mode="single"
      label="Repeatability"
      options={OPTIONS}
      value={value}
      onChange={(v) => setRepeatable(v === undefined ? undefined : v === 'true')}
      onClear={() => setRepeatable(undefined)}
    />
  )
}
