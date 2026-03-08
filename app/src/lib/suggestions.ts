import type { SearchParams, Quarter } from '@/data/search/search.params'
import { getCurrentQuarter } from '@/lib/quarter-utils'

export type Suggestion = {
  label: string
  searchParams: SearchParams
}

// ── Static data pools ─────────────────────────────────────────────────────────

const MAJORS = [
  'MATH',
  'CS',
  'ENGLISH',
  'HISTORY',
  'ECON',
  'PHYSICS',
  'CHEM',
  'BIO',
  'PSYCH',
  'POLISCI',
  'PHIL',
  'STATS',
  'DATASCI',
  'LINGUIST',
  'SYMSYS',
  'HUMBIO',
  'TAPS',
  'FRENLANG',
  'SPANLANG',
  'MS&E',
]

const WAYS_GERS = ['WAY-AQR', 'WAY-CE', 'WAY-EDP', 'WAY-ER', 'WAY-FR', 'WAY-SI', 'WAY-SMA']

const WAYS_LABELS: Record<string, string> = {
  'WAY-AQR': 'AQR',
  'WAY-CE': 'CE',
  'WAY-EDP': 'EDP',
  'WAY-ER': 'ER',
  'WAY-FR': 'FR',
  'WAY-SI': 'SI',
  'WAY-SMA': 'SMA',
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
type Weekday = (typeof WEEKDAYS)[number]

type TimeSlot = {
  label: string
  startTimeMin: string
  endTimeMax: string
}

const TIME_SLOTS: TimeSlot[] = [
  { label: 'morning', startTimeMin: '08:00:00', endTimeMax: '12:00:00' },
  { label: 'afternoon', startTimeMin: '12:00:00', endTimeMax: '17:00:00' },
  { label: 'evening', startTimeMin: '17:00:00', endTimeMax: '21:00:00' },
]

const CURRENT_QUARTER: Quarter = getCurrentQuarter()

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function baseParams(): Partial<SearchParams> {
  return {
    query: '',
    quarters: [CURRENT_QUARTER],
    page: 1,
    subjects: [],
    subjectsExclude: [],
    gers: [],
    gersExclude: [],
    finalExamFlags: [],
    finalExamFlagsExclude: [],
    componentTypesExclude: ['RES'],
  }
}

function maybeAddTimeConstraint(label: string): { label: string; extra: Partial<SearchParams> } {
  if (Math.random() >= 0.15) return { label, extra: {} }
  const day = pick(WEEKDAYS)
  const slot = pick(TIME_SLOTS)
  return {
    label: `${label} on ${day} ${slot.label}`,
    extra: {
      days: [day] as Weekday[],
      startTimeMin: slot.startTimeMin,
      endTimeMax: slot.endTimeMax,
    },
  }
}

// ── Template generators ───────────────────────────────────────────────────────

function makeLowTimeCommitment(): Suggestion {
  const useMajor = Math.random() < 0.5
  let filterLabel: string
  let filterParams: Partial<SearchParams>

  if (useMajor) {
    const major = pick(MAJORS)
    filterLabel = major
    filterParams = { subjects: [major] }
  } else {
    const ger = pick(WAYS_GERS)
    filterLabel = `WAY-${WAYS_LABELS[ger]}`
    filterParams = { gers: [ger] }
  }

  const { label, extra } = maybeAddTimeConstraint(`Low time commitment ${filterLabel} classes`)

  return {
    label,
    searchParams: {
      ...(baseParams() as SearchParams),
      ...filterParams,
      ...extra,
      unitsMin: 3,
      sort: 'hours',
      order: 'asc',
    } as SearchParams,
  }
}

function makeTopRated(): Suggestion {
  const useMajor = Math.random() < 0.5
  let filterLabel: string
  let filterParams: Partial<SearchParams>

  if (useMajor) {
    const major = pick(MAJORS)
    filterLabel = major
    filterParams = { subjects: [major] }
  } else {
    const ger = pick(WAYS_GERS)
    filterLabel = `WAY-${WAYS_LABELS[ger]}`
    filterParams = { gers: [ger] }
  }

  const { label, extra } = maybeAddTimeConstraint(`Top rated ${filterLabel} courses`)

  return {
    label,
    searchParams: {
      ...(baseParams() as SearchParams),
      ...filterParams,
      ...extra,
      unitsMin: 3,
      sort: 'quality',
      order: 'desc',
    } as SearchParams,
  }
}

function makeNoFinal(): Suggestion {
  const major = pick(MAJORS)

  const { label, extra } = maybeAddTimeConstraint(`No-final ${major} classes`)

  return {
    label,
    searchParams: {
      ...(baseParams() as SearchParams),
      subjects: [major],
      finalExamFlags: ['N'],
      unitsMin: 3,
      ...extra,
      sort: 'quality',
      order: 'desc',
    } as SearchParams,
  }
}

function makeLowUnit(): Suggestion {
  const day = pick(WEEKDAYS)
  const slot = pick(TIME_SLOTS)

  return {
    label: `1 and 2 unit courses on ${day} ${slot.label}`,
    searchParams: {
      ...(baseParams() as SearchParams),
      unitsMax: 2,
      days: [day] as Weekday[],
      startTimeMin: slot.startTimeMin,
      endTimeMax: slot.endTimeMax,
      sort: 'hours',
      order: 'asc',
    } as SearchParams,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const MAIN_GENERATORS = [makeLowTimeCommitment, makeTopRated, makeNoFinal] as const

/** Generates one candidate suggestion (synchronous, not validated). */
export function generateCandidate(): Suggestion {
  if (Math.random() < 0.05) return makeLowUnit()
  return pick(MAIN_GENERATORS)()
}

/**
 * Generates `n` suggestions using the template system.
 * Each slot has a 5% chance of being replaced by the low-unit wildcard template.
 * Note: does not validate results — use `generateValidSuggestions` for validated batches.
 */
export function generateSuggestions(n: number): Suggestion[] {
  return Array.from({ length: n }, generateCandidate)
}
