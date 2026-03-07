import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

export function NumMeetingDaysFilter() {
  const numMeetingDaysMin = Route.useSearch({ select: (s) => s.numMeetingDaysMin })
  const numMeetingDaysMax = Route.useSearch({ select: (s) => s.numMeetingDaysMax })
  const navigate = Route.useNavigate()

  const isActive = numMeetingDaysMin !== undefined || numMeetingDaysMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          numMeetingDaysMin: undefined,
          numMeetingDaysMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          numMeetingDaysMin: min,
          numMeetingDaysMax: max,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Meeting days</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear meeting days filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>

      <RangeSlider
        range={{ min: 0, max: 5 }}
        value={{ min: numMeetingDaysMin ?? undefined, max: numMeetingDaysMax ?? undefined }}
        onChange={handleChange}
        step={1}
        stepLabels={6}
      />
      <div className="h-1" />
    </div>
  )
}
