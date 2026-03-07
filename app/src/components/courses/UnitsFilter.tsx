import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { RangeModeToggle } from '@/components/courses/RangeModeToggle'
import { Route } from '@/routes/courses'
import type { SearchParams, RangeMode } from '@/data/search/search.params'

export function UnitsFilter() {
  const unitsMin = Route.useSearch({ select: (s) => s.unitsMin })
  const unitsMax = Route.useSearch({ select: (s) => s.unitsMax })
  const unitsMode = Route.useSearch({ select: (s) => s.unitsMode })
  const navigate = Route.useNavigate()

  const isActive = unitsMin !== undefined || unitsMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({ ...prev, unitsMin: undefined, unitsMax: undefined, page: 1 }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) => ({ ...prev, unitsMin: min, unitsMax: max, page: 1 }) as Required<SearchParams>,
    })
  }

  const applyMode = (mode: RangeMode) => {
    void navigate({
      search: (prev) => ({ ...prev, unitsMode: mode, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-slate-500 uppercase">Units</span>
          {isActive && (
            <button
              type="button"
              onClick={clearFilter}
              aria-label="Clear units filter"
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Eraser className="h-3 w-3" />
            </button>
          )}
        </div>
        <RangeModeToggle value={unitsMode} onChange={applyMode} />
      </div>

      <RangeSlider
        range={{ min: 0, max: 8 }}
        value={{ min: unitsMin ?? undefined, max: unitsMax ?? undefined }}
        onChange={handleChange}
        step={1}
        stepLabels={9}
        openMax
      />
      <div className="h-1" />
    </div>
  )
}
