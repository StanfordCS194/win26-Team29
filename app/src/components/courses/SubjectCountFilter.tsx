import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

export function SubjectCountFilter() {
  const numSubjectsMin = Route.useSearch({ select: (s) => s.numSubjectsMin })
  const numSubjectsMax = Route.useSearch({ select: (s) => s.numSubjectsMax })
  const navigate = Route.useNavigate()

  const isActive = numSubjectsMin !== undefined || numSubjectsMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          numSubjectsMin: undefined,
          numSubjectsMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({ ...prev, numSubjectsMin: min, numSubjectsMax: max, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Subject count</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear subject count filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>

      <RangeSlider
        range={{ min: 1, max: 5 }}
        value={{ min: numSubjectsMin ?? undefined, max: numSubjectsMax ?? undefined }}
        onChange={handleChange}
        step={1}
        openMax
      />
      <div className="h-1" />
    </div>
  )
}
