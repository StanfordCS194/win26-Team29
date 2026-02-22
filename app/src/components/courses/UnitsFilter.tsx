import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Route } from '@/routes/courses'
import { CoursesSearch } from '@/data/search/search.types'

const RANGE_MIN = 0
const SLIDER_MAX = 8 // positions 0–7 are literal, 8 means "8+"

/** Map a real unit value to a slider position (0–8). */
function valueToPos(value: number | undefined): number {
  if (value === undefined) return 8
  if (value > 7) return 8
  return Math.max(RANGE_MIN, Math.min(7, value))
}

/** Map a slider position to a value for the min handle. Position 8 = concrete 8. */
function posToMinValue(pos: number): number {
  return Math.min(pos, 8)
}

/** Map a slider position to a value for the max handle. Position 8 = unbounded. */
function posToMaxValue(pos: number): number | undefined {
  return pos <= 7 ? pos : undefined
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const STEP_LABELS = [0, 1, 2, 3, 4, 5, 6, 7, '8+'] as const

export function UnitsFilter() {
  const unitsMin = Route.useSearch({ select: (s) => s.unitsMin })
  const unitsMax = Route.useSearch({ select: (s) => s.unitsMax })
  const navigate = Route.useNavigate()

  const resolvedMin = clamp(unitsMin ?? RANGE_MIN, RANGE_MIN, 8)
  const resolvedMax = unitsMax === undefined ? undefined : Math.max(resolvedMin, unitsMax)

  const [draftMin, setDraftMin] = useState(resolvedMin)
  const [draftMax, setDraftMax] = useState(resolvedMax)
  const [minInput, setMinInput] = useState(String(draftMin))
  const [maxInput, setMaxInput] = useState(draftMax === undefined ? '' : String(draftMax))

  const sliderMin = valueToPos(draftMin)
  const sliderMax = valueToPos(draftMax)

  // Sync drafts when URL params change (e.g. browser back/forward)
  useEffect(() => {
    setDraftMin(resolvedMin)
    setDraftMax(resolvedMax)
  }, [resolvedMin, resolvedMax])

  // Sync text inputs from drafts
  useEffect(() => {
    setMinInput(String(draftMin))
    setMaxInput(draftMax === undefined ? '' : String(draftMax))
  }, [draftMin, draftMax])

  const applyRange = (nextMin: number, nextMax: number | undefined) => {
    const min = clamp(nextMin, RANGE_MIN, 8)
    const max = nextMax === undefined ? undefined : Math.max(min, nextMax)
    setDraftMin(min)
    setDraftMax(max)
    void navigate({
      search: (prev) => ({ ...prev, unitsMin: min, unitsMax: max, page: 1 }) as Required<CoursesSearch>,
    })
  }

  const onSliderChange = (next: number | readonly number[]) => {
    if (!Array.isArray(next) || next.length !== 2) return
    const posMin = clamp(Math.round(next[0] ?? 0), RANGE_MIN, SLIDER_MAX)
    const posMax = clamp(Math.round(next[1] ?? SLIDER_MAX), posMin, SLIDER_MAX)
    setDraftMin(posToMinValue(posMin))
    setDraftMax(posToMaxValue(posMax))
  }

  const onSliderCommit = (next: number | readonly number[]) => {
    if (!Array.isArray(next) || next.length !== 2) return
    const posMin = clamp(Math.round(next[0] ?? 0), RANGE_MIN, SLIDER_MAX)
    const posMax = clamp(Math.round(next[1] ?? SLIDER_MAX), posMin, SLIDER_MAX)
    applyRange(posToMinValue(posMin), posToMaxValue(posMax))
  }

  const onMinInputChange = (value: string) => {
    if (value === '') {
      setMinInput('')
      return
    }
    if (!/^\d+$/.test(value)) return
    setMinInput(value)
    const parsed = Number(value)
    if (Number.isInteger(parsed)) {
      const clamped = clamp(parsed, RANGE_MIN, draftMax ?? parsed)
      setDraftMin(clamped)
    }
  }

  const onMaxInputChange = (value: string) => {
    if (value === '') {
      setMaxInput('')
      setDraftMax(undefined)
      return
    }
    if (!/^\d+$/.test(value)) return
    setMaxInput(value)
    const parsed = Number(value)
    if (Number.isInteger(parsed)) {
      setDraftMax(Math.max(draftMin, parsed))
    }
  }

  const commitInputs = () => {
    const parsedMin = Number(minInput)
    const min = minInput !== '' && Number.isInteger(parsedMin) ? parsedMin : draftMin
    const parsedMax = Number(maxInput)
    const max = maxInput === '' ? undefined : Number.isInteger(parsedMax) ? parsedMax : draftMax
    applyRange(min, max)
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Units</span>

      <div className="flex items-center">
        <Input
          type="number"
          inputMode="numeric"
          min={RANGE_MIN}
          max={draftMax ?? 8}
          step={1}
          value={minInput}
          onChange={(e) => onMinInputChange(e.target.value)}
          onBlur={commitInputs}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInputs()
          }}
          aria-label="Minimum units"
          className="mx-1 h-7 w-7 shrink-0 [appearance:textfield] px-0.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <div className="relative mx-0.5 min-w-0 flex-1">
          <Slider
            min={RANGE_MIN}
            max={SLIDER_MAX}
            step={1}
            value={[sliderMin, sliderMax]}
            minStepsBetweenValues={0}
            onValueChange={onSliderChange}
            onValueCommitted={onSliderCommit}
          />
          <div
            className="absolute top-full mt-0.5 flex w-[103%] -translate-x-[1.5%] text-[9px] text-muted-foreground"
            aria-hidden="true"
          >
            {STEP_LABELS.map((label, index) => (
              <div
                key={index}
                className="text-center select-none"
                style={{ width: `${100 / STEP_LABELS.length}%` }}
                onClick={() => {
                  const distToMin = Math.abs(index - sliderMin)
                  const distToMax = Math.abs(index - sliderMax)
                  if (distToMin < distToMax || (distToMin === distToMax && index <= sliderMin)) {
                    applyRange(posToMinValue(index), posToMaxValue(Math.max(index, sliderMax)))
                  } else {
                    applyRange(posToMinValue(Math.min(sliderMin, index)), posToMaxValue(index))
                  }
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <Input
          type="text"
          inputMode="numeric"
          value={draftMax === undefined ? '8+' : maxInput}
          onChange={(e) => onMaxInputChange(e.target.value)}
          onBlur={commitInputs}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInputs()
          }}
          aria-label="Maximum units"
          className="mx-1 h-7 w-7 shrink-0 [appearance:textfield] px-0.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>

      <div className="h-2" />
    </div>
  )
}
