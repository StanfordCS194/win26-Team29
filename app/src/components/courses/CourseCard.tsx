import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import '../../routeTree.gen'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { DescriptionClamp } from '@/components/courses/DescriptionClamp'
import { renderDescriptionWithLinks } from '@/components/courses/render-description-links'
import { getEvalMetricMeta, getEvalSlugFromQuestionText, getEvalValueColor } from '@/data/search/eval-metrics'
import { formatCourseCodeFromParts, toCourseCodeSlug } from '@/lib/course-code'
import { courseByCodeQueryOptions } from './courses-query-options'
import { FINAL_EXAM_LABELS } from './final-exam-labels'

import type { Quarter, SearchCourseResult, SearchResultSections } from '@/data/search/search.params'
import type { EvalSlug } from '@/data/search/eval-questions'
import type { AllMetricSlug } from '@/data/search/eval-metrics'
import type { MvSection } from '@courses/db/db-postgres-js'

const QUARTER_ORDER: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

const QUARTER_COLORS: Record<Quarter, { bg: string; text: string; dot: string }> = {
  Autumn: { bg: 'bg-orange-50/80', text: 'text-orange-800', dot: 'bg-orange-500' },
  Winter: { bg: 'bg-sky-50/80', text: 'text-sky-800', dot: 'bg-sky-500' },
  Spring: { bg: 'bg-emerald-50/80', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  Summer: { bg: 'bg-yellow-50/80', text: 'text-yellow-800', dot: 'bg-yellow-500' },
}

const VISIBLE_SECTIONS_BEFORE_COLLAPSE = 2
const MANY_SECTIONS_THRESHOLD = 10
const VISIBLE_SECTIONS_WHEN_MANY = 1

const DAY_CODE: Record<string, string> = {
  Monday: 'M',
  Tuesday: 'Tu',
  Wednesday: 'W',
  Thursday: 'Th',
  Friday: 'F',
  Saturday: 'Sa',
  Sunday: 'Su',
}

function getInstructorsForSection(section: MvSection): { name: string; sunet: string }[] {
  const seen = new Set<string>()
  const result: { name: string; sunet: string }[] = []

  for (const schedule of section.schedules) {
    for (const instructor of schedule.instructors) {
      const role = instructor.role?.toLowerCase() ?? ''
      if (role.includes('ta') || role.includes('teaching assistant')) continue
      if (!seen.has(instructor.name)) {
        seen.add(instructor.name)
        result.push({ name: instructor.name, sunet: instructor.sunet })
      }
    }
  }

  return result
}

function formatTime(value: string | null): string | null {
  if (value === null || value === '') return null
  const match = /^(\d{2}):(\d{2})/.exec(value)
  if (!match) return value
  const hour24 = Number(match[1])
  const minute = match[2]
  const suffix = hour24 >= 12 ? 'p' : 'a'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minute}${suffix}`
}

function formatScheduleEntry(section: MvSection): string[] {
  const entries = new Set<string>()
  for (const schedule of section.schedules) {
    const dayPart = schedule.days?.map((day) => DAY_CODE[day] ?? day.slice(0, 2)).join('') ?? ''
    const start = formatTime(schedule.startTime)
    const end = formatTime(schedule.endTime)
    const hasStart = start !== null && start !== ''
    const hasEnd = end !== null && end !== ''
    const timePart = hasStart && hasEnd ? `${start}-${end}` : (start ?? end ?? '')
    const summary = `${dayPart}${dayPart && timePart ? ' ' : ''}${timePart}`.trim()
    if (summary.length > 0) entries.add(summary)
  }
  return [...entries]
}

export interface SectionEvalEntry {
  value: number
  isCourseInformed: boolean
  isInstructorInformed: boolean
}

function getSectionEvalValues(section: MvSection): Partial<Record<EvalSlug, SectionEvalEntry>> {
  const values: Partial<Record<EvalSlug, SectionEvalEntry>> = {}
  for (const metric of section.smartEvaluations) {
    const slug = getEvalSlugFromQuestionText(metric.question)
    if (!slug) continue
    values[slug] = {
      value: metric.smartAverage,
      isCourseInformed: metric.isCourseInformed,
      isInstructorInformed: metric.isInstructorInformed,
    }
  }
  return values
}

function isPrincipalSection(section: MvSection) {
  return section.unitsMin != null || section.unitsMax != null
}

function getEnrollmentColor(numEnrolled: number, maxEnrolled: number): string {
  if (maxEnrolled === 0) return 'text-slate-500'
  const ratio = numEnrolled / maxEnrolled
  if (ratio >= 1) return 'text-red-600'
  if (ratio >= 0.85) return 'text-amber-600'
  return 'text-emerald-600'
}

function EnrollmentInfo({ section }: { section: MvSection }) {
  const enrollColor = getEnrollmentColor(section.numEnrolled, section.maxEnrolled)
  const isFull = section.maxEnrolled > 0 && section.numEnrolled >= section.maxEnrolled
  const hasWaitlist = section.maxWaitlist > 0 && (section.numWaitlist > 0 || isFull)
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className={`font-medium ${enrollColor}`}>
        {section.numEnrolled}/{section.maxEnrolled}
      </span>
      {hasWaitlist && (
        <span className="text-slate-400">
          {section.numWaitlist}/{section.maxWaitlist}
          <span className="ml-0.5 font-medium">WL</span>
        </span>
      )}
    </span>
  )
}

function getHoursPerUnitEntry(
  evalValues: Partial<Record<EvalSlug, SectionEvalEntry>>,
  courseUnitsMin: number,
  courseUnitsMax: number,
): SectionEvalEntry | undefined {
  const hoursEntry = evalValues.hours
  if (hoursEntry == null) return undefined
  const unitsMidpoint = Math.ceil((courseUnitsMin + courseUnitsMax) / 2)
  if (unitsMidpoint === 0) return undefined
  return {
    value: hoursEntry.value / unitsMidpoint,
    isCourseInformed: hoursEntry.isCourseInformed,
    isInstructorInformed: hoursEntry.isInstructorInformed,
  }
}

function SectionRow({
  section,
  showSchedule,
  visibleEvalSlugs,
  courseUnitsMin,
  courseUnitsMax,
}: {
  section: MvSection
  showSchedule: boolean
  visibleEvalSlugs: AllMetricSlug[]
  courseUnitsMin: number
  courseUnitsMax: number
}) {
  const instructors = getInstructorsForSection(section)
  const [maxInstructorsToShow, setMaxInstructorsToShow] = useState(instructors.length)
  const instructorRef = useRef<HTMLSpanElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const prevRowWidthRef = useRef<number>(0)

  useLayoutEffect(() => {
    const el = instructorRef.current
    if (!el || maxInstructorsToShow <= 1) return
    if (el.scrollWidth > el.clientWidth) {
      setMaxInstructorsToShow((prev) => Math.max(1, prev - 1))
    }
  }, [instructors.length, maxInstructorsToShow])

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    prevRowWidthRef.current = row.offsetWidth
    const ro = new ResizeObserver((entries) => {
      const newWidth = entries[0]?.contentRect.width ?? 0
      if (newWidth > prevRowWidthRef.current) {
        setMaxInstructorsToShow(instructors.length)
      }
      prevRowWidthRef.current = newWidth
    })
    ro.observe(row)
    return () => ro.disconnect()
  }, [instructors.length])

  const maxToShow = Math.min(maxInstructorsToShow, instructors.length)
  const shown = instructors.slice(0, maxToShow)
  const hidden = instructors.slice(maxToShow)
  const overflow = hidden.length > 0

  const InstructorDisplay = ({ inst }: { inst: { name: string; sunet: string } }) =>
    inst.sunet ? (
      <Link
        to="/instructor/$sunet"
        params={{ sunet: inst.sunet }}
        className="font-semibold text-slate-900 transition-colors hover:text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {inst.name}
      </Link>
    ) : (
      <span className="font-semibold text-slate-900">{inst.name}</span>
    )
  const schedules = showSchedule ? formatScheduleEntry(section) : []
  const evalValues = getSectionEvalValues(section)
  const scheduleSummary = schedules.join(' | ')

  return (
    <div ref={rowRef} className="flex min-w-0 items-baseline gap-0.5 py-1 text-[12px] leading-tight">
      {shown.length > 0 && (
        <>
          <span ref={instructorRef} className="min-w-0 truncate font-semibold">
            {shown.map((inst, i) => (
              <span key={inst.sunet}>
                {i > 0 && ', '}
                <InstructorDisplay inst={inst} />
              </span>
            ))}
          </span>
          {overflow && (
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className="relative z-10 shrink-0 cursor-default font-semibold text-slate-500 transition-opacity hover:text-slate-700"
              >
                +{hidden.length}
              </TooltipTrigger>
              <TooltipContent
                align="center"
                side="bottom"
                sideOffset={8}
                className="max-w-56 text-[11px] leading-relaxed"
              >
                <span className="flex flex-wrap gap-x-1">
                  {hidden.map((inst, i) => (
                    <span key={inst.sunet}>
                      {i > 0 && ', '}
                      <InstructorDisplay inst={inst} />
                    </span>
                  ))}
                </span>
              </TooltipContent>
            </Tooltip>
          )}
          <span className="shrink-0 text-slate-400">•</span>
        </>
      )}
      <span className="shrink-0 text-[11px] font-medium text-slate-600">{section.componentType}</span>
      {showSchedule && scheduleSummary.length > 0 && (
        <>
          <span className="shrink-0 text-slate-400">•</span>
          <span className="min-w-0 flex-1 shrink-[10] truncate text-slate-600">{scheduleSummary}</span>
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
        <EnrollmentInfo section={section} />
        {visibleEvalSlugs.map((slug) => {
          const entry =
            slug === 'hours_per_unit'
              ? getHoursPerUnitEntry(
                  evalValues,
                  (section.unitsMin as number | null) ?? courseUnitsMin,
                  (section.unitsMax as number | null) ?? courseUnitsMax,
                )
              : evalValues[slug as EvalSlug]
          if (entry == null) return null
          const { value, isCourseInformed, isInstructorInformed } = entry
          const meta = getEvalMetricMeta(slug)
          const Icon = meta.icon
          const color = getEvalValueColor(value, slug)
          const informedHint =
            !isCourseInformed && !isInstructorInformed
              ? ' (not course or instructor informed)'
              : !isCourseInformed
                ? ' (not course informed)'
                : !isInstructorInformed
                  ? ' (not instructor informed)'
                  : ''
          return (
            <Badge
              key={`${section.sectionId}-${slug}`}
              variant="outline"
              title={
                slug === 'hours_per_unit'
                  ? `Hours per unit (midpoint)${informedHint}`
                  : `${meta.questionText}${informedHint}`
              }
              className={`h-5 gap-0.5 px-1 ${meta.badgeClassName} ${
                !isCourseInformed ? 'border-dashed opacity-75' : ''
              }`}
            >
              <Icon className={`h-3 w-3 shrink-0 ${meta.iconClassName}`} />
              <span style={{ color, fontWeight: 600 }}>{meta.formatValue(value)}</span>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

function QuarterSlot({
  quarter,
  sections,
  accompanyingSections,
  visibleEvalSlugs,
  showSchedule,
  courseUnitsMin,
  courseUnitsMax,
}: {
  quarter: Quarter
  sections: MvSection[]
  accompanyingSections: MvSection[]
  visibleEvalSlugs: AllMetricSlug[]
  showSchedule: boolean
  courseUnitsMin: number
  courseUnitsMax: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [accompanyingExpanded, setAccompanyingExpanded] = useState(false)
  const active = sections.length > 0
  const colors = QUARTER_COLORS[quarter]
  const shouldCollapse = sections.length >= 3
  const visibleWhenCollapsed =
    sections.length >= MANY_SECTIONS_THRESHOLD ? VISIBLE_SECTIONS_WHEN_MANY : VISIBLE_SECTIONS_BEFORE_COLLAPSE
  const visibleSections = shouldCollapse && !expanded ? sections.slice(0, visibleWhenCollapsed) : sections
  const hiddenCount = Math.max(0, sections.length - visibleSections.length)

  return (
    <div
      className={`relative w-[360px] rounded-lg px-2 py-1.5 text-xs leading-snug transition-colors ${
        active ? `${colors.bg} ${colors.text}` : 'bg-slate-50 text-slate-300'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${active ? colors.dot : 'bg-slate-200'}`}
        />
        <span className="font-semibold">{quarter}</span>
      </div>
      {active && (
        <div className="divide-y divide-black/10">
          {visibleSections.map((section) => (
            <SectionRow
              key={section.sectionId}
              section={section}
              showSchedule={showSchedule}
              visibleEvalSlugs={visibleEvalSlugs}
              courseUnitsMin={courseUnitsMin}
              courseUnitsMax={courseUnitsMax}
            />
          ))}
          {shouldCollapse && (
            <button
              type="button"
              className="w-full py-1.5 text-left text-[11px] font-medium text-slate-600 transition-colors hover:text-slate-800"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setExpanded((prev) => !prev)
              }}
            >
              {expanded
                ? 'Show fewer sections'
                : `Show ${hiddenCount} more section${hiddenCount === 1 ? '' : 's'}`}
            </button>
          )}
          {accompanyingSections.length > 0 && (
            <>
              <button
                type="button"
                className="w-full py-1.5 text-left text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-700"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setAccompanyingExpanded((prev) => !prev)
                }}
              >
                {accompanyingExpanded
                  ? 'Hide accompanying sections'
                  : `+${accompanyingSections.length} accompanying section${accompanyingSections.length === 1 ? '' : 's'}`}
              </button>
              {accompanyingExpanded &&
                accompanyingSections.map((section) => (
                  <SectionRow
                    key={section.sectionId}
                    section={section}
                    showSchedule={showSchedule}
                    visibleEvalSlugs={visibleEvalSlugs}
                    courseUnitsMin={courseUnitsMin}
                    courseUnitsMax={courseUnitsMax}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function QuarterTower({
  sections,
  selectedQuarters: _selectedQuarters,
  visibleEvalSlugs,
  courseUnitsMin,
  courseUnitsMax,
}: {
  sections: SearchResultSections
  selectedQuarters: Quarter[]
  visibleEvalSlugs: AllMetricSlug[]
  courseUnitsMin: number
  courseUnitsMax: number
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {QUARTER_ORDER.map((quarter) => (
        <QuarterSlot
          key={quarter}
          quarter={quarter}
          sections={sections.filter(
            (section) => section.termQuarter === quarter && isPrincipalSection(section) && !section.cancelled,
          )}
          accompanyingSections={sections.filter(
            (section) =>
              section.termQuarter === quarter && !isPrincipalSection(section) && !section.cancelled,
          )}
          showSchedule={true}
          visibleEvalSlugs={visibleEvalSlugs}
          courseUnitsMin={courseUnitsMin}
          courseUnitsMax={courseUnitsMax}
        />
      ))}
    </div>
  )
}

export function CourseCard({
  course,
  selectedQuarters,
  visibleEvalSlugs,
  validSubjects,
  year,
}: {
  course: SearchCourseResult
  selectedQuarters: Quarter[]
  visibleEvalSlugs: AllMetricSlug[]
  validSubjects?: Set<string>
  year: string
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [descMaxHeight, setDescMaxHeight] = useState<number | null>(null)
  const [selectedOfferingId, setSelectedOfferingId] = useState(course.id)
  const [crosslistingsExpanded, setCrosslistingsExpanded] = useState(false)
  const rightRef = useRef<HTMLDivElement>(null)
  const leftHeaderRef = useRef<HTMLDivElement>(null)

  const allCodes = useMemo(() => {
    const raw =
      course.crosslistings && course.crosslistings.length >= 2
        ? course.crosslistings
        : [
            {
              offeringId: course.id,
              subjectCode: course.subject_code,
              codeNumber: course.code_number,
              codeSuffix: course.code_suffix,
            },
          ]
    if (raw.length < 2) return raw
    const offeringSubject = course.subject_code
    return [...raw].sort((a, b) => {
      const aIsOffering = a.offeringId === course.id ? 0 : 1
      const bIsOffering = b.offeringId === course.id ? 0 : 1
      if (aIsOffering !== bIsOffering) return aIsOffering - bIsOffering
      const aSameSubject = a.subjectCode === offeringSubject ? 0 : 1
      const bSameSubject = b.subjectCode === offeringSubject ? 0 : 1
      if (aSameSubject !== bSameSubject) return aSameSubject - bSameSubject
      const cmpSubject = a.subjectCode.localeCompare(b.subjectCode)
      if (cmpSubject !== 0) return cmpSubject
      const cmpNum = a.codeNumber - b.codeNumber
      if (cmpNum !== 0) return cmpNum
      return (a.codeSuffix ?? '').localeCompare(b.codeSuffix ?? '')
    })
  }, [course.crosslistings, course.id, course.subject_code, course.code_number, course.code_suffix])
  const showToggles = allCodes.length >= 2

  const queryClient = useQueryClient()
  const selectedCode = allCodes.find((c) => c.offeringId === selectedOfferingId) ?? allCodes[0]!
  const selectedCodeSlug = toCourseCodeSlug(selectedCode)
  const prefetchCrosslisting = useCallback(
    (c: (typeof allCodes)[0]) => {
      if (c.offeringId !== course.id) {
        void queryClient.prefetchQuery(courseByCodeQueryOptions(year, toCourseCodeSlug(c)))
      }
    },
    [course.id, queryClient, year],
  )
  const { data: fetchedCourse, isFetching: isFetchingOther } = useQuery({
    ...courseByCodeQueryOptions(year, selectedCodeSlug),
    enabled: selectedOfferingId !== course.id,
    placeholderData: keepPreviousData,
  })
  const activeCourse = selectedOfferingId === course.id ? course : (fetchedCourse ?? course)

  useLayoutEffect(() => {
    if (descriptionExpanded) return
    const right = rightRef.current
    const leftHeader = leftHeaderRef.current
    if (!right || !leftHeader) return

    const measure = () => {
      const rightH = right.offsetHeight
      const headerH = leftHeader.offsetHeight
      // The left column uses flex-col gap-1 (4px). The description gets one
      // gap between itself and the header block, so subtract that too.
      const gap = 4
      const available = rightH - headerH - gap
      setDescMaxHeight(available)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(right)
    ro.observe(leftHeader)
    return () => ro.disconnect()
  }, [descriptionExpanded])

  const visibleCodes =
    showToggles && allCodes.length > 2 && !crosslistingsExpanded
      ? (() => {
          const first = allCodes.slice(0, 2)
          const selected = allCodes.find((c) => c.offeringId === selectedOfferingId)
          if (selected && !first.some((c) => c.offeringId === selected.offeringId)) {
            return [...first, selected]
          }
          return first
        })()
      : allCodes
  const hiddenCount =
    showToggles && allCodes.length > 2 && !crosslistingsExpanded ? allCodes.length - visibleCodes.length : 0

  return (
    <div
      className={`mb-3 block rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition-opacity select-text ${
        isFetchingOther && selectedOfferingId !== course.id ? 'opacity-60' : 'opacity-100'
      }`}
    >
      <article className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div ref={leftHeaderRef} className="flex flex-col gap-1">
            <h2 className="text-base leading-snug font-medium text-slate-800">
              {showToggles ? (
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  {visibleCodes.map((c) => (
                    <button
                      key={c.offeringId}
                      type="button"
                      onMouseEnter={() => prefetchCrosslisting(c)}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setSelectedOfferingId(c.offeringId)
                      }}
                      className={`font-semibold transition-colors hover:text-primary ${
                        selectedOfferingId === c.offeringId
                          ? 'font-bold text-slate-900'
                          : 'font-normal text-slate-400'
                      }`}
                    >
                      {formatCourseCodeFromParts(c)}
                    </button>
                  ))}
                  {hiddenCount > 0 && !crosslistingsExpanded && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setCrosslistingsExpanded(true)
                      }}
                      className="-ml-0.5 font-normal text-slate-400 transition-colors hover:text-slate-600"
                    >
                      …
                    </button>
                  )}
                  {crosslistingsExpanded && allCodes.length > 2 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setCrosslistingsExpanded(false)
                      }}
                      className="text-[11px] font-normal text-slate-400 transition-colors hover:text-slate-600"
                    >
                      less
                    </button>
                  )}
                </span>
              ) : (
                <span className="font-semibold text-slate-900">
                  {formatCourseCodeFromParts(allCodes[0]!)}
                </span>
              )}{' '}
              <span className="font-normal text-slate-700">{course.title_clean ?? course.title}</span>
              {'new_this_year' in activeCourse && activeCourse.new_this_year && (
                <>
                  {' '}
                  <Badge
                    variant="secondary"
                    className="border-emerald-200 bg-emerald-50/80 px-1.5 align-middle text-[10px] leading-none font-medium text-emerald-700"
                  >
                    New this year
                  </Badge>
                </>
              )}{' '}
              <Link
                to="/course/$courseId"
                params={{ courseId: selectedCodeSlug }}
                className="inline-flex shrink-0 align-middle text-slate-400 transition-colors hover:text-primary"
                aria-label={`View ${formatCourseCodeFromParts(selectedCode)}`}
              >
                <ExternalLink className="mb-0.5 size-4 align-middle" />
              </Link>
            </h2>

            <p className="flex flex-wrap text-sm text-slate-400">
              {[
                activeCourse.units_min === activeCourse.units_max
                  ? `${activeCourse.units_min} units`
                  : `${activeCourse.units_min} - ${activeCourse.units_max} units`,
                activeCourse.gers.length > 0 ? `GERs: ${activeCourse.gers.join(', ')}` : null,
                activeCourse.academic_career ? `Career: ${activeCourse.academic_career}` : null,
                activeCourse.grading_option || null,
                activeCourse.final_exam_flag
                  ? `Final: ${FINAL_EXAM_LABELS[activeCourse.final_exam_flag] ?? activeCourse.final_exam_flag}`
                  : null,
              ]
                .filter(Boolean)
                .map((item, i, arr) => (
                  <span key={i} className="whitespace-nowrap">
                    {item}
                    {i < arr.length - 1 && (
                      <span className="mx-1.5 inline-block h-[3px] w-[3px] rounded-full bg-slate-300 align-middle" />
                    )}
                  </span>
                ))}
            </p>
          </div>

          {course.description && (
            <DescriptionClamp
              text={course.description}
              expanded={descriptionExpanded}
              onToggle={() => setDescriptionExpanded((prev) => !prev)}
              maxHeight={descMaxHeight}
              renderText={(t) => renderDescriptionWithLinks(t, validSubjects, year)}
            />
          )}
        </div>

        <div ref={rightRef}>
          <QuarterTower
            sections={activeCourse.sections}
            selectedQuarters={selectedQuarters}
            visibleEvalSlugs={visibleEvalSlugs}
            courseUnitsMin={activeCourse.units_min}
            courseUnitsMax={activeCourse.units_max}
          />
        </div>
      </article>
    </div>
  )
}
