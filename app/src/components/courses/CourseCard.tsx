import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { getEvalMetricMeta, getEvalSlugFromQuestionText, getEvalValueColor } from '@/data/search/eval-metrics'

import type { Quarter, SearchCourseResult, SearchResultSections } from '@/data/search/search.types'
import type { EvalSlug } from '@/data/search/eval-questions'
import type { MvSection } from '@courses/db/db-bun'

const QUARTER_ORDER: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

const QUARTER_COLORS: Record<Quarter, { bg: string; text: string; dot: string }> = {
  Autumn: { bg: 'bg-orange-50/80', text: 'text-orange-800', dot: 'bg-orange-500' },
  Winter: { bg: 'bg-sky-50/80', text: 'text-sky-800', dot: 'bg-sky-500' },
  Spring: { bg: 'bg-emerald-50/80', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  Summer: { bg: 'bg-yellow-50/80', text: 'text-yellow-800', dot: 'bg-yellow-500' },
}

const MAX_INSTRUCTORS_SHOWN = 2
const VISIBLE_SECTIONS_BEFORE_COLLAPSE = 2
const MANY_SECTIONS_THRESHOLD = 10
const VISIBLE_SECTIONS_WHEN_MANY = 1
const DESCRIPTION_TRUNCATE_LENGTH = 440

const DAY_CODE: Record<string, string> = {
  Monday: 'M',
  Tuesday: 'Tu',
  Wednesday: 'W',
  Thursday: 'Th',
  Friday: 'F',
  Saturday: 'Sa',
  Sunday: 'Su',
}

function getInstructorsForSection(section: MvSection): string[] {
  const seen = new Set<string>()
  const names: string[] = []

  for (const schedule of section.schedules) {
    for (const instructor of schedule.instructors) {
      const role = instructor.role?.toLowerCase() ?? ''
      if (role.includes('ta') || role.includes('teaching assistant')) continue
      if (!seen.has(instructor.name)) {
        seen.add(instructor.name)
        names.push(instructor.name)
      }
    }
  }

  return names
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

function SectionRow({
  section,
  showSchedule,
  visibleEvalSlugs,
}: {
  section: MvSection
  showSchedule: boolean
  visibleEvalSlugs: EvalSlug[]
}) {
  const instructors = getInstructorsForSection(section)
  const overflow = instructors.length > MAX_INSTRUCTORS_SHOWN
  const shown = overflow ? instructors.slice(0, MAX_INSTRUCTORS_SHOWN) : instructors
  const hidden = overflow ? instructors.slice(MAX_INSTRUCTORS_SHOWN) : []
  const schedules = showSchedule ? formatScheduleEntry(section) : []
  const evalValues = getSectionEvalValues(section)
  const scheduleSummary = schedules.join(' | ')

  return (
    <div className="flex min-w-0 items-center gap-1 py-1 text-[12px] leading-tight">
      {shown.length > 0 && (
        <>
          <span className="min-w-0 truncate font-semibold text-slate-900">{shown.join(', ')}</span>
          {overflow && (
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className="shrink-0 cursor-default font-semibold text-slate-500 transition-opacity hover:text-slate-700"
              >
                +{hidden.length}
              </TooltipTrigger>
              <TooltipContent align="end" sideOffset={8} className="max-w-56 text-[11px] leading-relaxed">
                {hidden.join(', ')}
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
      {/* <span className="shrink-0 text-slate-400">•</span>
      <span className="shrink-0 text-slate-600">
        {section.componentType} {section.sectionNumber}
      </span> */}
      {showSchedule && scheduleSummary.length > 0 && (
        <>
          {shown.length > 0 && <span className="shrink-0 text-slate-400">•</span>}
          <span className="min-w-0 truncate text-slate-600">{scheduleSummary}</span>
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
        {visibleEvalSlugs.map((slug) => {
          const entry = evalValues[slug]
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
              title={`${meta.questionText}${informedHint}`}
              className={`h-5 gap-1 px-1.5 ${meta.badgeClassName} ${
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
  visibleEvalSlugs,
  showSchedule,
}: {
  quarter: Quarter
  sections: MvSection[]
  visibleEvalSlugs: EvalSlug[]
  showSchedule: boolean
}) {
  const [expanded, setExpanded] = useState(false)
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
        </div>
      )}
    </div>
  )
}

function QuarterTower({
  sections,
  selectedQuarters: _selectedQuarters,
  visibleEvalSlugs,
}: {
  sections: SearchResultSections
  selectedQuarters: Quarter[]
  visibleEvalSlugs: EvalSlug[]
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {QUARTER_ORDER.map((quarter) => (
        <QuarterSlot
          key={quarter}
          quarter={quarter}
          sections={sections.filter(
            (section) => section.termQuarter === quarter && isPrincipalSection(section),
          )}
          showSchedule={true} // selectedQuarters.includes(quarter)
          visibleEvalSlugs={visibleEvalSlugs}
        />
      ))}
    </div>
  )
}

export function CourseCard({
  course,
  selectedQuarters,
  visibleEvalSlugs,
}: {
  course: SearchCourseResult
  selectedQuarters: Quarter[]
  visibleEvalSlugs: EvalSlug[]
}) {
  const [showMore, setShowMore] = useState(false)
  const displayCode = `${course.subject_code} ${course.code_number}${course.code_suffix ?? ''}`
  const isLong = course.description.length > DESCRIPTION_TRUNCATE_LENGTH
  const truncated = isLong && !showMore

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowMore((prev) => !prev)
  }

  return (
    <Link
      to="/course/$courseId"
      params={{ courseId: String(course.id) }}
      className="mb-3 block rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <article className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base leading-snug font-medium text-slate-800">
            <span className="font-semibold text-slate-900">{displayCode}</span>
            <span className="mx-1.5 font-normal text-slate-300">·</span>
            <span className="font-normal text-slate-700">{course.title}</span>
          </h2>

          <p className="text-sm text-slate-400">
            {course.units_min === course.units_max
              ? `${course.units_min} units`
              : `${course.units_min} - ${course.units_max} units`}
            {course.gers.length > 0 && ` | GERs: ${course.gers.join(', ')}`}
          </p>

          {course.description && (
            <p className="text-[15px] leading-relaxed text-slate-500">
              {truncated
                ? course.description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()
                : course.description}
              {truncated && (
                <>
                  {'… '}
                  <button
                    onClick={handleToggle}
                    className="font-medium text-slate-400 transition-colors hover:text-primary"
                  >
                    show more
                  </button>
                </>
              )}
              {!truncated && isLong && (
                <>
                  {' '}
                  <button
                    onClick={handleToggle}
                    className="font-medium text-slate-400 transition-colors hover:text-primary"
                  >
                    show less
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <QuarterTower
          sections={course.sections}
          selectedQuarters={selectedQuarters}
          visibleEvalSlugs={visibleEvalSlugs}
        />
      </article>
    </Link>
  )
}
