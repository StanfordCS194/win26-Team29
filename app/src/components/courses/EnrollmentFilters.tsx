import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { PickFilter } from './PickFilter'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

export function EnrolledFilter() {
  const rawMin = Route.useSearch({ select: (s) => s.numEnrolledMin })
  const rawMax = Route.useSearch({ select: (s) => s.numEnrolledMax })
  const navigate = Route.useNavigate()

  const isActive = rawMin !== undefined || rawMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          numEnrolledMin: undefined,
          numEnrolledMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({ ...prev, numEnrolledMin: min, numEnrolledMax: max, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Enrolled</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear enrolled filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>
      <RangeSlider
        range={{ min: 0, max: 400 }}
        value={{ min: rawMin ?? undefined, max: rawMax ?? undefined }}
        onChange={handleChange}
        step={1}
        openMax
        inputClassName="w-10"
      />
      <div className="h-1" />
    </div>
  )
}

export function MaxClassSizeFilter() {
  const rawMin = Route.useSearch({ select: (s) => s.maxEnrolledMin })
  const rawMax = Route.useSearch({ select: (s) => s.maxEnrolledMax })
  const navigate = Route.useNavigate()

  const isActive = rawMin !== undefined || rawMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          maxEnrolledMin: undefined,
          maxEnrolledMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({ ...prev, maxEnrolledMin: min, maxEnrolledMax: max, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Max class size</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear max class size filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>
      <RangeSlider
        range={{ min: 0, max: 400 }}
        value={{ min: rawMin ?? undefined, max: rawMax ?? undefined }}
        onChange={handleChange}
        step={1}
        openMax
        inputClassName="w-10"
      />
      <div className="h-1" />
    </div>
  )
}

type EnrollmentStatusValue = 'space_available' | 'waitlist_only' | 'full'

const STATUS_OPTIONS: { label: string; value: EnrollmentStatusValue }[] = [
  { label: 'Space available', value: 'space_available' },
  { label: 'Waitlist only', value: 'waitlist_only' },
  { label: 'Full', value: 'full' },
]

export function EnrollmentStatusFilter() {
  const selected = Route.useSearch({ select: (s) => s.enrollmentStatus ?? [] })
  const navigate = Route.useNavigate()

  const handleChange = (next: EnrollmentStatusValue[]) => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          enrollmentStatus: next.length ? next : undefined,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  const clear = () => {
    void navigate({
      search: (prev) =>
        ({ ...prev, enrollmentStatus: undefined, page: 1 }) as unknown as Required<SearchParams>,
    })
  }

  return (
    <PickFilter
      mode="multi"
      label="Enrollment status"
      options={STATUS_OPTIONS}
      value={selected}
      onChange={handleChange}
      onClear={clear}
    />
  )
}
