/**
 * Parses a raw search string and extracts structured course codes,
 * subject-only matches, and the remaining free-text query.
 *
 * Requires a list of known subject codes to match against.
 */

import { parseCodeFromGroups } from '@/lib/course-code'

export interface CourseCode {
  subject: string | undefined
  codeNumber: number
  codeSuffix: string | undefined
}

export interface ParsedSearchQuery {
  codes: CourseCode[]
  subjectsOnly: string[]
  quarters: string[]
  wayGers: string[]
  remainingQuery: string
}

const QUARTER_KEYWORD_MAP: Record<string, string> = {
  fall: 'Autumn',
  autumn: 'Autumn',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
}

// Keys sorted longest-first so longer aliases (e.g. "a-ii", "edp") match before shorter ones.
const WAY_GER_MAP: Record<string, string> = {
  'a-ii': 'WAY-A-II',
  aii: 'WAY-A-II',
  aqr: 'WAY-AQR',
  ce: 'WAY-CE',
  edp: 'WAY-EDP',
  er: 'WAY-ER',
  fr: 'WAY-FR',
  si: 'WAY-SI',
  sma: 'WAY-SMA',
}

export function parseSearchQuery(raw: string, knownSubjects: string[]): ParsedSearchQuery {
  const codes: CourseCode[] = []
  const subjectsOnly: string[] = []
  const quarters: string[] = []
  const wayGers: string[] = []

  let working = raw.trim()

  // Extract WAY- GER tokens before subject/code matching so short aliases like
  // "er" or "si" are not confused with subject code suffixes.
  const waySuffixes = Object.keys(WAY_GER_MAP).sort((a, b) => b.length - a.length)
  const wayGerRegex = new RegExp(
    `(?:^|\\s)((?:way-)?(?:${waySuffixes.map((s) => escapeRegex(s)).join('|')}))(?=\\s|$)`,
    'gi',
  )
  const wayGerMatches: { start: number; end: number }[] = []
  let wm: RegExpExecArray | null
  while ((wm = wayGerRegex.exec(working)) !== null) {
    const token = wm[1]!.toLowerCase().replace(/^way-/, '')
    const canonical = WAY_GER_MAP[token]!
    if (!wayGers.includes(canonical)) wayGers.push(canonical)
    wayGerMatches.push({ start: wm.index, end: wm.index + wm[0].length })
  }
  const toRemoveW = [...wayGerMatches].sort((a, b) => b.start - a.start)
  for (const { start, end } of toRemoveW) {
    working = working.slice(0, start) + ' ' + working.slice(end)
  }
  working = working.replace(/\s+/g, ' ').trim()

  // Extract quarter keywords before subject/code matching
  const quarterRegex = new RegExp(`(?:^|\\s)(${Object.keys(QUARTER_KEYWORD_MAP).join('|')})(?=\\s|$)`, 'gi')
  const quarterMatches: { start: number; end: number }[] = []
  let qm: RegExpExecArray | null
  while ((qm = quarterRegex.exec(working)) !== null) {
    const canonical = QUARTER_KEYWORD_MAP[qm[1]!.toLowerCase()]!
    if (!quarters.includes(canonical)) quarters.push(canonical)
    quarterMatches.push({ start: qm.index, end: qm.index + qm[0].length })
  }
  const toRemoveQ = [...quarterMatches].sort((a, b) => b.start - a.start)
  for (const { start, end } of toRemoveQ) {
    working = working.slice(0, start) + ' ' + working.slice(end)
  }
  working = working.replace(/\s+/g, ' ').trim()

  // Sort longest-first so "CSE" matches before "CS"
  const sorted = [...knownSubjects].sort((a, b) => b.length - a.length)

  // Build a regex that matches any known subject code (case-insensitive)
  // followed by optional whitespace, optional digits, optional letter suffix.
  // We do this in a loop to extract all occurrences greedily.
  const subjectPattern = sorted.map((s) => escapeRegex(s)).join('|')

  // Match: subject + optional space + digits + optional alphanumeric/hyphen suffix (max 5 chars)
  const codeRegex = new RegExp(`(?:^|\\s)(${subjectPattern})\\s*(\\d+)([A-Za-z0-9-]{1,5})?(?=\\s|$)`, 'gi')

  // First pass: extract full codes (subject + number + optional suffix)
  const codeMatches: { match: string; start: number; end: number }[] = []

  let m: RegExpExecArray | null
  while ((m = codeRegex.exec(working)) !== null) {
    const fullMatch = m[0]
    const parsed = parseCodeFromGroups(m[1]!, m[2]!, m[3])
    codes.push({
      subject: parsed.subjectCode,
      codeNumber: parsed.codeNumber,
      codeSuffix: parsed.codeSuffix ?? undefined,
    })
    codeMatches.push({
      match: fullMatch,
      start: m.index,
      end: m.index + fullMatch.length,
    })
  }

  // Remove matched code tokens from the working string (right-to-left to preserve indices)
  const toRemove = [...codeMatches].sort((a, b) => b.start - a.start)
  for (const { start, end } of toRemove) {
    working = working.slice(0, start) + ' ' + working.slice(end)
  }

  // Second pass: extract lone subject codes (no adjacent number)
  const subjectOnlyRegex = new RegExp(`(?:^|\\s)(${subjectPattern})(?=\\s|$)`, 'gi')

  const subjectOnlyMatches: { match: string; start: number; end: number }[] = []

  while ((m = subjectOnlyRegex.exec(working)) !== null) {
    const raw = m[1]!
    // A token that is 4+ characters and entirely lowercase is likely a plain
    // English word rather than a subject code abbreviation — skip it.
    if (raw.length >= 4 && raw === raw.toLowerCase()) continue
    const subject = raw.toUpperCase()
    // Avoid duplicates if already captured as a full code
    if (!subjectsOnly.includes(subject)) {
      subjectsOnly.push(subject)
    }
    subjectOnlyMatches.push({
      match: m[0],
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  // Remove matched subject-only tokens
  const toRemove2 = [...subjectOnlyMatches].sort((a, b) => b.start - a.start)
  for (const { start, end } of toRemove2) {
    working = working.slice(0, start) + ' ' + working.slice(end)
  }

  // Clean up remaining query
  let remainingQuery = working.replace(/\s+/g, ' ').trim()

  // A query that is purely a number (and nothing else) is treated as a bare code number filter.
  if (/^\d+$/.test(remainingQuery)) {
    codes.push({ subject: undefined, codeNumber: parseInt(remainingQuery, 10), codeSuffix: undefined })
    remainingQuery = ''
  }

  return { codes, subjectsOnly, quarters, wayGers, remainingQuery }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
