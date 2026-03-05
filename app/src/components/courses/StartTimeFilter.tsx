import { Eraser } from 'lucide-react'

import { RangeSlider } from '@/components/courses/RangeSlider'
import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'

// 6 AM to 9 PM in minutes
const RANGE = { min: 360, max: 1260 }
const STEP = 30

/** "HH:MM:SS" → minutes from midnight */
function toMinutes(s: string): number {
  const parts = s.split(':').map(Number)
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}

/** minutes from midnight → "HH:MM:00" ISO time string */
function toIsoTime(m: number): string {
  const h = Math.floor(m / 60) % 24
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
}

/** minutes from midnight → "8:30 AM" display string */
function formatTime(minutes: number): string {
  const totalMinutes = minutes % 1440
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`
}

/**
 * Parses flexible time input → minutes from midnight.
 * Handles: "8", "8:30", "830", "14:00", "8:30 AM", "8:30pm", "8am", "8 AM"
 */
function parseTimeInput(raw: string): number | undefined {
  const s = raw.trim().toLowerCase()
  if (s === '') return undefined

  // Detect and strip AM/PM suffix
  const hasPm = s.endsWith('pm') || s.endsWith('p')
  const hasAm = s.endsWith('am') || s.endsWith('a')
  const stripped = s.replace(/\s*(am?|pm?)\s*$/, '').trim()

  let hours: number
  let mins = 0

  if (stripped.includes(':')) {
    const [hPart, mPart] = stripped.split(':')
    hours = parseInt(hPart ?? '', 10)
    mins = parseInt(mPart ?? '0', 10)
  } else if (stripped.length > 2) {
    // e.g. "830" → 8:30, "1430" → 14:30
    hours = parseInt(stripped.slice(0, -2), 10)
    mins = parseInt(stripped.slice(-2), 10)
  } else {
    hours = parseInt(stripped, 10)
  }

  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return undefined
  if (mins < 0 || mins > 59) return undefined

  // Normalize 12-hour clock
  if (hasPm && hours !== 12) hours += 12
  if (hasAm && hours === 12) hours = 0

  if (hours < 0 || hours > 23) return undefined

  return hours * 60 + mins
}

/** Allow partial time input characters: digits, colon, space, a, p, m (for AM/PM) */
function isValidTimeInput(raw: string): boolean {
  return /^[\d: apmAPM]*$/.test(raw)
}

// Labels every 3 hours: 6 AM, 9 AM, 12 PM, 3 PM, 6 PM, 9 PM
const STEP_LABELS = [360, 540, 720, 900, 1080, 1260].map(formatTime)

export function StartTimeFilter() {
  const startTimeMin = Route.useSearch({ select: (s) => s.startTimeMin })
  const startTimeMax = Route.useSearch({ select: (s) => s.startTimeMax })
  const navigate = Route.useNavigate()

  const isActive = startTimeMin !== undefined || startTimeMax !== undefined

  const sliderMin = startTimeMin !== undefined ? toMinutes(startTimeMin) : undefined
  const sliderMax = startTimeMax !== undefined ? toMinutes(startTimeMax) : undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          startTimeMin: undefined,
          startTimeMax: undefined,
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          startTimeMin: min !== undefined ? toIsoTime(min) : undefined,
          startTimeMax: max !== undefined ? toIsoTime(max) : undefined,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">Start time</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label="Clear start time filter"
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>

      <RangeSlider
        range={RANGE}
        value={{ min: sliderMin, max: sliderMax }}
        onChange={handleChange}
        step={STEP}
        precision={0}
        stepLabels={STEP_LABELS}
        formatInput={formatTime}
        parseInput={parseTimeInput}
        validateInput={isValidTimeInput}
        inputClassName="w-14"
      />
      <div className="h-1" />
    </div>
  )
}
