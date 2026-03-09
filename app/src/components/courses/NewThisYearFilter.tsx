import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'
import { PickFilter } from './PickFilter'

const NEW_THIS_YEAR_MIN_YEAR = '2022-2023'

type NewThisYearValue = 'false' | 'true'

const OPTIONS: { label: string; value: NewThisYearValue }[] = [
  { label: 'Has been recently offered', value: 'false' },
  { label: 'New this year', value: 'true' },
]

export function NewThisYearFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const newThisYear = search.newThisYear
  const year = search.year

  const isDisabled = year < NEW_THIS_YEAR_MIN_YEAR
  if (isDisabled) return null

  const setNewThisYear = (value: boolean | undefined) => {
    void navigate({
      search: (prev) => ({ ...prev, newThisYear: value, page: 1 }) as Required<SearchParams>,
    })
  }

  const value: NewThisYearValue | undefined =
    newThisYear === true ? 'true' : newThisYear === false ? 'false' : undefined

  return (
    <PickFilter
      mode="single"
      label="Offering history"
      options={OPTIONS}
      value={value}
      onChange={(v) => setNewThisYear(v === undefined ? undefined : v === 'true')}
      onClear={() => setNewThisYear(undefined)}
    />
  )
}
