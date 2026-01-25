import { Effect, Data } from 'effect'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

export class XMLParseError extends Data.TaggedError('XMLParseError')<{
  message: string
  cause?: unknown
}> {}

export class SchemaValidationError extends Data.TaggedError(
  'SchemaValidationError',
)<{
  message: string
  issues: Array<{
    path: string
    actual: unknown
    message: string
  }>
}> {}

const ConsentOption = z.enum(['Y', 'N', 'I', 'D'])
const FinalExamOption = z.enum(['Y', 'N', 'L'])
const EnrollStatus = z.enum(['Open', 'Closed'])
const EffectiveStatus = z.enum(['A', 'I'])

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' ? undefined : val), schema)

const splitToArray = (str: string): string[] => {
  if (!str || str.trim() === '') return []
  return str
    .split(/[,\n\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Helper to handle nested array structures
const arrayField = <T extends z.ZodTypeAny>(itemSchema: T, fieldName: string) =>
  z.preprocess((val) => {
    if (typeof val === 'string') return []
    if (val && typeof val === 'object' && fieldName in val) {
      return (val as any)[fieldName]
    }
    return []
  }, z.array(itemSchema))

// Date schema - parses "Sep 23, 2024" format
const DateString = z.string().refine(
  (val) => {
    const dateRegex = /^\w{3} \d{1,2}, \d{4}$/
    if (!dateRegex.test(val)) return false
    const date = new Date(val)
    return !isNaN(date.getTime())
  },
  { message: 'Invalid date format' },
)

// Time schema - parses "1:30:00 PM" format
const TimeString = z.string().refine(
  (val) => {
    const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i
    return timeRegex.test(val)
  },
  { message: 'Invalid time format' },
)

const Quarter = z.enum(['Autumn', 'Winter', 'Spring', 'Summer'])

const AcademicYearSchema = z.string().refine(
  (val) => {
    const yearRegex = /^\d{4}-\d{4}$/
    if (!yearRegex.test(val)) return false

    const [startYear, endYear] = val.split('-').map(Number)
    return endYear === startYear + 1
  },
  {
    message:
      'Invalid academic year format. Expected format: YYYY-YYYY (e.g., 2022-2023)',
  },
)

// Term schema that transforms the string into structured data
const TermSchema = z
  .string()
  .refine(
    (val) => {
      // Expected format: "2022-2023 Autumn"
      const parts = val.trim().split(/\s+/)
      return parts.length === 2
    },
    {
      message:
        'Invalid term format. Expected format: "YYYY-YYYY Quarter" (e.g., "2022-2023 Autumn")',
    },
  )
  .transform((val) => {
    const parts = val.trim().split(/\s+/)
    const [year, quarter] = parts
    return {
      year: AcademicYearSchema.parse(year),
      quarter: Quarter.parse(quarter),
    }
  })

const CodeSchema = z
  .string()
  .refine(
    (val) => {
      const codeRegex = /^(\d+)(.*)$/
      return codeRegex.test(val)
    },
    {
      message:
        'Invalid code format. Expected format: number followed by optional suffix',
    },
  )
  .transform((val) => {
    const codeRegex = /^(\d+)(.*)$/
    const match = val.match(codeRegex)!

    const [, numberPart, suffixPart] = match

    return {
      number: parseInt(numberPart, 10),
      suffix: suffixPart.length > 0 ? suffixPart : undefined,
    }
  })

const InstructorSchema = z.object({
  name: z.coerce.string().min(1),
  firstName: z.coerce.string(),
  middleName: emptyStringToUndefined(z.coerce.string().min(1).optional()),
  lastName: z.coerce.string().min(1),
  sunet: z.coerce.string().min(1),
  role: z.coerce.string().min(1),
})

const ScheduleSchema = z.object({
  startDate: emptyStringToUndefined(DateString.optional()),
  endDate: emptyStringToUndefined(DateString.optional()),
  startTime: emptyStringToUndefined(TimeString.optional()),
  endTime: emptyStringToUndefined(TimeString.optional()),
  location: emptyStringToUndefined(z.coerce.string().optional()),
  days: z.coerce.string().transform(splitToArray),
  instructors: arrayField(InstructorSchema, 'instructor'),
})

const AttributeSchema = z.object({
  name: z.coerce.string().min(1),
  value: z.coerce.string().min(1),
  description: z.coerce.string().min(1),
  catalogPrint: z.coerce.boolean(),
  schedulePrint: z.coerce.boolean(),
})

const SectionSchema = z.object({
  classId: z.coerce.number(),
  term: TermSchema,
  termId: z.coerce.number(),
  subject: z.coerce.string().min(1),
  code: CodeSchema,
  units: emptyStringToUndefined(z.coerce.string().optional()),
  sectionNumber: z.coerce.string().min(1),
  component: z.coerce.string().min(1),
  numEnrolled: z.coerce.number().min(0),
  maxEnrolled: z.coerce.number().min(0),
  numWaitlist: z.coerce.number().min(0),
  maxWaitlist: z.coerce.number().min(0),
  enrollStatus: EnrollStatus,
  addConsent: ConsentOption,
  dropConsent: ConsentOption,
  courseId: z.coerce.number().min(0),
  schedules: arrayField(ScheduleSchema, 'schedule'),
  currentClassSize: z.coerce.number().min(0),
  maxClassSize: z.coerce.number().min(0),
  currentWaitlistSize: z.coerce.number().min(0),
  maxWaitlistSize: z.coerce.number().min(0),
  notes: emptyStringToUndefined(z.coerce.string().optional()),
  attributes: arrayField(AttributeSchema, 'attribute'),
})

const AdministrativeInformationSchema = z.object({
  courseId: z.coerce.number().min(0),
  effectiveStatus: EffectiveStatus,
  offerNumber: z.coerce.number().min(1),
  academicGroup: z.coerce.string().min(1),
  academicOrganization: z.coerce.string().min(1),
  academicCareer: z.coerce.string().min(1),
  finalExamFlag: FinalExamOption,
  catalogPrint: z.coerce.boolean(),
  schedulePrint: z.coerce.boolean(),
  maxUnitsRepeat: z.coerce.number().min(0),
  maxTimesRepeat: z.coerce.number().min(1),
})

const TagSchema = z.object({
  organization: z.coerce.string().min(1),
  name: emptyStringToUndefined(z.coerce.string().optional()),
})

const LearningObjectiveSchema = z.object({
  requirementCode: z.coerce.string().min(1),
  description: z.coerce.string().min(1),
})

const CourseSchema = z.object({
  year: AcademicYearSchema,
  subject: z.coerce.string().min(1),
  code: CodeSchema,
  title: z.coerce.string().min(1),
  description: z.coerce.string(),
  gers: z.coerce.string().transform(splitToArray),
  repeatable: z.coerce.boolean(),
  grading: z.coerce.string().min(1),
  unitsMin: z.coerce.number().min(0),
  unitsMax: z.coerce.number().min(0),
  learningObjectives: arrayField(LearningObjectiveSchema, 'learningObjective'),
  sections: arrayField(SectionSchema, 'section'),
  administrativeInformation: AdministrativeInformationSchema,
  attributes: arrayField(AttributeSchema, 'attribute'),
  tags: arrayField(TagSchema, 'tag'),
})

const CoursesResponseSchema = z.object({
  xml: z.object({
    deprecated: z.coerce.boolean(),
    latestVersion: z.coerce.number(),
    courses: arrayField(CourseSchema, 'course'),
  }),
})

type CoursesResponse = z.infer<typeof CoursesResponseSchema>

export const parseCoursesXML = (xml: string) =>
  Effect.gen(function* (_) {
    let rawResult: unknown
    try {
      const parser = new XMLParser({
        ignoreAttributes: true,
        isArray: (name) =>
          [
            'course',
            'section',
            'schedule',
            'instructor',
            'attribute',
            'tag',
            'school',
            'department',
            'learningObjective',
          ].includes(name),
        parseTagValue: false,
      })

      rawResult = parser.parse(xml)
    } catch (error) {
      return yield* _(
        Effect.fail(
          new XMLParseError({
            message: 'Failed to parse XML document',
            cause: error,
          }),
        ),
      )
    }

    const parseResult = CoursesResponseSchema.safeParse(rawResult)
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((issue) => {
        let actualValue: unknown = rawResult
        for (const key of issue.path) {
          if (actualValue != null && typeof actualValue === 'object') {
            actualValue = (actualValue as any)[key]
          } else {
            actualValue = undefined
            break
          }
        }

        return {
          path: issue.path.join('.'),
          actual: actualValue,
          message: issue.message,
        }
      })

      return yield* _(
        Effect.fail(
          new SchemaValidationError({
            message: `Schema validation failed with ${issues.length} error(s)`,
            issues,
          }),
        ),
      )
    }

    const validated = parseResult.data
    const coursesData = validated.xml.courses

    if (!coursesData) {
      return yield* _(
        Effect.fail(new Error('No courses data found in XML document')),
      )
    }
  })
