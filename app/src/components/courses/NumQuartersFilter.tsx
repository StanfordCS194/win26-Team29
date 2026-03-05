import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

export function NumQuartersFilter() {
  const numQuartersMin = Route.useSearch({ select: (s) => s.numQuartersMin })
  const numQuartersMax = Route.useSearch({ select: (s) => s.numQuartersMax })
  const navigate = Route.useNavigate()

  const isActive = numQuartersMin !== undefined || numQuartersMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          numQuartersMin: undefined,
          numQuartersMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({ ...prev, numQuartersMin: min, numQuartersMax: max, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Quarters offered</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear quarter count filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>

      <RangeSlider
        range={{ min: 0, max: 4 }}
        value={{ min: numQuartersMin ?? undefined, max: numQuartersMax ?? undefined }}
        onChange={handleChange}
        step={1}
      />
      <div className="h-1" />
    </div>
  )
}
