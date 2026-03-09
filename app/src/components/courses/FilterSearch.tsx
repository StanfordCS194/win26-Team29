import { useMemo, useState } from 'react'
import { Combobox as BaseCombobox } from '@base-ui/react'
import { Search } from 'lucide-react'

import { Combobox, ComboboxContent, ComboboxList } from '@/components/ui/combobox'

const ALL_FILTER_SECTIONS: { id: string; label: string; keywords: string[] }[] = [
  {
    id: 'filter-quarters',
    label: 'Quarters',
    keywords: ['quarters', 'quarter', 'num quarters', '# quarters'],
  },
  {
    id: 'filter-gers',
    label: 'GERs',
    keywords: ['gers', 'ger', 'requirements', 'general education', 'num gers', '# gers'],
  },
  { id: 'filter-units', label: 'Units', keywords: ['units', 'unit', 'credit', 'credits'] },
  {
    id: 'filter-subjects',
    label: 'Subjects',
    keywords: ['subjects', 'subject', 'department', 'dept', 'num subjects', '# subjects'],
  },
  { id: 'filter-days', label: 'Days', keywords: ['days', 'day', 'meeting days', 'schedule days'] },
  {
    id: 'filter-schedule',
    label: 'Schedule',
    keywords: ['schedule', 'start time', 'time', 'duration', 'length', 'class duration'],
  },
  {
    id: 'filter-enrollment',
    label: 'Enrollment',
    keywords: ['enrollment', 'enrolled', 'class size', 'capacity', 'waitlist', 'status'],
  },
  {
    id: 'filter-evals',
    label: 'Evaluations',
    keywords: ['evals', 'evaluations', 'quality', 'learning', 'organized', 'hours', 'rating', 'attendance'],
  },
  {
    id: 'filter-instructors',
    label: 'Instructors',
    keywords: ['instructors', 'instructor', 'professor', 'teacher', 'faculty'],
  },
  {
    id: 'filter-codeNumber',
    label: 'Course number',
    keywords: ['course number', 'code', 'number', 'course #'],
  },
  {
    id: 'filter-careers',
    label: 'Career',
    keywords: ['career', 'careers', 'undergraduate', 'graduate', 'grad', 'undergrad'],
  },
  {
    id: 'filter-components',
    label: 'Components',
    keywords: ['components', 'component', 'lecture', 'lab', 'seminar', 'discussion'],
  },
  {
    id: 'filter-gradingOptions',
    label: 'Grading',
    keywords: ['grading', 'grade', 'letter', 'pass/fail', 'satisfactory', 'credit no credit'],
  },
  { id: 'filter-finalExam', label: 'Final exam', keywords: ['final', 'final exam', 'exam'] },
  { id: 'filter-repeatable', label: 'Repeatable', keywords: ['repeatable', 'repeat'] },
  {
    id: 'filter-newThisYear',
    label: 'Offering history',
    keywords: ['new this year', 'new', 'first time', 'recently offered', 'offering history'],
  },
]

function scrollToSection(id: string) {
  const target = document.getElementById(id)
  const container = target?.closest('[data-filter-scroll]') as HTMLElement | null
  if (!target || !container) return
  const targetTop = target.getBoundingClientRect().top
  const containerTop = container.getBoundingClientRect().top
  container.scrollBy({ top: targetTop - containerTop, behavior: 'smooth' })
}

export function FilterSearch() {
  const [query, setQuery] = useState('')

  const matchedSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_FILTER_SECTIONS
    const prefixMatches = ALL_FILTER_SECTIONS.filter(
      (s) => s.keywords.some((k) => k.startsWith(q)) || s.label.toLowerCase().startsWith(q),
    )
    const substringMatches = ALL_FILTER_SECTIONS.filter(
      (s) =>
        !prefixMatches.includes(s) &&
        (s.keywords.some((k) => k.includes(q)) || s.label.toLowerCase().includes(q)),
    )
    return [...prefixMatches, ...substringMatches]
  }, [query])

  return (
    <Combobox
      autoHighlight
      inputValue={query}
      onInputValueChange={(newValue) => {
        // base-ui fills the input with the item's value on selection — ignore those
        if (!ALL_FILTER_SECTIONS.some((s) => s.id === newValue)) {
          setQuery(newValue)
        }
      }}
      onValueChange={(value) => {
        if (value != null) {
          scrollToSection(value as string)
          setQuery('')
        }
      }}
      filter={() => true}
    >
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2 z-10 h-3 w-3 text-slate-400" />
        <BaseCombobox.Input
          placeholder="Go to filter…"
          className="w-full rounded-full border border-slate-200 bg-white py-0.5 pr-2.5 pl-6 text-xs text-slate-600 placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 focus:outline-none"
        />
      </label>
      <ComboboxContent sideOffset={3} className="min-w-0">
        <ComboboxList className="max-h-40">
          {matchedSections.map((section) => (
            <BaseCombobox.Item
              key={section.id}
              value={section.id}
              className="cursor-default rounded-md px-2.5 py-1 text-xs text-slate-700 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
            >
              {section.label}
            </BaseCombobox.Item>
          ))}
          {query.trim() !== '' && matchedSections.length === 0 && (
            <div className="py-2 text-center text-xs text-muted-foreground">No filters found</div>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
