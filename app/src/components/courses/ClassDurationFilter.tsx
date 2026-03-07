import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

function formatHours(v: number): string {
  return `${v % 1 === 0 ? String(v) : v.toFixed(1)}h`
}

function parseHours(raw: string): number | undefined {
  const s = raw.replace(/h$/i, '')
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function validateHoursInput(raw: string): boolean {
  return /^[\d.h]*$/i.test(raw)
}

export function ClassDurationFilter() {
  const classDurationMin = Route.useSearch({ select: (s) => s.classDurationMin })
  const classDurationMax = Route.useSearch({ select: (s) => s.classDurationMax })
  const navigate = Route.useNavigate()

  const isActive = classDurationMin !== undefined || classDurationMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          classDurationMin: undefined,
          classDurationMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          classDurationMin: min,
          classDurationMax: max,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Class duration</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear class duration filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>

      <RangeSlider
        range={{ min: 0, max: 4 }}
        value={{ min: classDurationMin, max: classDurationMax }}
        onChange={handleChange}
        step={0.5}
        stepLabels={9}
        openMax
        formatInput={formatHours}
        parseInput={parseHours}
        validateInput={validateHoursInput}
        inputClassName="w-10"
      />
      <div className="h-1" />
    </div>
  )
}
