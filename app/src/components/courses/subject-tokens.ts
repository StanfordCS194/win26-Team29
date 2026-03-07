// ── School display constants (moved from SubjectFilter.tsx) ───────────────────

export const SCHOOL_SHORT: Record<string, string> = {
  'Department of Athletics, Physical Education and Recreation': 'Athletics',
  'Doerr School of Sustainability': 'Sustainability',
  'Graduate School of Business': 'Business',
  'School of Education': 'Education',
  'School of Engineering': 'Engineering',
  'School of Humanities & Sciences': 'H&S',
  'Law School': 'Law',
  'School of Medicine': 'Medicine',
  'Office of Vice Provost for Undergraduate Education': 'VPUE',
  'Office of Vice Provost for Teaching and Learning': 'Teaching & Learning',
}

/** Reverse map: short name → full school name. */
export const SCHOOL_SHORT_TO_FULL: Record<string, string> = Object.fromEntries(
  Object.entries(SCHOOL_SHORT).map(([full, short]) => [short, full]),
)

export const HS_KEY = 'School of Humanities & Sciences'
export const HS_SHORT = 'H&S'
export const VPUE_KEY = 'Office of Vice Provost for Undergraduate Education'
export const VPUE_SHORT = 'VPUE'

// ── H&S subcategory definitions (moved from SubjectFilter.tsx) ────────────────

/**
 * Maps subcategory display name → canonical list of codes that may appear in it.
 * Actual membership is confirmed against what the DB returns for that year.
 */
export const MANUAL_HS_CATEGORIES: Record<string, string[]> = {
  'Analytical Sciences': ['DATASCI', 'ECON', 'MATH', 'MCS', 'STATS', 'SYMSYS'],
  'Natural Sciences': ['APPPHYS', 'BIO', 'BIOHOPK', 'BIOPHYS', 'CHEM', 'HUMBIO', 'PHYSICS', 'PSYCH'],
  'Social Sciences': [
    'AFRICAAM',
    'AFRICAST',
    'AMSTUD',
    'ANTHRO',
    'ASNAMST',
    'CHILATST',
    'COMM',
    'CSRE',
    'EASTASN',
    'ECON',
    'FEMGEN',
    'GLOBAL',
    'HISTORY',
    'HUMRTS',
    'INTLPOL',
    'INTNLREL',
    'IIS',
    'SIW',
    'LATINAM',
    'LINGUIST',
    'NATIVEAM',
    'POLISCI',
    'PUBLPOL',
    'PSYCH',
    'SOC',
    'STS',
    'URBANST',
    'SYMSYS',
    'REES',
  ],
  Humanities: [
    'ARCHLGY',
    'ARTHIST',
    'CHINA',
    'CLASSICS',
    'COMPLIT',
    'DLCL',
    'EALC',
    'ENGLISH',
    'ETHICSOC',
    'FILMEDIA',
    'FRENCH',
    'GERMAN',
    'HISTORY',
    'HPS',
    'HUMCORE',
    'HUMSCI',
    'ITALIAN',
    'JAPAN',
    'JEWISHST',
    'KOREA',
    'MLA',
    'MEDVLST',
    'MTL',
    'PHIL',
    'RELIGST',
    'SLAVIC',
    'ILAC',
  ],
  Arts: ['ARTSTUDI', 'ARTSINST', 'DANCE', 'FILMPROD', 'MUSIC', 'TAPS'],
}

// ── Subcategory slug ↔ display name mapping ───────────────────────────────────

/**
 * Maps URL slug (used in tokens) to the full subcategory display name.
 * Slugs are the first word of the category name, or the name itself if one word.
 */
export const HS_SUBCAT_SLUG_TO_NAME: Record<string, string> = {
  Analytical: 'Analytical Sciences',
  Natural: 'Natural Sciences',
  Social: 'Social Sciences',
  Humanities: 'Humanities',
  Arts: 'Arts',
  Languages: 'Languages',
}

export const HS_SUBCAT_NAME_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(HS_SUBCAT_SLUG_TO_NAME).map(([slug, name]) => [name, slug]),
)

// ── Subject type ──────────────────────────────────────────────────────────────

export type SubjectEntry = { code: string; school: string | null }

// ── Dynamic subcategory code helpers ─────────────────────────────────────────

/** Returns codes that belong to a named H&S subcategory given the live subject list. */
function getHsSubcatCodes(subcatName: string, hsCodes: string[]): string[] {
  if (subcatName === 'Languages') {
    return hsCodes.filter((c) => c.endsWith('LANG') || c.endsWith('LNG'))
  }
  const langSet = new Set(hsCodes.filter((c) => c.endsWith('LANG') || c.endsWith('LNG')))
  const catSet = new Set(MANUAL_HS_CATEGORIES[subcatName] ?? [])
  return hsCodes.filter((c) => !langSet.has(c) && catSet.has(c))
}

/** Returns codes that belong to a named VPUE subcategory given the live subject list. */
function getVpueSubcatCodes(subcatName: string, vpueCodes: string[]): string[] {
  if (subcatName === 'BOSP') {
    return vpueCodes.filter((c) => c.startsWith('OSP'))
  }
  return []
}

// ── Token format ──────────────────────────────────────────────────────────────
// Tokens start with `-` (subject codes are uppercase alphanumeric, never start with `-`).
// School token:       `-school-{shortName}`           e.g. `-school-Engineering`
// Subcategory token:  `-school-{shortName}-{slug}`    e.g. `-school-H&S-Analytical`

const TOKEN_PREFIX = '-school-'

function isToken(s: string): boolean {
  return s.startsWith(TOKEN_PREFIX)
}

/** Parse a token into `{ school: shortName, subcat?: slug }`. Returns null if not a token. */
function parseToken(token: string): { school: string; subcat?: string } | null {
  if (!isToken(token)) return null
  const rest = token.slice(TOKEN_PREFIX.length) // e.g. "Engineering" or "H&S-Analytical"
  const dashIdx = rest.indexOf('-')
  if (dashIdx === -1) return { school: rest }
  return { school: rest.slice(0, dashIdx), subcat: rest.slice(dashIdx + 1) }
}

function makeSchoolToken(short: string): string {
  return `${TOKEN_PREFIX}${short}`
}

function makeSubcatToken(short: string, slug: string): string {
  return `${TOKEN_PREFIX}${short}-${slug}`
}

// ── Expansion ─────────────────────────────────────────────────────────────────

/**
 * Expand subject tokens back to individual subject codes.
 * - `-school-{short}` → all codes for that school
 * - `-school-{short}-{slug}` → all codes in that subcategory
 * - anything else passes through unchanged
 * Duplicate codes produced by expansion are deduplicated.
 */
export function expandSubjectTokens(tokens: string[], subjects: SubjectEntry[]): string[] {
  if (tokens.length === 0) return tokens

  // Build school-keyed code lists (keyed by full school name)
  const schoolToCodesMap = new Map<string, string[]>()
  for (const { code, school } of subjects) {
    const key = school ?? 'Other'
    const existing = schoolToCodesMap.get(key)
    if (existing) existing.push(code)
    else schoolToCodesMap.set(key, [code])
  }

  const result: string[] = []
  const seen = new Set<string>()

  const push = (code: string) => {
    if (!seen.has(code)) {
      seen.add(code)
      result.push(code)
    }
  }

  for (const token of tokens) {
    const parsed = parseToken(token)
    if (parsed == null) {
      push(token)
      continue
    }

    const fullName = SCHOOL_SHORT_TO_FULL[parsed.school]
    const schoolCodes = (fullName != null ? schoolToCodesMap.get(fullName) : undefined) ?? []

    if (parsed.subcat == null) {
      // School-level token: expand to all codes in the school
      for (const c of schoolCodes) push(c)
    } else {
      // Subcategory token
      const short = parsed.school
      const slug = parsed.subcat

      let subcatCodes: string[]
      if (short === HS_SHORT) {
        const subcatName = HS_SUBCAT_SLUG_TO_NAME[slug]
        subcatCodes = subcatName != null ? getHsSubcatCodes(subcatName, schoolCodes) : []
      } else if (short === VPUE_SHORT) {
        subcatCodes = getVpueSubcatCodes(slug, schoolCodes)
      } else {
        subcatCodes = []
      }

      for (const c of subcatCodes) push(c)
    }
  }

  return result
}

// ── Label ─────────────────────────────────────────────────────────────────────

/**
 * Convert subject tokens to human-readable labels; individual codes pass through.
 * e.g. `-school-Engineering` → `Engineering`
 *      `-school-H&S-Analytical` → `Analytical Sciences`
 *      `CS` → `CS`
 */
export function labelSubjectTokens(tokens: string[]): string[] {
  return tokens.map((t) => {
    const parsed = parseToken(t)
    if (parsed == null) return t
    if (parsed.subcat == null) return parsed.school
    return HS_SUBCAT_SLUG_TO_NAME[parsed.subcat] ?? parsed.subcat
  })
}

// ── Compression ───────────────────────────────────────────────────────────────

/**
 * Replace fully-selected groups with tokens (two levels):
 * 1. If all codes of a school are selected → emit `-school-{short}` for the whole school.
 * 2. Otherwise, if all codes of a subcategory are selected → emit the subcategory token.
 * Remaining individual codes pass through unchanged.
 */
export function compressSubjectCodes(selected: string[], subjects: SubjectEntry[]): string[] {
  if (selected.length === 0) return selected

  const selectedSet = new Set(selected)
  const consumed = new Set<string>()
  const result: string[] = []

  // Build school-keyed code lists (full name → codes)
  const schoolToCodesMap = new Map<string, string[]>()
  for (const { code, school } of subjects) {
    const key = school ?? 'Other'
    const existing = schoolToCodesMap.get(key)
    if (existing) existing.push(code)
    else schoolToCodesMap.set(key, [code])
  }

  for (const [fullName, schoolCodes] of schoolToCodesMap) {
    if (schoolCodes.length === 0) continue
    const short = SCHOOL_SHORT[fullName] ?? fullName

    // Check if ALL codes for this school are selected
    const allSchoolSelected = schoolCodes.every((c) => selectedSet.has(c))
    if (allSchoolSelected) {
      result.push(makeSchoolToken(short))
      for (const c of schoolCodes) consumed.add(c)
      continue
    }

    // Try subcategory-level compression for H&S and VPUE
    if (short === HS_SHORT) {
      for (const [slug, subcatName] of Object.entries(HS_SUBCAT_SLUG_TO_NAME)) {
        const subcatCodes = getHsSubcatCodes(subcatName, schoolCodes)
        if (subcatCodes.length > 0 && subcatCodes.every((c) => selectedSet.has(c))) {
          result.push(makeSubcatToken(short, slug))
          for (const c of subcatCodes) consumed.add(c)
        }
      }
    } else if (short === VPUE_SHORT) {
      const bospCodes = getVpueSubcatCodes('BOSP', schoolCodes)
      if (bospCodes.length > 0 && bospCodes.every((c) => selectedSet.has(c))) {
        result.push(makeSubcatToken(short, 'BOSP'))
        for (const c of bospCodes) consumed.add(c)
      }
    }
  }

  // Append any individual codes not consumed by a token
  for (const code of selected) {
    if (!consumed.has(code)) result.push(code)
  }

  return result
}
