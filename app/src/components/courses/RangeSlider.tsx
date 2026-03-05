import { useEffect, useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RangeSliderProps {
  /** Absolute boundaries for the slider. */
  range: { min: number; max: number }
  /** Current committed value. `undefined` on either side means unbounded. */
  value: { min?: number; max?: number }
  /** Called when the user commits a change (thumb release, blur, or Enter). */
  onChange: (value: { min?: number; max?: number }) => void

  /**
   * Slider step granularity.
   */
  step: number
  /**
   * Decimal places for display formatting.
   * @default derived from step
   */
  precision?: number

  /**
   * Labels rendered below the track at evenly-spaced positions.
   * - `number` → auto-generate that many numeric labels (default 5).
   * - `(string | number)[]` → explicit labels at evenly-spaced positions.
   */
  stepLabels?: number | (string | number)[]

  /** When true, the min boundary is treated as open-ended (displays "≤{value}"). */
  openMin?: boolean
  /** When true, the max boundary is treated as open-ended (displays "{value}+"). */
  openMax?: boolean

  /**
   * Additional class name(s) applied to the min/max text inputs.
   * @default "w-8"
   */
  inputClassName?: string

  /** Format a numeric value for display in the text input. Defaults to numeric formatting. */
  formatInput?: (value: number) => string
  /** Parse user-typed text back into a number. Return undefined for invalid input. */
  parseInput?: (raw: string) => number | undefined
  /** Return true if the typed string is an acceptable partial input (used to block invalid chars). */
  validateInput?: (raw: string) => boolean
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision)
  return Math.round(value * factor) / factor
}

function derivePrecision(step: number) {
  const parts = String(step).split('.')
  return parts[1]?.length ?? 0
}

function formatValue(value: number, precision: number) {
  return precision > 0 ? value.toFixed(precision) : String(Math.round(value))
}

function parseNumeric(value: string): number | undefined {
  if (value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isNumericInput(value: string) {
  return /^\d*\.?\d*$/.test(value)
}

function generateStepLabels(
  count: number,
  range: { min: number; max: number },
  precision: number,
  openMin?: boolean,
  openMax?: boolean,
  formatFn?: (value: number) => string,
): (string | number)[] {
  const fmt = (v: number) => formatFn?.(v) ?? formatValue(v, precision)
  return Array.from({ length: count }, (_, i) => {
    const raw = range.min + (i / (count - 1)) * (range.max - range.min)

    const value = roundToPrecision(raw, precision)

    if (openMin === true && i === 0) return `≤${fmt(value)}`
    if (openMax === true && i === count - 1) return `${fmt(value)}+`

    return fmt(value)
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RangeSlider({
  range,
  value,
  onChange,
  step,
  precision: precisionProp,
  stepLabels: stepLabelsProp,
  openMin = false,
  openMax = false,
  inputClassName = 'w-8',
  formatInput: formatInputProp,
  parseInput: parseInputProp,
  validateInput: validateInputProp,
}: RangeSliderProps) {
  const fmtInput = (v: number, prec: number) => formatInputProp?.(v) ?? formatValue(v, prec)
  const parseInputValue = (raw: string) => parseInputProp?.(raw) ?? parseNumeric(raw)
  const isValidInput = (raw: string) => validateInputProp?.(raw) ?? isNumericInput(raw)
  // --- Derived constants ------------------------------------------------

  const precision = useMemo(() => precisionProp ?? derivePrecision(step), [precisionProp, step])

  const resolvedLabels = useMemo(() => {
    if (Array.isArray(stepLabelsProp)) return stepLabelsProp
    return generateStepLabels(stepLabelsProp ?? 5, range, precision, openMin, openMax, formatInputProp)
  }, [stepLabelsProp, range, precision, openMin, openMax, formatInputProp])

  // --- Resolve & clamp incoming value -----------------------------------

  const resolvedMin = value.min == null ? undefined : clamp(value.min, range.min, range.max)
  const resolvedMax = value.max == null ? undefined : clamp(value.max, range.min, range.max)

  // --- Draft state (tracks uncommitted slider / input changes) ----------

  const [draftMin, setDraftMin] = useState<number | undefined>(resolvedMin)
  const [draftMax, setDraftMax] = useState<number | undefined>(resolvedMax)
  const [minInput, setMinInput] = useState(fmtInput(resolvedMin ?? range.min, precision))
  const [maxInput, setMaxInput] = useState(fmtInput(resolvedMax ?? range.max, precision))
  const [editingField, setEditingField] = useState<'min' | 'max' | null>(null)

  // Sync drafts when the committed value changes externally
  useEffect(() => {
    setDraftMin(resolvedMin)
    setDraftMax(resolvedMax)
  }, [resolvedMin, resolvedMax])

  // Sync text inputs from draft, except while the user is typing that field
  useEffect(() => {
    if (editingField !== 'min') setMinInput(fmtInput(draftMin ?? range.min, precision))
    if (editingField !== 'max') setMaxInput(fmtInput(draftMax ?? range.max, precision))
  }, [draftMin, draftMax, precision, range.min, range.max, editingField])

  // --- Cross-bound pushing logic ----------------------------------------
  // When one thumb is dragged past the other, the non-active thumb is
  // visually "pushed" to the active thumb's position. The pushed input
  // becomes read-only and italic.

  const rawMin = draftMin ?? range.min
  const rawMax = draftMax ?? range.max
  const isCrossing = rawMin > rawMax
  const isMinPushed = isCrossing && editingField === 'max'
  const isMaxPushed = isCrossing && editingField === 'min'

  const activeValue = editingField === 'min' ? rawMin : rawMax
  const sliderMin = isCrossing ? activeValue : rawMin
  const sliderMax = isCrossing ? activeValue : rawMax

  const visualMin = isMinPushed ? sliderMin : rawMin
  const visualMax = isMaxPushed ? sliderMax : rawMax

  // --- Open-ended display helpers ---------------------------------------

  function formatMinDisplay(v: number) {
    if (openMin && v <= range.min) return `≤${fmtInput(v, precision)}`
    return fmtInput(v, precision)
  }

  function formatMaxDisplay(v: number) {
    if (openMax && v >= range.max) return `${fmtInput(v, precision)}+`
    return fmtInput(v, precision)
  }

  // --- Commit logic -----------------------------------------------------
  // Normalizes values: at boundary → undefined (meaning "no filter").
  // Reorders if crossed.

  const commitRange = (nextMin: number | undefined, nextMax: number | undefined) => {
    const boundedMin =
      nextMin == null ? undefined : clamp(roundToPrecision(nextMin, precision), range.min, range.max)
    const boundedMax =
      nextMax == null ? undefined : clamp(roundToPrecision(nextMax, precision), range.min, range.max)

    const orderedMin =
      boundedMin != null && boundedMax != null ? Math.min(boundedMin, boundedMax) : boundedMin
    const orderedMax =
      boundedMin != null && boundedMax != null ? Math.max(boundedMin, boundedMax) : boundedMax

    const normalizedMin = openMin && orderedMin != null && orderedMin <= range.min ? undefined : orderedMin
    const normalizedMax = openMax && orderedMax != null && orderedMax >= range.max ? undefined : orderedMax

    // When open-ended is disabled, still normalize exact boundary hits to
    // undefined so the parent doesn't get redundant boundary values.
    const finalMin =
      !openMin && normalizedMin != null && normalizedMin <= range.min ? undefined : normalizedMin
    const finalMax =
      !openMax && normalizedMax != null && normalizedMax >= range.max ? undefined : normalizedMax

    setDraftMin(finalMin)
    setDraftMax(finalMax)
    onChange({ min: finalMin, max: finalMax })
  }

  // --- Slider handlers --------------------------------------------------

  const onSliderChange = (next: number | readonly number[]) => {
    if (!Array.isArray(next) || next.length !== 2) return
    const nextMin = roundToPrecision(clamp(next[0] ?? range.min, range.min, range.max), precision)
    const nextMax = roundToPrecision(clamp(next[1] ?? range.max, nextMin, range.max), precision)
    setDraftMin(nextMin)
    setDraftMax(nextMax)
  }

  const onSliderCommit = (next: number | readonly number[]) => {
    if (!Array.isArray(next) || next.length !== 2) return
    const nextMin = clamp(next[0] ?? range.min, range.min, range.max)
    const nextMax = clamp(next[1] ?? range.max, nextMin, range.max)
    commitRange(nextMin, nextMax)
  }

  // --- Min input handlers -----------------------------------------------

  const onMinInputChange = (raw: string) => {
    // Strip open-end prefix if the user types into it
    const stripped = openMin ? raw.replace(/^[≤<]/, '') : raw
    if (stripped === '') {
      setMinInput('')
      return
    }
    if (!isValidInput(stripped)) return
    setMinInput(stripped)
    const parsed = parseInputValue(stripped)
    if (parsed != null) {
      setDraftMin(roundToPrecision(clamp(parsed, range.min, range.max), precision))
    }
  }

  // --- Max input handlers -----------------------------------------------

  const onMaxInputChange = (raw: string) => {
    const stripped = openMax && raw.endsWith('+') ? raw.slice(0, -1) : raw
    if (stripped === '') {
      setMaxInput('')
      return
    }
    if (!isValidInput(stripped)) return
    setMaxInput(stripped)
    const parsed = parseInputValue(stripped)
    if (parsed != null) {
      setDraftMax(clamp(parsed, range.min, range.max))
    }
  }

  // --- Commit from text inputs ------------------------------------------

  const commitInputs = (field: 'min' | 'max') => {
    const parsedMin = parseInputValue(minInput)
    const parsedMax = parseInputValue(maxInput)

    if (minInput === '') setMinInput(fmtInput(range.min, precision))
    if (maxInput === '') setMaxInput(fmtInput(range.max, precision))

    let nextMin = minInput !== '' && parsedMin != null ? parsedMin : undefined
    let nextMax = maxInput !== '' && parsedMax != null ? parsedMax : undefined

    // Push the other bound if crossed
    if (nextMin != null && nextMax != null && nextMin > nextMax) {
      if (field === 'min') nextMax = nextMin
      else nextMin = nextMax
    }

    commitRange(nextMin, nextMax)

    setMinInput(fmtInput(nextMin ?? range.min, precision))
    setMaxInput(fmtInput(nextMax ?? range.max, precision))
  }

  // --- Open-end cursor clamping for max input ---------------------------
  // Prevents the user from selecting or deleting the trailing "+" suffix.

  const onMaxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitInputs('max')
  }

  const onMinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitInputs('min')
  }

  // --- Computed display values for inputs --------------------------------

  const minDisplayValue = isMinPushed
    ? formatMinDisplay(visualMin)
    : editingField !== 'min' && openMin && (draftMin === undefined || draftMin <= range.min)
      ? `≤${fmtInput(draftMin ?? range.min, precision)}`
      : minInput

  const maxDisplayValue = isMaxPushed
    ? formatMaxDisplay(visualMax)
    : editingField !== 'max' && openMax && (draftMax === undefined || draftMax >= range.max)
      ? `${fmtInput(draftMax ?? range.max, precision)}+`
      : maxInput

  // --- Step label click handler -----------------------------------------

  const onStepLabelClick = (index: number) => {
    const numericValue = range.min + (index / (resolvedLabels.length - 1)) * (range.max - range.min)

    const distToMin = Math.abs(numericValue - sliderMin)
    const distToMax = Math.abs(numericValue - sliderMax)

    if (distToMin < distToMax || (distToMin === distToMax && numericValue <= sliderMin)) {
      commitRange(numericValue, sliderMax)
    } else {
      commitRange(sliderMin, numericValue)
    }
  }

  // --- Render ------------------------------------------------------------

  const inputBaseClass = `mx-1 h-7 shrink-0 [appearance:textfield] px-0.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`

  return (
    <div className="flex items-center">
      <Input
        type="text"
        inputMode={formatInputProp ? 'text' : 'decimal'}
        value={minDisplayValue}
        onChange={(e) => onMinInputChange(e.target.value)}
        onFocus={() => setEditingField('min')}
        onBlur={() => {
          setEditingField(null)
          commitInputs('min')
        }}
        onKeyDown={onMinKeyDown}
        readOnly={isMinPushed}
        aria-label="Range minimum"
        className={`${inputBaseClass} ${inputClassName} ${isMinPushed ? 'italic' : ''}`}
      />

      <div className="relative mx-0.5 min-w-0 flex-1">
        <Slider
          min={range.min}
          max={range.max}
          step={step}
          value={[sliderMin, sliderMax]}
          minStepsBetweenValues={0}
          onValueChange={onSliderChange}
          onValueCommitted={onSliderCommit}
        />

        {resolvedLabels.length > 0 && (
          <div
            className="absolute top-full left-1/2 mt-0.5 flex w-[97.5%] -translate-x-1/2 justify-between text-[9px] text-muted-foreground"
            style={{ paddingLeft: '0.21rem', paddingRight: '0.21rem' }}
          >
            {resolvedLabels.map((label, index) => (
              <span
                key={index}
                className="flex w-0 cursor-pointer justify-center whitespace-nowrap select-none hover:text-slate-700"
                onClick={() => onStepLabelClick(index)}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <Input
        type="text"
        inputMode={formatInputProp ? 'text' : 'decimal'}
        value={maxDisplayValue}
        onChange={(e) => onMaxInputChange(e.target.value)}
        onFocus={() => setEditingField('max')}
        onBlur={() => {
          setEditingField(null)
          commitInputs('max')
        }}
        onKeyDown={onMaxKeyDown}
        readOnly={isMaxPushed}
        aria-label="Range maximum"
        className={`${inputBaseClass} ${inputClassName} ${isMaxPushed ? 'italic' : ''}`}
      />
    </div>
  )
}
