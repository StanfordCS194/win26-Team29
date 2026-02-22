/**
 * Parses a raw search string and extracts structured course codes,
 * subject-only matches, and the remaining free-text query.
 *
 * Requires a list of known subject codes to match against.
 */

export interface CourseCode {
  subject: string
  codeNumber: number
  codeSuffix: string | undefined
}

export interface ParsedSearchQuery {
  codes: CourseCode[]
  subjectsOnly: string[]
  remainingQuery: string
}

export function parseSearchQuery(raw: string, knownSubjects: string[]): ParsedSearchQuery {
  const codes: CourseCode[] = []
  const subjectsOnly: string[] = []

  let working = raw.trim()

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
    const subject = m[1].toUpperCase()
    const codeNumber = parseInt(m[2], 10)
    const codeSuffix = m[3]?.toUpperCase() ?? undefined

    codes.push({ subject, codeNumber, codeSuffix })
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
    const subject = m[1].toUpperCase()
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
  const remainingQuery = working.replace(/\s+/g, ' ').trim()

  return { codes, subjectsOnly, remainingQuery }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
