import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eraser } from 'lucide-react'

import { Route } from '@/routes/courses'
import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { EVAL_METRIC_REGISTRY } from '@/data/search/eval-metrics'
import type { SearchParams } from '@/data/search/search.params'
import type { EvalSlug } from '@/data/search/eval-questions'
import type { DerivedMetricSlug } from '@/data/search/eval-metrics'
import { availableInstructorsQueryOptions } from './courses-query-options'
import { useClearAllFilters } from './use-clear-all-filters'
import { labelGradingTokens } from './grading-groups'
import { labelSubjectTokens } from './subject-tokens'

interface FilterBadge {
  id: string
  label: string
  summary: string
  onClear: () => void
}

function formatRange(
  min: number | undefined,
  max: number | undefined,
  format: (n: number) => string = String,
  suffix = '',
): string {
  if (min !== undefined && max !== undefined) return `${format(min)}–${format(max)}${suffix}`
  if (min !== undefined) return `≥${format(min)}${suffix}`
  if (max !== undefined) return `≤${format(max)}${suffix}`
  return ''
}

function formatList(items: string[], maxInline = 2, separator = ', '): string {
  if (items.length === 0) return ''
  const shown = items.slice(0, maxInline)
  const overflow = items.length - shown.length
  if (overflow > 0) shown.push(`+${overflow}`)
  return shown.join(separator)
}

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  space_available: 'available',
  waitlist_only: 'waitlist',
  full: 'full',
}

const BADGE_SECTION: Record<string, string> = {
  subjects: 'filter-subjects',
  subjectsExclude: 'filter-subjects',
  numSubjects: 'filter-subjects',
  quarters: 'filter-quarters',
  quartersExclude: 'filter-quarters',
  numQuarters: 'filter-quarters',
  days: 'filter-days',
  daysExclude: 'filter-days',
  numMeetingDays: 'filter-days',
  codeNumber: 'filter-codeNumber',
  units: 'filter-units',
  classDuration: 'filter-duration',
  startTime: 'filter-startTime',
  gers: 'filter-gers',
  gersExclude: 'filter-gers',
  numGers: 'filter-gers',
  instructorSunets: 'filter-instructors',
  instructorSunetsExclude: 'filter-instructors',
  numEnrolled: 'filter-enrollment',
  maxEnrolled: 'filter-enrollment',
  enrollmentStatus: 'filter-enrollment',
  repeatable: 'filter-repeatable',
  careers: 'filter-careers',
  careersExclude: 'filter-careers',
  componentTypes: 'filter-components',
  componentTypesExclude: 'filter-components',
  hasAccompanyingSections: 'filter-components',
  newThisYear: 'filter-newThisYear',
  gradingOptions: 'filter-gradingOptions',
  gradingOptionsExclude: 'filter-gradingOptions',
  finalExamFlags: 'filter-finalExam',
  finalExamFlagsExclude: 'filter-finalExam',
}

function scrollToFilter(badgeId: string) {
  const sectionId = badgeId.startsWith('eval_') ? 'filter-evals' : (BADGE_SECTION[badgeId] ?? '')
  const target = document.getElementById(sectionId)
  const container = target?.closest('[data-filter-scroll]') as HTMLElement | null
  if (!target || !container) return
  const targetTop = target.getBoundingClientRect().top
  const containerTop = container.getBoundingClientRect().top
  container.scrollBy({ top: targetTop - containerTop, behavior: 'smooth' })
}

const EVAL_BADGE_LABEL: Record<EvalSlug, string> = {
  quality: 'Quality',
  learning: 'Learning',
  organized: 'Organization',
  goals: 'Goals',
  attend_in_person: 'In-person att.',
  attend_online: 'Online att.',
  hours: 'Hrs/wk',
}

const DERIVED_BADGE_LABEL: Record<DerivedMetricSlug, string> = {
  hours_per_unit: 'Hrs/unit',
}

export function AppliedFilterBadges({
  autoFocusClearAll,
  centered,
  large,
  committedSearch,
}: {
  autoFocusClearAll?: boolean
  centered?: boolean
  large?: boolean
  committedSearch?: SearchParams
}) {
  const liveSearch = Route.useSearch()
  const search = committedSearch ?? liveSearch
  const navigate = Route.useNavigate()
  const { data: instructors = [] } = useQuery(availableInstructorsQueryOptions(search.year))
  const containerRef = useRef<HTMLDivElement>(null)
  const clearAllRef = useRef<HTMLButtonElement>(null)

  const focusByIdx = useCallback((idx: number) => {
    containerRef.current?.querySelector<HTMLElement>(`[data-flat-idx="${idx}"]`)?.focus()
  }, [])

  const focusSpatially = useCallback((currentEl: HTMLElement, direction: 'up' | 'down') => {
    if (!containerRef.current) return
    const candidates = Array.from(containerRef.current.querySelectorAll<HTMLElement>('[data-flat-idx]'))
    const currentRect = currentEl.getBoundingClientRect()
    const currentCenterX = (currentRect.left + currentRect.right) / 2
    const threshold = currentRect.height / 2

    const targetCandidates =
      direction === 'down'
        ? candidates.filter((el) => el.getBoundingClientRect().top > currentRect.top + threshold)
        : candidates.filter((el) => el.getBoundingClientRect().top < currentRect.top - threshold)

    if (targetCandidates.length === 0) return

    const targetRowTop =
      direction === 'down'
        ? Math.min(...targetCandidates.map((el) => el.getBoundingClientRect().top))
        : Math.max(...targetCandidates.map((el) => el.getBoundingClientRect().top))

    const rowCandidates = targetCandidates.filter(
      (el) => Math.abs(el.getBoundingClientRect().top - targetRowTop) <= threshold,
    )

    const best = rowCandidates.reduce((prev, curr) => {
      const prevRect = prev.getBoundingClientRect()
      const currRect = curr.getBoundingClientRect()
      const prevDist = Math.abs((prevRect.left + prevRect.right) / 2 - currentCenterX)
      const currDist = Math.abs((currRect.left + currRect.right) / 2 - currentCenterX)
      return currDist < prevDist ? curr : prev
    })

    best.focus()
  }, [])

  const handleBadgeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, flatIdx: number, onClear?: () => void) => {
      const target = e.currentTarget

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        focusByIdx(flatIdx + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        focusByIdx(flatIdx - 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusSpatially(target, 'down')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusSpatially(target, 'up')
      } else if (e.key === 'Enter' || e.key === ' ') {
        // native button click handles "Clear all"; badge spans need explicit handling
        if (target.tagName !== 'BUTTON') {
          e.preventDefault()
          target.click()
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onClear?.()
        // shift focus to next badge, or previous if at end
        const allBadges = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>('[data-flat-idx]') ?? [],
        )
        const totalCount = allBadges.length
        const nextIdx = flatIdx < totalCount - 1 ? flatIdx + 1 : flatIdx - 1
        // use setTimeout so focus lands after the badge disappears from the DOM
        if (nextIdx >= 0) setTimeout(() => focusByIdx(nextIdx), 0)
      }
    },
    [focusByIdx, focusSpatially],
  )

  const clearAll = useClearAllFilters()

  const badges = useMemo((): FilterBadge[] => {
    const nav = (patch: Partial<SearchParams>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
      })
    }

    const result: FilterBadge[] = []

    if (search.subjects.length > 0) {
      result.push({
        id: 'subjects',
        label: 'Subjects',
        summary: formatList(
          labelSubjectTokens(search.subjects),
          2,
          search.subjectsIncludeMode === 'and' ? ' & ' : ', ',
        ),
        onClear: () => nav({ subjects: [] }),
      })
    }

    if (search.subjectsExclude.length > 0) {
      result.push({
        id: 'subjectsExclude',
        label: 'Exclude Subjects',
        summary: formatList(labelSubjectTokens(search.subjectsExclude)),
        onClear: () => nav({ subjectsExclude: [] }),
      })
    }

    if (search.numSubjectsMin !== undefined || search.numSubjectsMax !== undefined) {
      result.push({
        id: 'numSubjects',
        label: '# subjects',
        summary: formatRange(search.numSubjectsMin, search.numSubjectsMax),
        onClear: () => nav({ numSubjectsMin: undefined, numSubjectsMax: undefined }),
      })
    }

    if (search.quarters.length > 0) {
      result.push({
        id: 'quarters',
        label: 'Quarters',
        summary: formatList(search.quarters, 2, search.quartersIncludeMode === 'and' ? ' & ' : ', '),
        onClear: () => nav({ quarters: [] }),
      })
    }

    if (search.quartersExclude.length > 0) {
      result.push({
        id: 'quartersExclude',
        label: 'Exclude Quarters',
        summary: formatList(search.quartersExclude),
        onClear: () => nav({ quartersExclude: [] }),
      })
    }

    if (search.numQuartersMin !== undefined || search.numQuartersMax !== undefined) {
      result.push({
        id: 'numQuarters',
        label: '# quarters',
        summary: formatRange(search.numQuartersMin, search.numQuartersMax),
        onClear: () => nav({ numQuartersMin: undefined, numQuartersMax: undefined }),
      })
    }

    if ((search.days?.length ?? 0) > 0) {
      result.push({
        id: 'days',
        label: 'Days',
        summary: formatList(search.days ?? [], 2, search.daysIncludeMode === 'and' ? ' & ' : ', '),
        onClear: () => nav({ days: undefined }),
      })
    }

    if ((search.daysExclude?.length ?? 0) > 0) {
      result.push({
        id: 'daysExclude',
        label: 'Exclude Days',
        summary: formatList(search.daysExclude ?? []),
        onClear: () => nav({ daysExclude: undefined }),
      })
    }

    if (search.numMeetingDaysMin !== undefined || search.numMeetingDaysMax !== undefined) {
      result.push({
        id: 'numMeetingDays',
        label: 'Meeting days',
        summary: formatRange(search.numMeetingDaysMin, search.numMeetingDaysMax),
        onClear: () => nav({ numMeetingDaysMin: undefined, numMeetingDaysMax: undefined }),
      })
    }

    if (search.codeNumberMin !== undefined || search.codeNumberMax !== undefined) {
      result.push({
        id: 'codeNumber',
        label: 'Course #',
        summary: formatRange(search.codeNumberMin, search.codeNumberMax),
        onClear: () => nav({ codeNumberMin: undefined, codeNumberMax: undefined }),
      })
    }

    if (search.unitsMin !== undefined || search.unitsMax !== undefined) {
      result.push({
        id: 'units',
        label: 'Units',
        summary: formatRange(search.unitsMin, search.unitsMax),
        onClear: () => nav({ unitsMin: undefined, unitsMax: undefined }),
      })
    }

    if (search.classDurationMin !== undefined || search.classDurationMax !== undefined) {
      result.push({
        id: 'classDuration',
        label: 'Duration',
        summary: formatRange(search.classDurationMin, search.classDurationMax, (v) => v.toFixed(1), ' hr'),
        onClear: () => nav({ classDurationMin: undefined, classDurationMax: undefined }),
      })
    }

    if (search.startTimeMin !== undefined || search.endTimeMax !== undefined) {
      const formatIsoTime = (s: string) => {
        const parts = s.split(':').map(Number)
        const totalMinutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
        const h = Math.floor(totalMinutes / 60) % 24
        const m = totalMinutes % 60
        const period = h < 12 ? 'AM' : 'PM'
        const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
        return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`
      }
      const minLabel = search.startTimeMin !== undefined ? formatIsoTime(search.startTimeMin) : undefined
      const maxLabel = search.endTimeMax !== undefined ? formatIsoTime(search.endTimeMax) : undefined
      const summary =
        minLabel !== undefined && maxLabel !== undefined
          ? `${minLabel}–${maxLabel}`
          : minLabel !== undefined
            ? `≥${minLabel}`
            : `≤${maxLabel}`
      result.push({
        id: 'startTime',
        label: 'Class time',
        summary,
        onClear: () => nav({ startTimeMin: undefined, endTimeMax: undefined }),
      })
    }

    if (search.gers.length > 0) {
      result.push({
        id: 'gers',
        label: 'GERs',
        summary: formatList(search.gers, 2, search.gersIncludeMode === 'and' ? ' & ' : ', '),
        onClear: () => nav({ gers: [] }),
      })
    }

    if (search.gersExclude.length > 0) {
      result.push({
        id: 'gersExclude',
        label: 'Exclude GERs',
        summary: formatList(search.gersExclude),
        onClear: () => nav({ gersExclude: [] }),
      })
    }

    if (search.numGersMin !== undefined || search.numGersMax !== undefined) {
      result.push({
        id: 'numGers',
        label: 'GER count',
        summary: formatRange(search.numGersMin, search.numGersMax),
        onClear: () => nav({ numGersMin: undefined, numGersMax: undefined }),
      })
    }

    if (search.careers.length > 0) {
      result.push({
        id: 'careers',
        label: 'Career',
        summary: formatList(search.careers),
        onClear: () => nav({ careers: [] }),
      })
    }

    if (search.careersExclude.length > 0) {
      result.push({
        id: 'careersExclude',
        label: 'Exclude Career',
        summary: formatList(search.careersExclude),
        onClear: () => nav({ careersExclude: [] }),
      })
    }

    if (search.gradingOptions.length > 0) {
      result.push({
        id: 'gradingOptions',
        label: 'Grading',
        summary: formatList(labelGradingTokens(search.gradingOptions)),
        onClear: () => nav({ gradingOptions: [] }),
      })
    }

    if (search.gradingOptionsExclude.length > 0) {
      result.push({
        id: 'gradingOptionsExclude',
        label: 'Exclude Grading',
        summary: formatList(labelGradingTokens(search.gradingOptionsExclude)),
        onClear: () => nav({ gradingOptionsExclude: [] }),
      })
    }

    if (search.finalExamFlags.length > 0) {
      result.push({
        id: 'finalExamFlags',
        label: 'Final Exam',
        summary: formatList(search.finalExamFlags),
        onClear: () => nav({ finalExamFlags: [] }),
      })
    }

    if (search.finalExamFlagsExclude.length > 0) {
      result.push({
        id: 'finalExamFlagsExclude',
        label: 'Exclude Final Exam',
        summary: formatList(search.finalExamFlagsExclude),
        onClear: () => nav({ finalExamFlagsExclude: [] }),
      })
    }

    if (search.componentTypes.length > 0) {
      result.push({
        id: 'componentTypes',
        label: 'Component',
        summary: formatList(search.componentTypes),
        onClear: () => nav({ componentTypes: [] }),
      })
    }

    if (search.componentTypesExclude.length > 0) {
      result.push({
        id: 'componentTypesExclude',
        label: 'Exclude Component',
        summary: formatList(search.componentTypesExclude),
        onClear: () => nav({ componentTypesExclude: [] }),
      })
    }

    for (const slug of EVAL_QUESTION_SLUGS) {
      const min = search[`min_eval_${slug}` as keyof SearchParams] as number | undefined
      const max = search[`max_eval_${slug}` as keyof SearchParams] as number | undefined
      if (min !== undefined || max !== undefined) {
        const { formatValue } = EVAL_METRIC_REGISTRY[slug]
        result.push({
          id: `eval_${slug}`,
          label: EVAL_BADGE_LABEL[slug],
          summary: formatRange(min, max, formatValue),
          onClear: () =>
            nav({
              [`min_eval_${slug}`]: undefined,
              [`max_eval_${slug}`]: undefined,
            } as Partial<SearchParams>),
        })
      }
    }

    if (search.min_eval_hours_per_unit !== undefined || search.max_eval_hours_per_unit !== undefined) {
      const { formatValue } = EVAL_METRIC_REGISTRY.hours_per_unit
      result.push({
        id: 'eval_hours_per_unit',
        label: DERIVED_BADGE_LABEL.hours_per_unit,
        summary: formatRange(search.min_eval_hours_per_unit, search.max_eval_hours_per_unit, formatValue),
        onClear: () => nav({ min_eval_hours_per_unit: undefined, max_eval_hours_per_unit: undefined }),
      })
    }

    if (search.numEnrolledMin !== undefined || search.numEnrolledMax !== undefined) {
      result.push({
        id: 'numEnrolled',
        label: 'Enrolled',
        summary: formatRange(search.numEnrolledMin, search.numEnrolledMax),
        onClear: () => nav({ numEnrolledMin: undefined, numEnrolledMax: undefined }),
      })
    }

    if (search.maxEnrolledMin !== undefined || search.maxEnrolledMax !== undefined) {
      result.push({
        id: 'maxEnrolled',
        label: 'Class size',
        summary: formatRange(search.maxEnrolledMin, search.maxEnrolledMax),
        onClear: () => nav({ maxEnrolledMin: undefined, maxEnrolledMax: undefined }),
      })
    }

    if (search.enrollmentStatus != null && search.enrollmentStatus.length > 0) {
      result.push({
        id: 'enrollmentStatus',
        label: 'Status',
        summary: search.enrollmentStatus.map((s) => ENROLLMENT_STATUS_LABELS[s] ?? s).join(', '),
        onClear: () => nav({ enrollmentStatus: undefined }),
      })
    }

    if (search.repeatable !== undefined) {
      result.push({
        id: 'repeatable',
        label: 'Repeatable',
        summary: search.repeatable ? 'Yes' : 'No',
        onClear: () => nav({ repeatable: undefined }),
      })
    }

    if (search.hasAccompanyingSections !== undefined) {
      result.push({
        id: 'hasAccompanyingSections',
        label: 'Accompanying sections',
        summary: search.hasAccompanyingSections ? 'Has' : 'None',
        onClear: () => nav({ hasAccompanyingSections: undefined }),
      })
    }

    if (search.newThisYear != null && search.year >= '2022-2023') {
      result.push({
        id: 'newThisYear',
        label: 'Offering history',
        summary: search.newThisYear ? 'New this year' : 'Has been recently offered',
        onClear: () => nav({ newThisYear: undefined }),
      })
    }

    const sunetToName = new Map(instructors.map((inst) => [inst.sunet, inst.name]))

    if (search.instructorSunets.length > 0) {
      result.push({
        id: 'instructorSunets',
        label: 'Instructors',
        summary: formatList(
          search.instructorSunets.map((s) => sunetToName.get(s) ?? s),
          2,
          search.instructorSunetsIncludeMode === 'and' ? ' & ' : ', ',
        ),
        onClear: () => nav({ instructorSunets: [] }),
      })
    }

    if (search.instructorSunetsExclude.length > 0) {
      result.push({
        id: 'instructorSunetsExclude',
        label: 'Excl. Instructors',
        summary: formatList(search.instructorSunetsExclude.map((s) => sunetToName.get(s) ?? s)),
        onClear: () => nav({ instructorSunetsExclude: [] }),
      })
    }

    return result
  }, [search, navigate, instructors])

  useEffect(() => {
    if (autoFocusClearAll === true && badges.length > 0) {
      clearAllRef.current?.focus()
    }
  }, [autoFocusClearAll, badges.length])

  const badgeClass =
    large === true
      ? 'group inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:ring-2 focus:ring-slate-300 focus:outline-none'
      : 'group inline-flex cursor-pointer items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:ring-2 focus:ring-slate-300 focus:outline-none'
  const textMaxW = large === true ? 'max-w-[16rem]' : 'max-w-[11.5rem]'
  const iconClass = large === true ? 'h-3.5 w-3.5' : 'h-3 w-3'
  const clearAllClass =
    large === true
      ? 'inline-flex items-center gap-1 rounded-full border border-slate-400 bg-white px-3 py-1 text-sm font-bold text-slate-600 transition animate-pulse hover:animate-none hover:border-red-400 hover:bg-red-50 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none'
      : 'inline-flex items-center gap-0.5 rounded-full border border-slate-400 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500 transition hover:border-red-400 hover:bg-red-50 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none'

  return (
    <div>
      {badges.length > 0 && (
        <div className={large === true ? '' : 'border-t border-slate-200'}>
          <div
            ref={containerRef}
            className={`flex flex-wrap gap-1.5 pt-1 pb-1.5 ${centered === true ? 'justify-center' : ''}`}
          >
            {badges.map((badge, idx) => (
              <span
                key={badge.id}
                tabIndex={0}
                role="button"
                data-flat-idx={idx}
                onClick={() => scrollToFilter(badge.id)}
                onKeyDown={(e) => handleBadgeKeyDown(e, idx, badge.onClear)}
                aria-label={`${badge.label}: ${badge.summary}. Press Enter to jump to filter, Delete to clear.`}
                className={badgeClass}
              >
                <span className={`${textMaxW} truncate group-hover:[-webkit-text-stroke:0.2px_currentColor]`}>
                  <span className="font-medium text-slate-500">{badge.label}:</span> {badge.summary}
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    badge.onClear()
                  }}
                  aria-label={`Clear ${badge.label} filter`}
                  className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:outline-none"
                >
                  <Eraser className={iconClass} />
                </button>
              </span>
            ))}
            <button
              ref={clearAllRef}
              type="button"
              tabIndex={0}
              data-flat-idx={badges.length}
              onClick={clearAll}
              onKeyDown={(e) => handleBadgeKeyDown(e, badges.length, clearAll)}
              className={clearAllClass}
              aria-label="Clear all filters"
            >
              Clear all
              <Eraser className={iconClass} />
            </button>
          </div>
        </div>
      )}
      {large !== true && <div className="border-b border-slate-200" />}
    </div>
  )
}
