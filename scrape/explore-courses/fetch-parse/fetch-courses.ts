import { Effect, Either, Stream, pipe, Data } from 'effect'
import { HttpClient } from '@effect/platform'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

export class SubjectsXMLParseError extends Data.TaggedError('SubjectsXMLParseError')<{
  cause: unknown
}> {}

export class SubjectsFetchError extends Data.TaggedError('SubjectsFetchError')<{
  cause: unknown
}> {}

export class CourseXMLFetchError extends Data.TaggedError('CourseXMLFetchError')<{
  subjectName: string
  academicYear: string
  cause: unknown
}> {}


export type SubjectInfo = {
  name: string
  longname: string
  school: string
}

export type SubjectCourseData = {
  subjectName: string
  academicYear: string
  xmlContent: string
  longname?: string // only set when fetching via HTTP (not from cache)
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
      return yield* _(new SubjectsXMLParseError({ cause: parseResult.error }))
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

export const fetchSubjects = (academicYear: string) =>
  Effect.gen(function* (_) {
    const url = `${ENDPOINT}?view=xml-20140630&academicYear=${academicYear}`
    const client = yield* _(HttpClient.HttpClient)
    const response = yield* _(
      client.get(url).pipe(Effect.mapError((cause) => new SubjectsFetchError({ cause }))),
    )
    const text = yield* _(response.text.pipe(Effect.mapError((cause) => new SubjectsFetchError({ cause }))))
    return yield* _(parseSubjectsXML(text))
  })

const fetchSubjectCourses = (subject: SubjectInfo, academicYear: string) =>
  Effect.gen(function* (_) {
    const validatedName = subject.name

    const url =
      `${ENDPOINT}search?view=xml-20140630&academicYear=${academicYear}` +
      `&q=${validatedName}&filter-subjectcode-${validatedName}=on` +
      `&filter-coursestatus-Active=on`

    const client = yield* _(HttpClient.HttpClient)
    const response = yield* _(
      client.get(url).pipe(
        Effect.mapError(
          (cause) =>
            new CourseXMLFetchError({
              subjectName: validatedName,
              academicYear,
              cause,
            }),
        ),
      ),
    )
    const xmlContent = yield* _(
      response.text.pipe(
        Effect.mapError(
          (cause) =>
            new CourseXMLFetchError({
              subjectName: validatedName,
              academicYear,
              cause,
            }),
        ),
      ),
    )

    return {
      subjectName: validatedName,
      academicYear,
      xmlContent,
      longname: subject.longname,
    } as SubjectCourseData
  })

export const streamAllCourses = (academicYear: string) =>
  Effect.gen(function* (_) {
    const subjects = yield* _(fetchSubjects(academicYear))
    const total = subjects.length

    const stream = pipe(
      Stream.fromIterable(subjects),
      Stream.mapEffect((subject) => pipe(fetchSubjectCourses(subject, academicYear), Effect.either)),
    )

    return { total, stream }
  })
