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

const LOW_TIME_PHRASINGS = [
  (f: string) => `Low time commitment ${f} classes`,
  (f: string) => `Easy ${f} classes`,
  (f: string) => `Light workload ${f} courses`,
  (f: string) => `Chill ${f} classes`,
] as const

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

  const phrase = pick(LOW_TIME_PHRASINGS)(filterLabel)
  const { label, extra } = maybeAddTimeConstraint(phrase)

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

const TOP_RATED_PHRASINGS = [
  (f: string) => `Top rated ${f} courses`,
  (f: string) => `Best ${f} courses`,
] as const

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

  const phrase = pick(TOP_RATED_PHRASINGS)(filterLabel)
  const { label, extra } = maybeAddTimeConstraint(phrase)

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

const NO_FINAL_PHRASINGS = [
  (f: string) => `No-final ${f} classes`,
  (f: string) => `No exam ${f} courses`,
  (f: string) => `${f} classes with no final exam`,
] as const

function makeNoFinal(): Suggestion {
  const major = pick(MAJORS)

  const phrase = pick(NO_FINAL_PHRASINGS)(major)
  const { label, extra } = maybeAddTimeConstraint(phrase)

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

const LOW_UNIT_PHRASINGS = [
  (day: string, time: string) => `1 and 2 unit courses on ${day} ${time}`,
  (day: string, time: string) => `Filler courses on ${day} ${time}`,
] as const

function makeLowUnit(): Suggestion {
  const day = pick(WEEKDAYS)
  const slot = pick(TIME_SLOTS)
  const label = pick(LOW_UNIT_PHRASINGS)(day, slot.label)

  return {
    label,
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

/**
 * Pre-validated suggestions that are known to return results.
 * Used for the first option(s) on the homepage so no network call is needed before display.
 */
const PREVALIDATED_SUGGESTIONS: Suggestion[] = [
  {
    label: 'Top rated CS courses',
    searchParams: {
      ...(baseParams() as SearchParams),
      subjects: ['CS'],
      unitsMin: 3,
      sort: 'quality',
      order: 'desc',
    } as SearchParams,
  },
  {
    label: 'Low time commitment MATH classes',
    searchParams: {
      ...(baseParams() as SearchParams),
      subjects: ['MATH'],
      unitsMin: 3,
      sort: 'hours',
      order: 'asc',
    } as SearchParams,
  },
  {
    label: 'Top rated ECON courses',
    searchParams: {
      ...(baseParams() as SearchParams),
      subjects: ['ECON'],
      unitsMin: 3,
      sort: 'quality',
      order: 'desc',
    } as SearchParams,
  },
  {
    label: 'No-final CS classes',
    searchParams: {
      ...(baseParams() as SearchParams),
      subjects: ['CS'],
      finalExamFlags: ['N'],
      unitsMin: 3,
      sort: 'quality',
      order: 'desc',
    } as SearchParams,
  },
  {
    label: 'Top rated WAY-EDP courses',
    searchParams: {
      ...(baseParams() as SearchParams),
      gers: ['WAY-EDP'],
      unitsMin: 3,
      sort: 'quality',
      order: 'desc',
    } as SearchParams,
  },
]

/** Returns a copy of the pre-validated suggestions list for immediate use (e.g. first option + queue). */
export function getPrevalidatedSuggestions(): Suggestion[] {
  return [...PREVALIDATED_SUGGESTIONS]
}

/** Generates one candidate suggestion (synchronous, not validated). */
export function generateCandidate(): Suggestion {
  if (Math.random() < 0.1) return makeLowUnit()
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
