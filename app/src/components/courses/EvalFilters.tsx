import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { getEvalMetricMeta } from '@/data/search/eval-metrics'
import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { Route } from '@/routes/courses'
import { CoursesSearch } from '@/data/search/search.types'

import type { EvalSlug } from '@/data/search/eval-questions'

type EvalMinKey = `min_eval_${EvalSlug}`
type EvalMaxKey = `max_eval_${EvalSlug}`

function minKey(slug: EvalSlug): EvalMinKey {
  return `min_eval_${slug}`
}

function maxKey(slug: EvalSlug): EvalMaxKey {
  return `max_eval_${slug}`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getStep(rangeMin: number, rangeMax: number) {
  return rangeMax - rangeMin <= 8 ? 0.1 : 1
}

function getPrecision(step: number) {
  const parts = String(step).split('.')
  return parts[1]?.length ?? 0
}

function formatValue(value: number, step: number) {
  const precision = getPrecision(step)
  return precision > 0 ? value.toFixed(precision) : String(Math.round(value))
}

function parseInput(value: string) {
  if (value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function isNumericInput(value: string) {
  return /^\d*\.?\d*$/.test(value)
}

function EvalFilterRow({ slug }: { slug: EvalSlug }) {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const metric = getEvalMetricMeta(slug)
  const range = metric.range
  const step = useMemo(() => getStep(range.min, range.max), [range.max, range.min])

  const urlMin = search[minKey(slug)] as number | undefined
  const urlMax = search[maxKey(slug)] as number | undefined

  const resolvedMin = urlMin == null ? undefined : clamp(urlMin, range.min, range.max)
  const resolvedMax = urlMax == null ? undefined : clamp(urlMax, range.min, range.max)

  const [draftMin, setDraftMin] = useState<number | undefined>(resolvedMin)
  const [draftMax, setDraftMax] = useState<number | undefined>(resolvedMax)
  const [minInput, setMinInput] = useState(resolvedMin == null ? '' : formatValue(resolvedMin, step))
  const [maxInput, setMaxInput] = useState(resolvedMax == null ? '' : formatValue(resolvedMax, step))

  useEffect(() => {
    setDraftMin(resolvedMin)
    setDraftMax(resolvedMax)
  }, [resolvedMin, resolvedMax])

  useEffect(() => {
    setMinInput(draftMin == null ? '' : formatValue(draftMin, step))
    setMaxInput(draftMax == null ? '' : formatValue(draftMax, step))
  }, [draftMin, draftMax, step])

  const sliderMin = draftMin ?? range.min
  const sliderMax = draftMax ?? range.max

  const applyRange = (nextMin: number | undefined, nextMax: number | undefined) => {
    const boundedMin = nextMin == null ? undefined : clamp(nextMin, range.min, range.max)
    const boundedMax = nextMax == null ? undefined : clamp(nextMax, range.min, range.max)

    const orderedMin =
      boundedMin != null && boundedMax != null ? Math.min(boundedMin, boundedMax) : boundedMin
    const orderedMax =
      boundedMin != null && boundedMax != null ? Math.max(boundedMin, boundedMax) : boundedMax

    const normalizedMin = orderedMin != null && orderedMin <= range.min ? undefined : orderedMin
    const normalizedMax = orderedMax != null && orderedMax >= range.max ? undefined : orderedMax

    setDraftMin(normalizedMin)
    setDraftMax(normalizedMax)

    void navigate({
      search: (prev) =>
        ({
          ...prev,
          [minKey(slug)]: normalizedMin,
          [maxKey(slug)]: normalizedMax,
          page: 1,
        }) as Required<CoursesSearch>,
    })
  }

  const onSliderChange = (next: number | readonly number[]) => {
    if (!Array.isArray(next) || next.length !== 2) return
    const nextMin = clamp(next[0] ?? range.min, range.min, range.max)
    const nextMax = clamp(next[1] ?? range.max, nextMin, range.max)
    setDraftMin(nextMin)
    setDraftMax(nextMax)
  }

  const onSliderCommit = (next: number | readonly number[]) => {
    if (!Array.isArray(next) || next.length !== 2) return
    const nextMin = clamp(next[0] ?? range.min, range.min, range.max)
    const nextMax = clamp(next[1] ?? range.max, nextMin, range.max)
    applyRange(nextMin, nextMax)
  }

  const onMinInputChange = (value: string) => {
    if (!isNumericInput(value)) return
    setMinInput(value)
    const parsed = parseInput(value)
    if (parsed == null) {
      setDraftMin(undefined)
      return
    }
    const bounded = clamp(parsed, range.min, draftMax ?? range.max)
    setDraftMin(bounded)
  }

  const onMaxInputChange = (value: string) => {
    if (!isNumericInput(value)) return
    setMaxInput(value)
    const parsed = parseInput(value)
    if (parsed == null) {
      setDraftMax(undefined)
      return
    }
    const bounded = clamp(parsed, draftMin ?? range.min, range.max)
    setDraftMax(bounded)
  }

  const commitInputs = () => {
    const parsedMin = parseInput(minInput)
    const parsedMax = parseInput(maxInput)
    const nextMin = parsedMin == null ? undefined : parsedMin
    const nextMax = parsedMax == null ? undefined : parsedMax
    applyRange(nextMin, nextMax)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">{metric.label}</span>
      <div className="flex items-center">
        <Input
          type="text"
          inputMode="decimal"
          value={minInput}
          onChange={(e) => onMinInputChange(e.target.value)}
          onBlur={commitInputs}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInputs()
          }}
          aria-label={`Minimum ${metric.label}`}
          placeholder={formatValue(range.min, step)}
          className="mx-1 h-7 w-8 shrink-0 [appearance:textfield] px-0.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="mx-0.5 min-w-0 flex-1">
          <Slider
            min={range.min}
            max={range.max}
            step={step}
            value={[sliderMin, sliderMax]}
            minStepsBetweenValues={0}
            onValueChange={onSliderChange}
            onValueCommitted={onSliderCommit}
          />
        </div>
        <Input
          type="text"
          inputMode="decimal"
          value={maxInput}
          onChange={(e) => onMaxInputChange(e.target.value)}
          onBlur={commitInputs}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInputs()
          }}
          aria-label={`Maximum ${metric.label}`}
          placeholder={formatValue(range.max, step)}
          className="mx-1 h-7 w-8 shrink-0 [appearance:textfield] px-0.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <div className="h-1.5" />
    </div>
  )
}

export function EvalFilters() {
  const [showMore, setShowMore] = useState(false)
  const alwaysVisibleSlugs = EVAL_QUESTION_SLUGS.slice(0, 2)
  const collapsibleSlugs = EVAL_QUESTION_SLUGS.slice(2)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Eval filters</span>
      <div className="flex flex-col gap-1">
        {alwaysVisibleSlugs.map((slug) => (
          <EvalFilterRow key={slug} slug={slug} />
        ))}
      </div>
      {collapsibleSlugs.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowMore((value) => !value)}
            className="flex items-center gap-1 rounded text-xs font-medium tracking-wide text-slate-500 uppercase transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            More eval filters
            {showMore ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          {showMore && (
            <div className="flex flex-col gap-1">
              {collapsibleSlugs.map((slug) => (
                <EvalFilterRow key={slug} slug={slug} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
