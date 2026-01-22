import { Effect } from 'effect'
import { HttpClient } from '@effect/platform'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import { SubjectSchema } from './enums.js'

// Types
export type SubjectInfo = {
  name: string
  longname: string
  school: string
}

export type SubjectCourseData = {
  subject: SubjectInfo
  academicYear: string
  content: string
}

// Define schemas for validation
const SubjectSchemaXML = z.object({
  name: z.string(),
  longname: z.string(),
})

const SchoolSchemaXML = z.object({
  name: z.string(),
  department: z.array(SubjectSchemaXML),
})

const SubjectsResponseSchema = z.object({
  schools: z.object({
    school: z.array(SchoolSchemaXML),
  }),
})

// Constants
const ENDPOINT = 'https://explorecourses.stanford.edu/'
const SUBJECTS_ENDPOINT = `${ENDPOINT}?view=xml-20140630`

// Helper to parse and validate XML
const parseSubjectsXML = (xml: string) =>
  Effect.gen(function* (_) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'department' || name === 'school', // Force arrays
    })
    const rawResult = parser.parse(xml)

    const parseResult = SubjectsResponseSchema.safeParse(rawResult)
    if (!parseResult.success) {
      return yield* _(
        Effect.fail(
          new Error(`Validation failed: ${parseResult.error.message}`),
        ),
      )
    }

    const validated = parseResult.data

    const schools = validated.schools.school

    const subjects: Array<SubjectInfo> = []

    for (const school of schools) {
      const schoolName = school.name

      for (const subject of school.department) {
        subjects.push({
          name: subject.name,
          longname: subject.longname,
          school: schoolName,
        })
      }
    }

    return subjects
  })

// Core fetch operations
export const fetchSubjects = () =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const response = yield* _(client.get(SUBJECTS_ENDPOINT))
    const text = yield* _(response.text)
    return yield* _(parseSubjectsXML(text))
  })

const fetchSubjectCourses = (subject: SubjectInfo, academicYear: string) =>
  Effect.gen(function* (_) {
    // Validate the subject name using SubjectSchema here
    const parseResult = SubjectSchema.safeParse(subject.name)
    if (!parseResult.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid subject name: ${parseResult.error.message}`),
        ),
      )
    }

    const validatedName = parseResult.data

    const url =
      `${ENDPOINT}search?view=xml-20140630&academicYear=${academicYear}` +
      `&q=${validatedName}&filter-subjectcode-${validatedName}=on` +
      `&filter-coursestatus-Active=on`

    const client = yield* _(HttpClient.HttpClient)
    const response = yield* _(client.get(url))
    const content = yield* _(response.text)

    return { subject, academicYear, content }
  })

// Main exported function - returns array of tasks
export const fetchCourseTasks = (academicYear: string) =>
  Effect.gen(function* (_) {
    const subjects = yield* _(fetchSubjects())

    return subjects.map((subject) => ({
      subject,
      academicYear,
      execute: () => fetchSubjectCourses(subject, academicYear),
    }))
  })
