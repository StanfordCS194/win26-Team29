import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { courseByCodeQueryOptions } from './courses-query-options'
import { parseDescriptionCourseLinks } from '@/lib/course-code'

const linkClassName = 'text-primary hover:opacity-80'

function CourseCodeLink({ slug, display, year }: { slug: string; display: string; year: string }) {
  const { data: course } = useQuery(courseByCodeQueryOptions(year, slug))
  if (course != null) {
    return (
      <Link to="/course/$courseId" params={{ courseId: slug }} className={linkClassName}>
        {display}
      </Link>
    )
  }
  return <>{display}</>
}

/**
 * Renders course description text with course codes as clickable links.
 * Use validSubjects to only link known catalog subjects (fewer false positives).
 * Links are only shown for courses that exist (checked asynchronously).
 */
export function renderDescriptionWithLinks(
  text: string,
  validSubjects: Set<string> | undefined,
  year: string,
): ReactNode {
  const segments = parseDescriptionCourseLinks(text, validSubjects)
  if (segments.length === 1 && segments[0]!.type === 'text') return text
  return segments.map((seg, i) => {
    if (seg.type === 'text') return seg.value
    return <CourseCodeLink key={i} slug={seg.slug} display={seg.display} year={year} />
  })
}
