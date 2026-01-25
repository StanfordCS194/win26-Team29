import { Effect, Either, Stream, pipe } from 'effect'
import { HttpClient, FileSystem, Path } from '@effect/platform'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import { SubjectSchema } from '@scrape/shared/enums.ts'

export type SubjectInfo = {
  name: string
  longname: string
  school: string
}

export type SubjectCourseData = {
  subjectName: string
  academicYear: string
  xmlContent: string
}

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

const ENDPOINT = 'https://explorecourses.stanford.edu/'
const SUBJECTS_ENDPOINT = `${ENDPOINT}?view=xml-20140630`

const parseSubjectsXML = (xml: string) =>
  Effect.gen(function* (_) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'department' || name === 'school',
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

export const fetchSubjects = () =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient)
    const response = yield* _(client.get(SUBJECTS_ENDPOINT))
    const text = yield* _(response.text)
    return yield* _(parseSubjectsXML(text))
  })

const fetchSubjectCourses = (subject: SubjectInfo, academicYear: string) =>
  Effect.gen(function* (_) {
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
    const xmlContent = yield* _(response.text)

    return {
      subjectName: validatedName,
      academicYear,
      xmlContent,
    } as SubjectCourseData
  })

export const streamAllCourses = (academicYear: string) =>
  Effect.gen(function* (_) {
    const subjects = yield* _(fetchSubjects())
    const total = subjects.length

    const stream = pipe(
      Stream.fromIterable(subjects),
      Stream.mapEffect((subject) =>
        pipe(fetchSubjectCourses(subject, academicYear), Effect.either),
      ),
    )

    return { total, stream }
  })
