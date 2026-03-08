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
