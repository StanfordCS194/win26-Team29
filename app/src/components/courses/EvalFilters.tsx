import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eraser } from 'lucide-react'

import { DERIVED_METRIC_SLUGS, getEvalMetricMeta } from '@/data/search/eval-metrics'
import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { Route } from '@/routes/courses'
import { RangeSlider } from '@/components/courses/RangeSlider'

import type { AllMetricSlug } from '@/data/search/eval-metrics'
import { SearchParams } from '@/data/search/search.params'

type EvalMinKey = `min_eval_${AllMetricSlug}`
type EvalMaxKey = `max_eval_${AllMetricSlug}`

function minKey(slug: AllMetricSlug): EvalMinKey {
  return `min_eval_${slug}`
}

function maxKey(slug: AllMetricSlug): EvalMaxKey {
  return `max_eval_${slug}`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getStep(rangeMin: number, rangeMax: number) {
  return rangeMax - rangeMin <= 8 ? 0.1 : 1
}

function EvalFilterRow({ slug }: { slug: AllMetricSlug }) {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const metric = getEvalMetricMeta(slug)
  const range = metric.range
  const step = useMemo(() => getStep(range.min, range.max), [range.min, range.max])

  const urlMin = search[minKey(slug)] as number | undefined
  const urlMax = search[maxKey(slug)] as number | undefined

  const resolvedMin = urlMin == null ? undefined : clamp(urlMin, range.min, range.max)
  const resolvedMax = urlMax == null ? undefined : clamp(urlMax, range.min, range.max)

  const isActive = urlMin !== undefined || urlMax !== undefined

  const clearFilter = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          [minKey(slug)]: undefined,
          [maxKey(slug)]: undefined,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  const handleChange = ({ min, max }: { min?: number; max?: number }) => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          [minKey(slug)]: min,
          [maxKey(slug)]: max,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">{metric.label}</span>
        {isActive && (
          <button
            type="button"
            onClick={clearFilter}
            aria-label={`Clear ${metric.label} filter`}
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Eraser className="h-3 w-3" />
          </button>
        )}
      </div>
      <RangeSlider
        range={range}
        value={{ min: resolvedMin, max: resolvedMax }}
        onChange={handleChange}
        step={step}
        stepLabels={5}
        openMax={metric.openLabel != null && metric.openLabel.length > 0}
        formatInput={metric.sliderFormatInput}
        parseInput={metric.sliderParseInput}
        validateInput={metric.sliderValidateInput}
        inputClassName={metric.sliderInputClassName ?? 'w-8'}
      />
      <div className="h-1" />
    </div>
  )
}

export function EvalFilters() {
  const [showMore, setShowMore] = useState(false)
  const alwaysVisibleSlugs = EVAL_QUESTION_SLUGS.slice(0, 2)
  const collapsibleSlugs = EVAL_QUESTION_SLUGS.slice(2)

  return (
    <div className="flex flex-col gap-2">
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
              {DERIVED_METRIC_SLUGS.map((slug) => (
                <EvalFilterRow key={slug} slug={slug} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
