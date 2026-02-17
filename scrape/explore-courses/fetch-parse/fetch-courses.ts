import { HttpClient } from '@effect/platform'
import { Data, Effect, Stream, pipe } from 'effect'
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
  longname?: string
  school?: string
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
  Effect.gen(function* () {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'department' || name === 'school',
    })
    const rawResult: unknown = parser.parse(xml)

    const parseResult = SubjectsResponseSchema.safeParse(rawResult)
    if (!parseResult.success) {
      return yield* new SubjectsXMLParseError({ cause: parseResult.error })
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
  Effect.gen(function* () {
    const url = `${ENDPOINT}?view=xml-20140630&academicYear=${academicYear}`
    const client = yield* HttpClient.HttpClient
    const response = yield* client
      .get(url)
      .pipe(Effect.mapError((cause) => new SubjectsFetchError({ cause })))
    const text = yield* response.text.pipe(Effect.mapError((cause) => new SubjectsFetchError({ cause })))
    return yield* parseSubjectsXML(text)
  })

const fetchSubjectCourses = (name: string, academicYear: string, longname?: string) =>
  Effect.gen(function* () {
    const url =
      `${ENDPOINT}search?view=xml-20140630&academicYear=${academicYear}` +
      `&q=${encodeURIComponent(name)}&filter-subjectcode-${encodeURIComponent(name)}=on` +
      `&filter-coursestatus-Active=on`

    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(url).pipe(
      Effect.mapError(
        (cause) =>
          new CourseXMLFetchError({
            subjectName: name,
            academicYear,
            cause,
          }),
      ),
    )
    const xmlContent = yield* response.text.pipe(
      Effect.mapError(
        (cause) =>
          new CourseXMLFetchError({
            subjectName: name,
            academicYear,
            cause,
          }),
      ),
    )

    return {
      subjectName: name,
      academicYear,
      xmlContent,
      longname,
    } as SubjectCourseData
  })

export const streamAllCourses = (academicYear: string) =>
  Effect.gen(function* () {
    const subjects = yield* fetchSubjects(academicYear)

    // PHOTON is not returned by the XML subjects API, so we manually include it
    if (!subjects.some((s) => s.name === 'PHOTON')) {
      subjects.push({ name: 'PHOTON' })
    }

    const total = subjects.length

    const stream = pipe(
      Stream.fromIterable(subjects),
      Stream.mapEffect(
        (subject) => pipe(fetchSubjectCourses(subject.name, academicYear, subject.longname), Effect.either),
        {
          concurrency: 'unbounded',
        },
      ),
    )

    return { total, stream }
  })
