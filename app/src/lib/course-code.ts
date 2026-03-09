/**
 * Parse and format course code slugs (e.g. CS106A, MATH21) for URLs and display.
 */

export interface ParsedCourseCode {
  subjectCode: string
  codeNumber: number
  codeSuffix: string | null
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
  const subjectCode = m[1]!.toUpperCase()
  const codeNumber = parseInt(m[2]!, 10)
  if (Number.isNaN(codeNumber)) return null
  const suffix = m[3]?.trim()
  const codeSuffix = suffix && suffix.length > 0 ? suffix.toUpperCase() : null
  return { subjectCode, codeNumber, codeSuffix }
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
 */
export type DescriptionSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; display: string; slug: string }

const COURSE_CODE_REGEX = /\b([A-Z][A-Za-z]{1,7})\s?(\d{1,4}[A-Z]?)\b/g

export function parseDescriptionCourseLinks(text: string): DescriptionSegment[] {
  const segments: DescriptionSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(COURSE_CODE_REGEX)) {
    const matchIndex = match.index!
    if (matchIndex > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchIndex) })
    }

    const subject = match[1]!
    const numberPart = match[2]!
    segments.push({
      type: 'link',
      display: match[0],
      slug: `${subject.toLowerCase()}${numberPart.toLowerCase()}`,
    })

    lastIndex = matchIndex + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
