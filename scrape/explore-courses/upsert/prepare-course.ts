import { Data, Effect } from 'effect'

import type { ParsedCourse } from '../fetch-parse/parse-courses.ts'

import type { LookupTable } from './upsert-codes.ts'
import type { UploadCourseOffering } from './upsert-courses.types.ts'

export class PrepareCourseLookupError extends Data.TaggedError('PrepareCourseLookupError')<{
  subject: string
  code_number: number
  code_suffix: string | null
  year: string
  missingLookups: { table: string; key: string }
}> {}

export type EntityLookupIdMap = Record<LookupTable, Map<string, number>> & {
  subjects: Map<string, number>
  instructors: Map<string, number>
}

type TableKey = keyof EntityLookupIdMap

type CourseContext = {
  subject: string
  code_number: number
  code_suffix: string | null
  year: string
}

function getLookupId(
  lookup: EntityLookupIdMap,
  table: TableKey,
  key: string,
  ctx: CourseContext,
): Effect.Effect<number, PrepareCourseLookupError> {
  const value = lookup[table].get(key)
  if (value === undefined) {
    return Effect.fail(
      new PrepareCourseLookupError({
        ...ctx,
        missingLookups: { table, key },
      }),
    )
  }
  return Effect.succeed(value)
}

export function parsedCourseToUploadCourseOffering(
  parsed: ParsedCourse,
  lookup: EntityLookupIdMap,
): Effect.Effect<UploadCourseOffering, PrepareCourseLookupError> {
  const ctx: CourseContext = {
    subject: parsed.subject,
    code_number: parsed.code.number,
    code_suffix: parsed.code.suffix ?? null,
    year: parsed.year,
  }

  const id = (table: TableKey, key: string) => getLookupId(lookup, table, key, ctx)

  return Effect.gen(function* () {
    const academic_career_id = yield* id('academic_careers', parsed.administrativeInformation.academicCareer)
    const academic_group_id = yield* id('academic_groups', parsed.administrativeInformation.academicGroup)
    const academic_organization_id = yield* id(
      'academic_organizations',
      parsed.administrativeInformation.academicOrganization,
    )
    const final_exam_flag_id = yield* id('final_exam_options', parsed.administrativeInformation.finalExamFlag)
    const grading_option_id = yield* id('grading_options', parsed.grading)
    const subject_id = yield* id('subjects', parsed.subject)

    const sections = yield* Effect.forEach(parsed.sections, (section) =>
      Effect.gen(function* () {
        const add_consent_id = yield* id('consent_options', section.addConsent)
        const component_type_id = yield* id('component_types', section.component)
        const drop_consent_id = yield* id('consent_options', section.dropConsent)
        const enroll_status_id = yield* id('enroll_statuses', section.enrollStatus)

        const schedules = yield* Effect.forEach(section.schedules, (schedule) =>
          Effect.gen(function* () {
            const instructors = yield* Effect.forEach(schedule.instructors, (instructor) =>
              Effect.gen(function* () {
                const instructor_id = yield* getLookupId(lookup, 'instructors', instructor.sunet, ctx)
                const instructor_role_id = yield* id('instructor_roles', instructor.role)
                return { instructor_id, instructor_role_id }
              }),
            )

            return {
              days: schedule.days.length > 0 ? schedule.days : null,
              end_date: schedule.endDate ?? null,
              end_time: schedule.endTime ?? null,
              location: schedule.location === '' ? null : (schedule.location ?? null),
              start_date: schedule.startDate ?? null,
              start_time: schedule.startTime ?? null,
              instructors,
            }
          }),
        )

        return {
          units_max: section.units.max ?? null,
          units_min: section.units.min ?? null,
          add_consent_id,
          class_id: section.classId,
          component_type_id,
          current_class_size: section.currentClassSize,
          current_waitlist_size: section.currentWaitlistSize,
          drop_consent_id,
          enroll_status_id,
          max_class_size: section.maxClassSize,
          max_enrolled: section.maxEnrolled,
          max_waitlist: section.maxWaitlist,
          max_waitlist_size: section.maxWaitlistSize,
          notes: section.notes === '' ? null : (section.notes ?? null),
          num_enrolled: section.numEnrolled,
          num_waitlist: section.numWaitlist,
          section_number: section.sectionNumber,
          term_id: section.termId,
          term_quarter: section.term.quarter,
          attributes: section.attributes.map((attr) => ({
            description: attr.description,
            schedule_print: attr.schedulePrint,
            name: attr.name,
            value: attr.value,
          })),
          schedules,
        }
      }),
    )

    const gers = yield* Effect.forEach(parsed.gers, (ger) =>
      Effect.gen(function* () {
        const ger_id = yield* id('gers', ger)
        return { ger_id }
      }),
    )

    return {
      academic_career_id,
      academic_group_id,
      academic_organization_id,
      code_number: parsed.code.number,
      code_suffix: parsed.code.suffix === '' ? null : (parsed.code.suffix ?? null),
      course_id: parsed.administrativeInformation.courseId,
      description: parsed.description,
      final_exam_flag_id,
      grading_option_id,
      max_times_repeat: parsed.administrativeInformation.maxTimesRepeat,
      max_units_repeat: parsed.administrativeInformation.maxUnitsRepeat,
      offer_number: parsed.administrativeInformation.offerNumber,
      repeatable: parsed.repeatable,
      schedule_print: parsed.administrativeInformation.schedulePrint,
      subject_id,
      title: parsed.title,
      units_max: parsed.unitsMax,
      units_min: parsed.unitsMin,
      year: parsed.year,
      sections,
      learningObjectives: parsed.learningObjectives.map((objective) => ({
        requirement_code: objective.requirementCode,
        description: objective.description,
      })),
      attributes: parsed.attributes.map((attr) => ({
        description: attr.description,
        schedule_print: attr.schedulePrint,
        name: attr.name,
        value: attr.value,
      })),
      gers,
      tags: parsed.tags,
    }
  })
}
