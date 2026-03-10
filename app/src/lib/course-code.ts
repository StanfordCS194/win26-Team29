/**
 * Parse and format course code slugs (e.g. CS106A, MATH21) for URLs and display.
 */

export interface ParsedCourseCode {
  subjectCode: string
  codeNumber: number
  codeSuffix: string | null
}

/**
 * Normalizes regex capture groups into a ParsedCourseCode.
 * Use when you have matched subject, number, and optional suffix from a regex.
 */
export function parseCodeFromGroups(
  subjectStr: string,
  numberStr: string,
  suffixStr?: string,
): ParsedCourseCode {
  const subjectCode = subjectStr.toUpperCase()
  const codeNumber = parseInt(numberStr, 10)
  if (Number.isNaN(codeNumber)) throw new Error(`Invalid code number: ${numberStr}`)
  const raw = suffixStr?.trim()
  const codeSuffix = raw != null && raw.length > 0 ? raw.toUpperCase() : null
  return { subjectCode, codeNumber, codeSuffix }
}

const SLUG_REGEX = /^([A-Za-z]+)(\d+)(.*)$/

/**
 * Parses a course code slug into subject, number, and optional suffix.
 * Returns null if the slug doesn't match the expected pattern.
 */
export function parseCourseCodeSlug(slug: string): ParsedCourseCode | null {
  const trimmed = slug.trim()
  const m = SLUG_REGEX.exec(trimmed)
  if (!m) return null
  try {
    return parseCodeFromGroups(m[1]!, m[2]!, m[3])
  } catch {
    return null
  }
}

/**
 * Builds a course code slug from parts (e.g. MATH, 235, null → "math235").
 */
export function toCourseCodeSlug(parts: {
  subjectCode: string
  codeNumber: number
  codeSuffix: string | null
}): string {
  const suffix = (parts.codeSuffix ?? '').toLowerCase()
  return `${parts.subjectCode.toLowerCase()}${parts.codeNumber}${suffix}`
}

/**
 * Formats course code parts for display (e.g. MATH, 235, null → "MATH 235").
 */
export function formatCourseCodeFromParts(parts: {
  subjectCode: string
  codeNumber: number
  codeSuffix: string | null
}): string {
  const suffix = parts.codeSuffix ?? ''
  return `${parts.subjectCode} ${parts.codeNumber}${suffix}`.trim()
}

/**
 * Formats a course code slug for display by inserting a space between
 * subject and number (e.g. CS106A → "CS 106A").
 */
export function formatCourseCodeForDisplay(slug: string): string {
  const parsed = parseCourseCodeSlug(slug)
  if (!parsed) return slug
  const suffix = parsed.codeSuffix != null && parsed.codeSuffix !== '' ? String(parsed.codeSuffix) : ''
  return `${parsed.subjectCode} ${parsed.codeNumber}${suffix}`.trim()
}

/**
 * Segments a course description into text and course-code-link parts.
 * Matches title-case or all-caps subjects followed by digits: Math 51, CS106A, Physics 43, CME 100.
 * Suffix: up to 5 alphanumeric/hyphen chars per scrape schema.
 */
export type DescriptionSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; display: string; slug: string }

// Canonical: subject (1-7 letters) + number (1-4 digits) + optional suffix (0-5 chars, alphanumeric/hyphen)
// Compound: SUBJECT num/num/num – e.g. EARTHSYS 144/164 – capture full "num/num" tail and split
const COURSE_CODE_REGEX =
  /\b([A-Z][A-Za-z]{1,7})\s?(\d{1,4}(?:[A-Za-z0-9-]{0,5})?(?:\/\d{1,4}(?:[A-Za-z0-9-]{0,5})?)*)\b/g

function parseNumberPart(part: string): { num: string; suffix: string } {
  const m = /^(\d{1,4})([A-Za-z0-9-]{0,5})?$/.exec(part.trim())
  if (!m) return { num: part, suffix: '' }
  return { num: m[1]!, suffix: (m[2] ?? '').toLowerCase() }
}

export function parseDescriptionCourseLinks(text: string, validSubjects?: Set<string>): DescriptionSegment[] {
  const segments: DescriptionSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(COURSE_CODE_REGEX)) {
    const matchIndex = match.index!
    const subject = match[1]!
    const subjectUpper = subject.toUpperCase()

    if (validSubjects !== undefined && !validSubjects.has(subjectUpper)) {
      continue
    }

    if (matchIndex > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchIndex) })
    }

    // Split "144/164" or "144" into parts
    const tail = match[2]!
    const parts = tail
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)

    for (let i = 0; i < parts.length; i++) {
      const { num, suffix } = parseNumberPart(parts[i]!)
      const slug = `${subjectUpper.toLowerCase()}${num}${suffix}`

      // First part: "SUBJECT num" (e.g. "EARTHSYS 144"); rest: just the number (e.g. "164") for compactness
      const display = i === 0 ? `${subjectUpper} ${parts[0]!}` : parts[i]!

      if (i > 0) segments.push({ type: 'text', value: '/' })
      segments.push({ type: 'link', display, slug })
    }

    lastIndex = matchIndex + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
