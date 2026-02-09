import { Effect, Data } from 'effect'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import {
  CourseCodeSchema,
  naturalFromStringOrNumber,
  QuarterSchema,
  WeekdaySchema,
} from '@scrape/shared/schemas.ts'
import { EffectTemporal } from '@scrape/shared/effect-temporal.ts'

export class XMLParseError extends Data.TaggedError('XMLParseError')<{
  message: string
  cause?: unknown
  subjectName: string
}> {}

export class SchemaValidationError extends Data.TaggedError('SchemaValidationError')<{
  message: string
  issues: Array<{
    path: string
    actual: unknown
    message: string
  }>
  subjectName: string
}> {}

const SPLIT_SEPARATOR_REGEX = /[,\n\t]+/
const TIME_REGEX = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i
const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/
const WHITESPACE_REGEX = /\s+/

const xmlParser = new XMLParser({
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

const ConsentOptionSchema = z.enum(['Y', 'N', 'I', 'D'])
export type ConsentOption = z.infer<typeof ConsentOptionSchema>
const FinalExamOptionSchema = z.enum(['Y', 'N', 'L'])
export type FinalExamOption = z.infer<typeof FinalExamOptionSchema>
const EnrollStatusSchema = z.enum(['Open', 'Closed'])
export type EnrollStatus = z.infer<typeof EnrollStatusSchema>
const EffectiveStatusSchema = z.enum(['A', 'I'])
export type EffectiveStatus = z.infer<typeof EffectiveStatusSchema>

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' ? undefined : val), schema)

const splitToArray = (str: string): string[] => {
  if (!str || str.trim() === '') return []
  return str
    .split(SPLIT_SEPARATOR_REGEX)
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

// PlainDate schema - parses "Sep 23, 2024" format
const PlainDateSchema = z.string().transform((val, ctx) => {
  try {
    const date = new Date(val)
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid date format',
      })
      return z.NEVER
    }

    return EffectTemporal.PlainDate.from({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    })
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: 'Failed to parse date',
    })
    return z.NEVER
  }
})

// PlainTime schema - parses "1:30:00 PM" format
const PlainTimeSchema = z.string().transform((val, ctx) => {
  try {
    // Parse the time string
    const match = val.match(TIME_REGEX)

    if (!match) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid time format',
      })
      return z.NEVER
    }

    let [, hourStr, minuteStr, secondStr, meridiem] = match
    let hour = parseInt(hourStr, 10)
    const minute = parseInt(minuteStr, 10)
    const second = secondStr ? parseInt(secondStr, 10) : 0

    // Convert to 24-hour format
    if (meridiem.toUpperCase() === 'PM' && hour !== 12) {
      hour += 12
    } else if (meridiem.toUpperCase() === 'AM' && hour === 12) {
      hour = 0
    }

    return EffectTemporal.PlainTime.from({ hour, minute, second })
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: 'Failed to parse time',
    })
    return z.NEVER
  }
})

const AcademicYearSchema = z.string().refine(
  (val) => {
    if (!ACADEMIC_YEAR_REGEX.test(val)) return false

    const [startYear, endYear] = val.split('-').map(Number)
    return endYear === startYear + 1
  },
  {
    message: 'Invalid academic year format. Expected format: YYYY-YYYY (e.g., 2022-2023)',
  },
)

// Term schema that transforms the string into structured data
const TermSchema = z
  .string()
  .refine(
    (val) => {
      // Expected format: "2022-2023 Autumn"
      const parts = val.trim().split(WHITESPACE_REGEX)
      return parts.length === 2
    },
    {
      message: 'Invalid term format. Expected format: "YYYY-YYYY Quarter" (e.g., "2022-2023 Autumn")',
    },
  )
  .transform((val) => {
    const parts = val.trim().split(WHITESPACE_REGEX)
    const [year, quarter] = parts
    return {
      year: AcademicYearSchema.parse(year),
      quarter: QuarterSchema.parse(quarter),
    }
  })

// Units schema - parses "3" or "2-4" into {min, max}, empty string -> {min: undefined, max: undefined}
const UnitsSchema = z
  .string()
  .refine(
    (val) => {
      const trimmed = val.trim()

      // Empty string is valid
      if (trimmed === '') return true

      // Handle range format "2-4"
      if (trimmed.includes('-')) {
        const parts = trimmed.split('-').map((s) => s.trim())
        if (parts.length !== 2) return false

        const min = Number(parts[0])
        const max = Number(parts[1])
        return (
          !Number.isNaN(min) &&
          !Number.isNaN(max) &&
          min >= 0 &&
          max >= 0 &&
          Number.isInteger(min) &&
          Number.isInteger(max)
        )
      }

      // Handle single number format "3"
      const num = Number(trimmed)
      return !Number.isNaN(num) && num >= 0 && Number.isInteger(num)
    },
    {
      message: 'Invalid units format. Expected a non-negative integer or range like "3" or "2-4"',
    },
  )
  .transform((val) => {
    const trimmed = val.trim()

    // Handle empty string
    if (trimmed === '') {
      return { min: undefined, max: undefined }
    }

    // Handle range format "2-4"
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-').map((s) => s.trim())
      const min = Number(parts[0])
      const max = Number(parts[1])
      return { min, max }
    }

    // Handle single number format "3"
    const num = Number(trimmed)
    return { min: num, max: num }
  })

const InstructorSchema = z.object({
  name: z.string().min(1),
  firstName: z.string(),
  middleName: emptyStringToUndefined(z.string().min(1).optional()),
  lastName: z.string().min(1),
  sunet: z.string().min(1),
  role: z.string().min(1),
})

export type ParsedInstructor = z.infer<typeof InstructorSchema>

const ScheduleSchema = z.object({
  startDate: emptyStringToUndefined(PlainDateSchema.optional()),
  endDate: emptyStringToUndefined(PlainDateSchema.optional()),
  startTime: emptyStringToUndefined(PlainTimeSchema.optional()),
  endTime: emptyStringToUndefined(PlainTimeSchema.optional()),
  location: emptyStringToUndefined(z.string().optional()),
  days: z.string().transform((str) => {
    const dayStrings = splitToArray(str)
    return dayStrings.map((day) => WeekdaySchema.parse(day))
  }),
  instructors: arrayField(InstructorSchema, 'instructor'),
})

const AttributeSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  description: z.string().min(1),
  catalogPrint: z.stringbool(),
  schedulePrint: z.stringbool(),
})

const SectionSchema = z.object({
  classId: naturalFromStringOrNumber,
  term: TermSchema,
  termId: naturalFromStringOrNumber,
  subject: CourseCodeSchema.shape.subject,
  code: CourseCodeSchema.shape.code,
  units: UnitsSchema,
  sectionNumber: z.string().min(1),
  component: z.string().min(1),
  numEnrolled: naturalFromStringOrNumber,
  maxEnrolled: naturalFromStringOrNumber,
  numWaitlist: naturalFromStringOrNumber,
  maxWaitlist: naturalFromStringOrNumber,
  enrollStatus: EnrollStatusSchema,
  addConsent: ConsentOptionSchema,
  dropConsent: ConsentOptionSchema,
  courseId: naturalFromStringOrNumber,
  schedules: arrayField(ScheduleSchema, 'schedule'),
  currentClassSize: naturalFromStringOrNumber,
  maxClassSize: naturalFromStringOrNumber,
  currentWaitlistSize: naturalFromStringOrNumber,
  maxWaitlistSize: naturalFromStringOrNumber,
  notes: emptyStringToUndefined(z.string().optional()),
  attributes: arrayField(AttributeSchema, 'attribute'),
})

const AdministrativeInformationSchema = z.object({
  courseId: naturalFromStringOrNumber,
  effectiveStatus: EffectiveStatusSchema,
  offerNumber: naturalFromStringOrNumber,
  academicGroup: z.string().min(1),
  academicOrganization: z.string().min(1),
  academicCareer: z.string().min(1),
  finalExamFlag: FinalExamOptionSchema,
  catalogPrint: z.stringbool(),
  schedulePrint: z.stringbool(),
  maxUnitsRepeat: naturalFromStringOrNumber,
  maxTimesRepeat: naturalFromStringOrNumber,
})

const TagSchema = z.object({
  organization: z.string().min(1),
  name: z.string(),
})

const LearningObjectiveSchema = z.object({
  requirementCode: z.string().min(1),
  description: z.string().min(1),
})

const CourseSchema = z.object({
  year: AcademicYearSchema,
  ...CourseCodeSchema.shape,
  title: z.string().min(1),
  description: z.string(),
  gers: z.string().transform(splitToArray),
  repeatable: z.stringbool(),
  grading: z.string().min(1),
  unitsMin: naturalFromStringOrNumber,
  unitsMax: naturalFromStringOrNumber,
  learningObjectives: arrayField(LearningObjectiveSchema, 'learningObjective'),
  sections: arrayField(SectionSchema, 'section'),
  administrativeInformation: AdministrativeInformationSchema,
  attributes: arrayField(AttributeSchema, 'attribute'),
  tags: arrayField(TagSchema, 'tag'),
})

const CoursesResponseSchema = z.object({
  xml: z.object({
    deprecated: z.stringbool(),
    latestVersion: naturalFromStringOrNumber,
    courses: arrayField(CourseSchema, 'course'),
  }),
})

export type ParsedCourse = z.infer<typeof CoursesResponseSchema>['xml']['courses'][number]

export const parseCoursesXML = (xml: string, subjectName: string) =>
  Effect.gen(function* (_) {
    let rawResult: unknown
    try {
      rawResult = xmlParser.parse(xml)
    } catch (error) {
      return yield* _(
        Effect.fail(
          new XMLParseError({
            message: 'Failed to parse XML document',
            cause: error,
            subjectName,
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
            subjectName,
          }),
        ),
      )
    }

    const validated = parseResult.data
    const coursesData = validated.xml.courses

    if (!coursesData) {
      return yield* _(
        Effect.fail(
          new XMLParseError({
            message: 'No courses data found in XML document',
            subjectName,
          }),
        ),
      )
    }
    return coursesData
  })
