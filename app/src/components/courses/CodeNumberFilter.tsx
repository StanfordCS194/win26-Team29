import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

export function CodeNumberFilter() {
  const codeNumberMin = Route.useSearch({ select: (s) => s.codeNumberMin })
  const codeNumberMax = Route.useSearch({ select: (s) => s.codeNumberMax })
  const navigate = Route.useNavigate()

  const isActive = codeNumberMin !== undefined || codeNumberMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          codeNumberMin: undefined,
          codeNumberMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          codeNumberMin: min,
          codeNumberMax: max,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Course Number</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear course number filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>

      <RangeSlider
        range={{ min: 1, max: 600 }}
        value={{ min: codeNumberMin ?? undefined, max: codeNumberMax ?? undefined }}
        onChange={handleChange}
        step={1}
        stepLabels={[1, 100, 200, 300, 400, 500, '600+']}
        openMax
        inputClassName="w-10"
      />
      <div className="h-1" />
    </div>
  )
}
