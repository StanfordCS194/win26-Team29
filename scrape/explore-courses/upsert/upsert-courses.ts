import { Effect, Option } from 'effect'
import { jsonArrayFrom, mergeAction } from 'kysely/helpers/postgres'
import { values } from '@db/helpers.ts'
import type { UploadCourseOffering } from './upsert-course.types.ts'
import { DbService } from '@scrape/shared/db-layer.ts'
import { Data, HashMap } from 'effect'

export class CourseOfferingUpsertError extends Data.TaggedError('CourseOfferingUpsertError')<{
  message: string
  courseOfferings: Array<{
    course_id: number
    subject_id: number
    code_number: number
    code_suffix: string | null
    year: string
  }>
  cause?: unknown
}> {}

export const upsertCourseOfferings = (courseOfferings: UploadCourseOffering[]) =>
  Effect.gen(function* () {
    const db = yield* DbService

    const result = yield* Effect.tryPromise({
      try: () =>
        db.transaction().execute(async (trx) => {
          const courseOfferingRecords = courseOfferings.map((co) => {
            const { sections, learningObjectives, attributes, gers, tags, ...rest } = co
            return rest
          })

          const mergeCourseOfferingsQuery = trx
            .mergeInto('course_offerings as trg')
            .using(values(courseOfferingRecords, 'src', { code_suffix: 'text' }), (join) =>
              join.on(({ eb, and, ref }) =>
                and([
                  eb(ref('trg.course_id'), '=', ref('src.course_id')),
                  eb(ref('trg.year'), '=', ref('src.year')),
                  eb(ref('trg.subject_id'), '=', ref('src.subject_id')),
                  eb(ref('trg.code_number'), '=', ref('src.code_number')),
                  eb(ref('trg.code_suffix'), '=', ref('src.code_suffix')),
                ]),
              ),
            )
            .whenMatched()
            .thenUpdateSet(({ ref }) => ({
              offer_number: ref('src.offer_number'),
              academic_career_id: ref('src.academic_career_id'),
              academic_group_id: ref('src.academic_group_id'),
              academic_organization_id: ref('src.academic_organization_id'),
              catalog_print: ref('src.catalog_print'),
              description: ref('src.description'),
              effective_status_id: ref('src.effective_status_id'),
              final_exam_flag_id: ref('src.final_exam_flag_id'),
              grading_option_id: ref('src.grading_option_id'),
              max_times_repeat: ref('src.max_times_repeat'),
              max_units_repeat: ref('src.max_units_repeat'),
              repeatable: ref('src.repeatable'),
              schedule_print: ref('src.schedule_print'),
              title: ref('src.title'),
              units_max: ref('src.units_max'),
              units_min: ref('src.units_min'),
            }))
            .whenNotMatched()
            .thenInsertValues(({ ref }) => ({
              course_id: ref('src.course_id'),
              year: ref('src.year'),
              subject_id: ref('src.subject_id'),
              code_number: ref('src.code_number'),
              code_suffix: ref('src.code_suffix'),
              offer_number: ref('src.offer_number'),
              academic_career_id: ref('src.academic_career_id'),
              academic_group_id: ref('src.academic_group_id'),
              academic_organization_id: ref('src.academic_organization_id'),
              catalog_print: ref('src.catalog_print'),
              description: ref('src.description'),
              effective_status_id: ref('src.effective_status_id'),
              final_exam_flag_id: ref('src.final_exam_flag_id'),
              grading_option_id: ref('src.grading_option_id'),
              max_times_repeat: ref('src.max_times_repeat'),
              max_units_repeat: ref('src.max_units_repeat'),
              repeatable: ref('src.repeatable'),
              schedule_print: ref('src.schedule_print'),
              title: ref('src.title'),
              units_max: ref('src.units_max'),
              units_min: ref('src.units_min'),
            }))
            .returning([
              'trg.id',
              'trg.course_id',
              'trg.subject_id',
              'trg.code_number',
              'trg.code_suffix',
              'trg.year',
              mergeAction().as('action'),
            ])

          const mergedCourseOfferings = await mergeCourseOfferingsQuery.execute()

          const courseOfferingIdMap = HashMap.fromIterable(
            mergedCourseOfferings.map(
              (mco) =>
                [
                  Data.struct({
                    course_id: mco.course_id,
                    subject_id: mco.subject_id,
                    code_number: mco.code_number,
                    code_suffix: mco.code_suffix,
                    year: mco.year,
                  }),
                  mco.id,
                ] as const,
            ),
          )

          const learningObjectiveRecords = courseOfferings.flatMap((co) => {
            const courseOfferingId = HashMap.get(courseOfferingIdMap, {
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            })
            if (Option.isNone(courseOfferingId)) return []

            return co.learningObjectives.map((lo) => ({
              course_offering_id: courseOfferingId.value,
              description: lo.description,
              requirement_code: lo.requirement_code,
            }))
          })

          if (learningObjectiveRecords.length > 0) {
            await trx
              .mergeInto('learning_objectives as trg')
              .using(values(learningObjectiveRecords, 'src'), (join) =>
                join.on(({ eb, and, ref }) =>
                  and([
                    eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
                    eb(ref('trg.requirement_code'), '=', ref('src.requirement_code')),
                    eb(ref('trg.description'), '=', ref('src.description')),
                  ]),
                ),
              )
              .whenNotMatched()
              .thenInsertValues(({ ref }) => ({
                course_offering_id: ref('src.course_offering_id'),
                requirement_code: ref('src.requirement_code'),
                description: ref('src.description'),
              }))
              .whenNotMatchedBySourceAnd((eb) =>
                eb('trg.course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap))),
              )
              .thenDelete()
              .execute()
          } else {
            await trx
              .deleteFrom('learning_objectives')
              .where('course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap)))
              .execute()
          }

          const attributeRecords = courseOfferings.flatMap((co) => {
            const courseOfferingId = HashMap.get(courseOfferingIdMap, {
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            })
            if (Option.isNone(courseOfferingId)) return []

            return co.attributes.map((attr) => ({
              course_offering_id: courseOfferingId.value,
              ...attr,
            }))
          })

          if (attributeRecords.length > 0) {
            await trx
              .mergeInto('course_offering_attributes as trg')
              .using(values(attributeRecords, 'src'), (join) =>
                join.on(({ eb, and, ref }) =>
                  and([
                    eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
                    eb(ref('trg.name'), '=', ref('src.name')),
                    eb(ref('trg.value'), '=', ref('src.value')),
                    eb(ref('trg.description'), '=', ref('src.description')),
                    eb(ref('trg.catalog_print'), '=', ref('src.catalog_print')),
                    eb(ref('trg.schedule_print'), '=', ref('src.schedule_print')),
                  ]),
                ),
              )
              .whenNotMatched()
              .thenInsertValues(({ ref }) => ({
                course_offering_id: ref('src.course_offering_id'),
                name: ref('src.name'),
                value: ref('src.value'),
                description: ref('src.description'),
                catalog_print: ref('src.catalog_print'),
                schedule_print: ref('src.schedule_print'),
              }))
              .whenNotMatchedBySourceAnd((eb) =>
                eb('trg.course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap))),
              )
              .thenDelete()
              .execute()
          } else {
            await trx
              .deleteFrom('course_offering_attributes')
              .where('course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap)))
              .execute()
          }

          const gerRecords = courseOfferings.flatMap((co) => {
            const courseOfferingId = HashMap.get(courseOfferingIdMap, {
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            })
            if (Option.isNone(courseOfferingId)) return []

            return co.gers.map((ger) => ({
              course_offering_id: courseOfferingId.value,
              ger_id: ger.ger_id,
            }))
          })

          if (gerRecords.length > 0) {
            await trx
              .mergeInto('course_offering_gers as trg')
              .using(values(gerRecords, 'src'), (join) =>
                join.on(({ eb, and, ref }) =>
                  and([
                    eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
                    eb(ref('trg.ger_id'), '=', ref('src.ger_id')),
                  ]),
                ),
              )
              .whenNotMatched()
              .thenInsertValues(({ ref }) => ({
                course_offering_id: ref('src.course_offering_id'),
                ger_id: ref('src.ger_id'),
              }))
              .whenNotMatchedBySourceAnd((eb) =>
                eb('trg.course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap))),
              )
              .thenDelete()
              .execute()
          } else {
            await trx
              .deleteFrom('course_offering_gers')
              .where('course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap)))
              .execute()
          }

          const tagRecords = courseOfferings.flatMap((co) => {
            const courseOfferingId = HashMap.get(courseOfferingIdMap, {
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            })
            if (Option.isNone(courseOfferingId)) return []

            return co.tags.map((tag) => ({
              course_offering_id: courseOfferingId.value,
              name: tag.name,
              organization: tag.organization,
            }))
          })

          if (tagRecords.length > 0) {
            await trx
              .mergeInto('course_offering_tags as trg')
              .using(values(tagRecords, 'src'), (join) =>
                join.on(({ eb, and, ref }) =>
                  and([
                    eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
                    eb(ref('trg.name'), '=', ref('src.name')),
                    eb(ref('trg.organization'), '=', ref('src.organization')),
                  ]),
                ),
              )
              .whenNotMatched()
              .thenInsertValues(({ ref }) => ({
                course_offering_id: ref('src.course_offering_id'),
                name: ref('src.name'),
                organization: ref('src.organization'),
              }))
              .whenNotMatchedBySourceAnd((eb) =>
                eb('trg.course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap))),
              )
              .thenDelete()
              .execute()
          } else {
            await trx
              .deleteFrom('course_offering_tags')
              .where('course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap)))
              .execute()
          }

          const sectionRecords = courseOfferings.flatMap((co) => {
            const courseOfferingId = HashMap.get(courseOfferingIdMap, {
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            })
            if (Option.isNone(courseOfferingId)) return []

            return co.sections.map((sec) => {
              const { attributes, schedules, ...rest } = sec
              return {
                course_offering_id: courseOfferingId.value,
                ...rest,
              }
            })
          })

          if (sectionRecords.length === 0) {
            await trx
              .deleteFrom('sections')
              .where('course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap)))
              .execute()
          } else {
            const mergedSections = (
              await trx
                .mergeInto('sections as trg')
                .using(
                  values(sectionRecords, 'src', {
                    term_quarter: 'quarter_type',
                    notes: 'text',
                    units_max: 'integer',
                    units_min: 'integer',
                  }),
                  (join) =>
                    join.on(({ eb, and, ref }) =>
                      and([
                        eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
                        eb(ref('trg.term_year'), '=', ref('src.term_year')),
                        eb(ref('trg.term_quarter'), '=', ref('src.term_quarter')),
                        eb(ref('trg.section_number'), '=', ref('src.section_number')),
                      ]),
                    ),
                )
                .whenMatched()
                .thenUpdateSet(({ ref }) => ({
                  term_id: ref('src.term_id'),
                  class_id: ref('src.class_id'),
                  term_quarter: ref('src.term_quarter'),
                  term_year: ref('src.term_year'),
                  component_type_id: ref('src.component_type_id'),
                  add_consent_id: ref('src.add_consent_id'),
                  drop_consent_id: ref('src.drop_consent_id'),
                  enroll_status_id: ref('src.enroll_status_id'),
                  current_class_size: ref('src.current_class_size'),
                  current_waitlist_size: ref('src.current_waitlist_size'),
                  max_class_size: ref('src.max_class_size'),
                  max_enrolled: ref('src.max_enrolled'),
                  max_waitlist: ref('src.max_waitlist'),
                  max_waitlist_size: ref('src.max_waitlist_size'),
                  notes: ref('src.notes'),
                  num_enrolled: ref('src.num_enrolled'),
                  num_waitlist: ref('src.num_waitlist'),
                  units_max: ref('src.units_max'),
                  units_min: ref('src.units_min'),
                }))
                .whenNotMatched()
                .thenInsertValues(({ ref }) => ({
                  course_offering_id: ref('src.course_offering_id'),
                  section_number: ref('src.section_number'),
                  term_id: ref('src.term_id'),
                  class_id: ref('src.class_id'),
                  term_quarter: ref('src.term_quarter'),
                  term_year: ref('src.term_year'),
                  component_type_id: ref('src.component_type_id'),
                  add_consent_id: ref('src.add_consent_id'),
                  drop_consent_id: ref('src.drop_consent_id'),
                  enroll_status_id: ref('src.enroll_status_id'),
                  current_class_size: ref('src.current_class_size'),
                  current_waitlist_size: ref('src.current_waitlist_size'),
                  max_class_size: ref('src.max_class_size'),
                  max_enrolled: ref('src.max_enrolled'),
                  max_waitlist: ref('src.max_waitlist'),
                  max_waitlist_size: ref('src.max_waitlist_size'),
                  notes: ref('src.notes'),
                  num_enrolled: ref('src.num_enrolled'),
                  num_waitlist: ref('src.num_waitlist'),
                  units_max: ref('src.units_max'),
                  units_min: ref('src.units_min'),
                }))
                .whenNotMatchedBySourceAnd((eb) =>
                  eb('trg.course_offering_id', 'in', Array.from(HashMap.values(courseOfferingIdMap))),
                )
                .thenDelete()
                .returning([
                  'trg.id',
                  'trg.course_offering_id',
                  'trg.term_year',
                  'trg.term_quarter',
                  'trg.section_number',
                  mergeAction().as('action'),
                ])
                .execute()
            ).filter((ms) => ms.action !== 'DELETE')

            const sectionIdMap = HashMap.fromIterable(
              mergedSections.map(
                (ms) =>
                  [
                    Data.struct({
                      course_offering_id: ms.course_offering_id,
                      term_year: ms.term_year,
                      term_quarter: ms.term_quarter,
                      section_number: ms.section_number,
                    }),
                    ms.id,
                  ] as const,
              ),
            )

            const sectionAttributeRecords = courseOfferings.flatMap((co) => {
              const courseOfferingId = HashMap.get(courseOfferingIdMap, {
                course_id: co.course_id,
                subject_id: co.subject_id,
                code_number: co.code_number,
                code_suffix: co.code_suffix,
                year: co.year,
              })
              if (Option.isNone(courseOfferingId)) return []

              return co.sections.flatMap((sec) => {
                const sectionId = HashMap.get(
                  sectionIdMap,
                  Data.struct({
                    course_offering_id: courseOfferingId.value,
                    term_year: sec.term_year,
                    term_quarter: sec.term_quarter,
                    section_number: sec.section_number,
                  }),
                )
                if (Option.isNone(sectionId)) return []

                return sec.attributes.map((attr) => ({
                  section_id: sectionId.value,
                  ...attr,
                }))
              })
            })

            if (sectionAttributeRecords.length === 0) {
              await trx
                .deleteFrom('section_attributes')
                .where('section_id', 'in', Array.from(HashMap.values(sectionIdMap)))
                .execute()
            } else {
              await trx
                .mergeInto('section_attributes as trg')
                .using(values(sectionAttributeRecords, 'src'), (join) =>
                  join.on(({ eb, and, ref }) =>
                    and([
                      eb(ref('trg.section_id'), '=', ref('src.section_id')),
                      eb(ref('trg.name'), '=', ref('src.name')),
                      eb(ref('trg.value'), '=', ref('src.value')),
                      eb(ref('trg.description'), '=', ref('src.description')),
                      eb(ref('trg.catalog_print'), '=', ref('src.catalog_print')),
                      eb(ref('trg.schedule_print'), '=', ref('src.schedule_print')),
                    ]),
                  ),
                )
                .whenNotMatched()
                .thenInsertValues(({ ref }) => ({
                  section_id: ref('src.section_id'),
                  name: ref('src.name'),
                  value: ref('src.value'),
                  description: ref('src.description'),
                  catalog_print: ref('src.catalog_print'),
                  schedule_print: ref('src.schedule_print'),
                }))
                .whenNotMatchedBySourceAnd((eb) =>
                  eb('trg.section_id', 'in', Array.from(HashMap.values(sectionIdMap))),
                )
                .thenDelete()
                .execute()
            }

            const scheduleRecords = courseOfferings.flatMap((co) => {
              const courseOfferingId = HashMap.get(courseOfferingIdMap, {
                course_id: co.course_id,
                subject_id: co.subject_id,
                code_number: co.code_number,
                code_suffix: co.code_suffix,
                year: co.year,
              })
              if (Option.isNone(courseOfferingId)) return []

              return co.sections.flatMap((sec) => {
                const sectionId = HashMap.get(
                  sectionIdMap,
                  Data.struct({
                    course_offering_id: courseOfferingId.value,
                    term_year: sec.term_year,
                    term_quarter: sec.term_quarter,
                    section_number: sec.section_number,
                  }),
                )
                if (Option.isNone(sectionId)) return []

                return sec.schedules.map((sched) => {
                  const { instructors, ...rest } = sched
                  return {
                    section_id: sectionId.value,
                    ...rest,
                  }
                })
              })
            })

            if (scheduleRecords.length === 0) {
              await trx
                .deleteFrom('schedules')
                .where('section_id', 'in', Array.from(HashMap.values(sectionIdMap)))
                .execute()
            } else {
              const schedulesQuery = trx
                .mergeInto('schedules as trg')
                .using(
                  values(scheduleRecords, 'src', {
                    days: 'weekday_type[]',
                    end_date: 'date',
                    end_time: 'time',
                    location: 'text',
                    start_date: 'date',
                    start_time: 'time',
                  }),
                  (join) =>
                    join.on(({ eb, and, ref }) =>
                      and([
                        eb(ref('trg.section_id'), '=', ref('src.section_id')),
                        eb(ref('trg.start_date'), '=', ref('src.start_date')),
                        eb(ref('trg.end_date'), '=', ref('src.end_date')),
                        eb(ref('trg.days'), '=', ref('src.days')),
                        eb(ref('trg.start_time'), '=', ref('src.start_time')),
                        eb(ref('trg.end_time'), '=', ref('src.end_time')),
                        eb(ref('trg.location'), '=', ref('src.location')),
                      ]),
                    ),
                )
                .whenMatched()
                .thenUpdateSet(({ ref }) => ({
                  section_id: ref('src.section_id'),
                }))
                .whenNotMatched()
                .thenInsertValues(({ ref }) => ({
                  section_id: ref('src.section_id'),
                  start_date: ref('src.start_date'),
                  end_date: ref('src.end_date'),
                  days: ref('src.days'),
                  start_time: ref('src.start_time'),
                  end_time: ref('src.end_time'),
                  location: ref('src.location'),
                }))
                .whenNotMatchedBySourceAnd((eb) =>
                  eb('trg.section_id', 'in', Array.from(HashMap.values(sectionIdMap))),
                )
                .thenDelete()
                .returning([
                  'trg.id',
                  'trg.section_id',
                  'trg.start_date',
                  'trg.end_date',
                  'trg.start_time',
                  'trg.end_time',
                  'trg.location',
                  mergeAction().as('action'),
                ])

              const mergedSchedules = (await schedulesQuery.execute()).filter((ms) => ms.action !== 'DELETE')

              const scheduleIdMap = HashMap.fromIterable(
                mergedSchedules.map(
                  (ms) =>
                    [
                      Data.struct({
                        section_id: ms.section_id,
                        start_date: ms.start_date,
                        end_date: ms.end_date,
                        start_time: ms.start_time,
                        end_time: ms.end_time,
                        location: ms.location,
                      }),
                      ms.id,
                    ] as const,
                ),
              )

              const scheduleInstructorRecords = courseOfferings.flatMap((co) => {
                const courseOfferingId = HashMap.get(courseOfferingIdMap, {
                  course_id: co.course_id,
                  subject_id: co.subject_id,
                  code_number: co.code_number,
                  code_suffix: co.code_suffix,
                  year: co.year,
                })
                if (Option.isNone(courseOfferingId)) return []

                return co.sections.flatMap((sec) => {
                  const sectionId = HashMap.get(
                    sectionIdMap,
                    Data.struct({
                      course_offering_id: courseOfferingId.value,
                      term_year: sec.term_year,
                      term_quarter: sec.term_quarter,
                      section_number: sec.section_number,
                    }),
                  )
                  if (Option.isNone(sectionId)) return []

                  return sec.schedules.flatMap((sched) => {
                    const scheduleId = HashMap.get(
                      scheduleIdMap,
                      Data.struct({
                        section_id: sectionId.value,
                        start_date: sched.start_date,
                        end_date: sched.end_date,
                        start_time: sched.start_time,
                        end_time: sched.end_time,
                        location: sched.location,
                      }),
                    )
                    if (Option.isNone(scheduleId)) return []

                    return sched.instructors.map((inst) => ({
                      schedule_id: scheduleId.value,
                      instructor_id: inst.instructor_id,
                      instructor_role_id: inst.instructor_role_id,
                    }))
                  })
                })
              })

              if (scheduleInstructorRecords.length > 0) {
                await trx
                  .mergeInto('schedule_instructors as trg')
                  .using(values(scheduleInstructorRecords, 'src'), (join) =>
                    join.on(({ eb, and, ref }) =>
                      and([
                        eb(ref('trg.schedule_id'), '=', ref('src.schedule_id')),
                        eb(ref('trg.instructor_id'), '=', ref('src.instructor_id')),
                      ]),
                    ),
                  )
                  .whenMatched()
                  .thenUpdateSet(({ ref }) => ({
                    instructor_role_id: ref('src.instructor_role_id'),
                  }))
                  .whenNotMatched()
                  .thenInsertValues(({ ref }) => ({
                    schedule_id: ref('src.schedule_id'),
                    instructor_id: ref('src.instructor_id'),
                    instructor_role_id: ref('src.instructor_role_id'),
                  }))
                  .whenNotMatchedBySourceAnd((eb) =>
                    eb('trg.schedule_id', 'in', Array.from(HashMap.values(scheduleIdMap))),
                  )
                  .thenDelete()
                  .execute()
              } else {
                await trx
                  .deleteFrom('schedule_instructors')
                  .where('schedule_id', 'in', Array.from(HashMap.values(scheduleIdMap)))
                  .execute()
              }
            }
          }

          const finalResult = await trx
            .selectFrom('course_offerings as co')
            .where('co.id', 'in', Array.from(HashMap.values(courseOfferingIdMap)))
            .select((eb) => [
              'co.id',
              'co.course_id',
              'co.subject_id',
              'co.code_number',
              'co.year',
              jsonArrayFrom(
                eb
                  .selectFrom('sections as s')
                  .whereRef('s.course_offering_id', '=', 'co.id')
                  .select((eb2) => [
                    's.id',
                    's.term_year',
                    's.term_quarter',
                    's.section_number',
                    jsonArrayFrom(
                      eb2
                        .selectFrom('section_attributes as sa')
                        .whereRef('sa.section_id', '=', 's.id')
                        .select(['sa.id', 'sa.name', 'sa.value']),
                    ).as('attributes'),
                    jsonArrayFrom(
                      eb2
                        .selectFrom('schedules as sch')
                        .whereRef('sch.section_id', '=', 's.id')
                        .select((eb3) => [
                          'sch.id',
                          'sch.start_date',
                          jsonArrayFrom(
                            eb3
                              .selectFrom('schedule_instructors as si')
                              .whereRef('si.schedule_id', '=', 'sch.id')
                              .select(['si.id', 'si.instructor_id', 'si.instructor_role_id']),
                          ).as('instructors'),
                        ]),
                    ).as('schedules'),
                  ]),
              ).as('sections'),
              jsonArrayFrom(
                eb
                  .selectFrom('learning_objectives as lo')
                  .whereRef('lo.course_offering_id', '=', 'co.id')
                  .select(['lo.id', 'lo.description', 'lo.requirement_code']),
              ).as('learning_objectives'),
              jsonArrayFrom(
                eb
                  .selectFrom('course_offering_attributes as coa')
                  .whereRef('coa.course_offering_id', '=', 'co.id')
                  .select(['coa.id', 'coa.name', 'coa.value']),
              ).as('attributes'),
              jsonArrayFrom(
                eb
                  .selectFrom('course_offering_gers as cog')
                  .whereRef('cog.course_offering_id', '=', 'co.id')
                  .select(['cog.id', 'cog.ger_id']),
              ).as('gers'),
              jsonArrayFrom(
                eb
                  .selectFrom('course_offering_tags as cot')
                  .whereRef('cot.course_offering_id', '=', 'co.id')
                  .select(['cot.id', 'cot.name', 'cot.organization']),
              ).as('tags'),
            ])
            .execute()

          return finalResult
        }),
      catch: (error) =>
        new CourseOfferingUpsertError({
          message: `Failed to upsert course offerings: ${error instanceof Error ? error.message : String(error)}`,
          courseOfferings: courseOfferings.map((co) => ({
            course_id: co.course_id,
            subject_id: co.subject_id,
            code_number: co.code_number,
            code_suffix: co.code_suffix,
            year: co.year,
          })),
          cause: error,
        }),
    })

    return { course_offerings: result }
  })
