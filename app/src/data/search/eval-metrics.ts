import { Activity, BookOpenCheck, Clock3, Divide, Star, Target, UserCheck, Video } from 'lucide-react'

import { EVAL_QUESTION_SLUGS, SLUG_LABEL, SLUG_TO_QUESTION_TEXT } from './eval-questions'

import type { LucideIcon } from 'lucide-react'
import type { EvalSlug } from './eval-questions'
import type { SortOption } from './search.params'

export const DERIVED_METRIC_SLUGS = ['hours_per_unit'] as const
export type DerivedMetricSlug = (typeof DERIVED_METRIC_SLUGS)[number]
export type AllMetricSlug = EvalSlug | DerivedMetricSlug

export type EvalMetricDirection = 'higher_better' | 'lower_better' | 'neutral'

type EvalRange = {
  min: number
  max: number
}

type EvalMetricMeta = {
  slug: AllMetricSlug
  label: string
  questionText: string
  icon: LucideIcon
  direction: EvalMetricDirection
  range: EvalRange
  /** When defined, the slider's max position is an open upper bound displayed as this label (e.g. "40+"). */
  openLabel?: string
  visualRange: EvalRange
  curveExponent: number
  badgeClassName: string
  iconClassName: string
  formatValue: (value: number) => string
  sliderFormatInput?: (value: number) => string
  sliderParseInput?: (raw: string) => number | undefined
  sliderValidateInput?: (raw: string) => boolean
  sliderInputClassName?: string
}

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

const ONE_TO_FIVE_RANGE: EvalRange = { min: 1, max: 5 }
const ZERO_TO_HUNDRED_RANGE: EvalRange = { min: 0, max: 100 }

const ONE_TO_FIVE_VISUAL_RANGE: EvalRange = { min: 3, max: 5 }

export const DEFAULT_ALWAYS_VISIBLE_EVAL_SLUGS: AllMetricSlug[] = ['quality', 'hours']

export const EVAL_METRIC_REGISTRY: Record<AllMetricSlug, EvalMetricMeta> = {
  quality: {
    slug: 'quality',
    label: SLUG_LABEL.quality,
    questionText: SLUG_TO_QUESTION_TEXT.quality,
    icon: Star,
    direction: 'higher_better',
    range: ONE_TO_FIVE_RANGE,
    visualRange: ONE_TO_FIVE_VISUAL_RANGE,
    curveExponent: 1.25,
    badgeClassName: 'border-amber-200 bg-amber-50',
    iconClassName: 'text-amber-700',
    formatValue: (value) => value.toFixed(1),
  },
  learning: {
    slug: 'learning',
    label: SLUG_LABEL.learning,
    questionText: SLUG_TO_QUESTION_TEXT.learning,
    icon: BookOpenCheck,
    direction: 'higher_better',
    range: ONE_TO_FIVE_RANGE,
    visualRange: ONE_TO_FIVE_VISUAL_RANGE,
    curveExponent: 1.25,
    badgeClassName: 'border-emerald-200 bg-emerald-50',
    iconClassName: 'text-emerald-700',
    formatValue: (value) => value.toFixed(1),
  },
  organized: {
    slug: 'organized',
    label: SLUG_LABEL.organized,
    questionText: SLUG_TO_QUESTION_TEXT.organized,
    icon: Activity,
    direction: 'higher_better',
    range: ONE_TO_FIVE_RANGE,
    visualRange: ONE_TO_FIVE_VISUAL_RANGE,
    curveExponent: 1.25,
    badgeClassName: 'border-sky-200 bg-sky-50',
    iconClassName: 'text-sky-700',
    formatValue: (value) => value.toFixed(1),
  },
  goals: {
    slug: 'goals',
    label: SLUG_LABEL.goals,
    questionText: SLUG_TO_QUESTION_TEXT.goals,
    icon: Target,
    direction: 'higher_better',
    range: ONE_TO_FIVE_RANGE,
    visualRange: ONE_TO_FIVE_VISUAL_RANGE,
    curveExponent: 1.25,
    badgeClassName: 'border-violet-200 bg-violet-50',
    iconClassName: 'text-violet-700',
    formatValue: (value) => value.toFixed(1),
  },
  attend_in_person: {
    slug: 'attend_in_person',
    label: SLUG_LABEL.attend_in_person,
    questionText: SLUG_TO_QUESTION_TEXT.attend_in_person,
    icon: UserCheck,
    direction: 'neutral',
    range: ZERO_TO_HUNDRED_RANGE,
    visualRange: { min: 10, max: 90 },
    curveExponent: 1.1,
    badgeClassName: 'border-rose-200 bg-rose-50',
    iconClassName: 'text-rose-700',
    formatValue: (value) => `${Math.round(value)}%`,
  },
  attend_online: {
    slug: 'attend_online',
    label: SLUG_LABEL.attend_online,
    questionText: SLUG_TO_QUESTION_TEXT.attend_online,
    icon: Video,
    direction: 'neutral',
    range: ZERO_TO_HUNDRED_RANGE,
    visualRange: { min: 10, max: 90 },
    curveExponent: 1.1,
    badgeClassName: 'border-indigo-200 bg-indigo-50',
    iconClassName: 'text-indigo-700',
    formatValue: (value) => `${Math.round(value)}%`,
  },
  hours: {
    slug: 'hours',
    label: SLUG_LABEL.hours,
    questionText: SLUG_TO_QUESTION_TEXT.hours,
    icon: Clock3,
    direction: 'lower_better',
    range: { min: 0, max: 40 },
    openLabel: '40+',
    visualRange: { min: 2, max: 16 },
    curveExponent: 1.2,
    badgeClassName: 'border-orange-200 bg-orange-50',
    iconClassName: 'text-orange-700',
    formatValue: formatHours,
    sliderFormatInput: formatHours,
    sliderParseInput: parseHours,
    sliderValidateInput: validateHoursInput,
    sliderInputClassName: 'w-10',
  },
  hours_per_unit: {
    slug: 'hours_per_unit',
    label: 'Hours per unit',
    questionText: '',
    icon: Divide,
    direction: 'lower_better',
    range: { min: 0, max: 20 },
    openLabel: '20+',
    visualRange: { min: 1, max: 8 },
    curveExponent: 1.2,
    badgeClassName: 'border-yellow-200 bg-yellow-50',
    iconClassName: 'text-yellow-700',
    formatValue: formatHours,
    sliderFormatInput: formatHours,
    sliderParseInput: parseHours,
    sliderValidateInput: validateHoursInput,
    sliderInputClassName: 'w-10',
  },
}

export function getEvalMetricMeta(slug: AllMetricSlug) {
  return EVAL_METRIC_REGISTRY[slug]
}

export function isHoursPerUnitSort(sort: SortOption): sort is DerivedMetricSlug {
  return sort === 'hours_per_unit'
}

const QUESTION_TEXT_TO_SLUG = new Map(
  Object.entries(SLUG_TO_QUESTION_TEXT).map(([slug, questionText]) => [questionText, slug as EvalSlug]),
)

export function getEvalSlugFromQuestionText(questionText: string): EvalSlug | undefined {
  return QUESTION_TEXT_TO_SLUG.get(questionText)
}

export function isEvalSortOption(sort: SortOption): sort is EvalSlug {
  return EVAL_QUESTION_SLUGS.includes(sort as EvalSlug)
}

export function isAllMetricSlug(slug: string): slug is AllMetricSlug {
  return (
    (EVAL_QUESTION_SLUGS as readonly string[]).includes(slug) ||
    (DERIVED_METRIC_SLUGS as readonly string[]).includes(slug)
  )
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function getEvalIntensity(value: number, slug: AllMetricSlug): number {
  const { visualRange, curveExponent } = EVAL_METRIC_REGISTRY[slug]
  const normalized = clamp01((value - visualRange.min) / (visualRange.max - visualRange.min))
  return normalized ** curveExponent
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return [r, g, b]
}

function rgbToHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b]
    .map((n) => {
      const value = Math.round(Math.min(255, Math.max(0, n)))
      return value.toString(16).padStart(2, '0')
    })
    .join('')}`
}

function interpolateColor(fromHex: string, toHex: string, t: number) {
  const [fr, fg, fb] = hexToRgb(fromHex)
  const [tr, tg, tb] = hexToRgb(toHex)
  return rgbToHex([fr + (tr - fr) * t, fg + (tg - fg) * t, fb + (tb - fb) * t])
}

export function getEvalValueColor(value: number, slug: AllMetricSlug) {
  const metric = EVAL_METRIC_REGISTRY[slug]
  const intensity = getEvalIntensity(value, slug)

  if (metric.direction === 'neutral') {
    return interpolateColor('#64748b', '#0ea5e9', intensity)
  }

  const directionalIntensity = metric.direction === 'higher_better' ? intensity : 1 - intensity
  return interpolateColor('#ef4444', '#22c55e', directionalIntensity)
}

export function getEvalValueGradient(value: number, slug: AllMetricSlug) {
  const metric = EVAL_METRIC_REGISTRY[slug]
  const intensity = getEvalIntensity(value, slug)

  if (metric.direction === 'neutral') {
    return {
      from: interpolateColor('#94a3b8', '#38bdf8', intensity),
      to: interpolateColor('#64748b', '#0ea5e9', intensity),
    }
  }

  const directionalIntensity = metric.direction === 'higher_better' ? intensity : 1 - intensity
  return {
    from: interpolateColor('#fda4af', '#86efac', directionalIntensity),
    to: interpolateColor('#ef4444', '#16a34a', directionalIntensity),
  }
}
