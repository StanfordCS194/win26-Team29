import { values } from '@db/helpers.ts'
import { Data, Effect, Equal, HashMap, HashSet, MutableHashMap, Option } from 'effect'
import { mergeAction } from 'kysely/helpers/postgres'

import { DbService } from '@scrape/shared/db-layer.ts'
import type { Quarter } from '@scrape/shared/schemas.ts'

import type { UploadCourseOffering, UploadSchedule } from './upsert-courses.types.ts'

export class CourseOfferingUpsertError extends Data.TaggedError('CourseOfferingUpsertError')<{
  message: string
  step: string
  recordCount?: number
  courseOfferings: Array<{
    course_id: number
    subject_id: number
    code_number: number
    code_suffix: string | null
    year: string
  }>
  cause?: unknown
}> {}

async function traced<T>(step: string, fn: () => Promise<T>, context?: { recordCount?: number }): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw Object.assign(new Error(`[${step}] ${msg}`), {
      step,
      recordCount: context?.recordCount,
      originalError: error,
    })
  }
}

const scheduleStruct = (s: UploadSchedule & { section_id: bigint }) =>
  Data.struct({
    section_id: s.section_id,
    start_date: s.start_date,
    end_date: s.end_date,
    days: Option.map(Option.fromNullable(s.days), (days) => Data.array(days)),
    start_time: s.start_time,
    end_time: s.end_time,
    location: s.location,
    instructors: HashSet.fromIterable(
      s.instructors.map((i) =>
        Data.struct({
          instructor_id: i.instructor_id,
          instructor_role_id: i.instructor_role_id,
        }),
      ),
    ),
  })

export const upsertCourseOfferings = (rawCourseOfferings: Array<UploadCourseOffering>) =>
  Effect.gen(function* () {
    const db = yield* DbService

    // ============================================================
    // PRE-STEP: Deduplicate sections within each course offering
    // ============================================================
    const courseOfferings = rawCourseOfferings.map((co) => {
      const sectionMap = MutableHashMap.empty<
        { term_quarter: Quarter; section_number: string },
        (typeof co.sections)[number]
      >()

      const sectionScore = (sec: (typeof co.sections)[number]) => ({
        numEnrolled: sec.num_enrolled,
        numSchedules: sec.schedules.length,
        numInstructors: sec.schedules.reduce((sum, s) => sum + s.instructors.length, 0),
      })

      const preferNew = (
        existing: (typeof co.sections)[number],
        incoming: (typeof co.sections)[number],
      ): boolean => {
        const e = sectionScore(existing)
        const n = sectionScore(incoming)
        if (n.numEnrolled !== e.numEnrolled) {
          return n.numEnrolled > e.numEnrolled
        }
        if (n.numSchedules !== e.numSchedules) {
          return n.numSchedules > e.numSchedules
        }
        return n.numInstructors > e.numInstructors
      }

      for (const sec of co.sections) {
        const key = Data.struct({
          term_quarter: sec.term_quarter,
          section_number: sec.section_number,
        })
        const existing = MutableHashMap.get(sectionMap, key)

        if (Option.isNone(existing)) {
          MutableHashMap.set(sectionMap, key, sec)
        } else if (preferNew(existing.value, sec)) {
          MutableHashMap.set(sectionMap, key, sec)
        }
      }

      return { ...co, sections: Array.from(MutableHashMap.values(sectionMap)) }
    })

    const courseOfferingSummary = courseOfferings.map((co) => ({
      course_id: co.course_id,
      subject_id: co.subject_id,
      code_number: co.code_number,
      code_suffix: co.code_suffix,
      year: co.year,
    }))

    yield* Effect.tryPromise({
      try: async () => {
        // ============================================================
        // STEP 1: Merge Course Offerings
        // ============================================================
        const courseOfferingRecords = courseOfferings.map((co) => {
          const { sections, learningObjectives, attributes, gers, tags, ...rest } = co
          return rest
        })

        const mergedCourseOfferings = await traced(
          'merge_course_offerings',
          () =>
            db
              .mergeInto('course_offerings as trg')
              .using(values(courseOfferingRecords, 'src', { code_suffix: 'text' }), (join) =>
                join.on(({ eb, and, ref }) =>
                  and([
                    eb(ref('trg.course_id'), '=', ref('src.course_id')),
                    eb(ref('trg.year'), '=', ref('src.year')),
                    eb(ref('trg.subject_id'), '=', ref('src.subject_id')),
                    eb(ref('trg.code_number'), '=', ref('src.code_number')),
                    eb(ref('trg.code_suffix'), 'is not distinct from', ref('src.code_suffix')),
                  ]),
                ),
              )
              .whenMatched()
              .thenUpdateSet(({ ref }) => ({
                offer_number: ref('src.offer_number'),
                academic_career_id: ref('src.academic_career_id'),
                academic_group_id: ref('src.academic_group_id'),
                academic_organization_id: ref('src.academic_organization_id'),
                description: ref('src.description'),
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
                description: ref('src.description'),
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
              .execute(),
          { recordCount: courseOfferingRecords.length },
        )

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

        const courseOfferingIds = Array.from(HashMap.values(courseOfferingIdMap))

        // ============================================================
        // STEP 2: Course Offering Child Tables (parallel)
        // ============================================================
        await Promise.all([
          // Learning Objectives
          (async () => {
            const learningObjectiveRecords = courseOfferings.flatMap((co) => {
              const courseOfferingId = HashMap.get(
                courseOfferingIdMap,
                Data.struct({
                  course_id: co.course_id,
                  subject_id: co.subject_id,
                  code_number: co.code_number,
                  code_suffix: co.code_suffix,
                  year: co.year,
                }),
              )
              if (Option.isNone(courseOfferingId)) {
                return []
              }

              return co.learningObjectives.map((lo) => ({
                course_offering_id: courseOfferingId.value,
                description: lo.description,
                requirement_code: lo.requirement_code,
              }))
            })

            if (learningObjectiveRecords.length > 0) {
              await traced(
                'merge_learning_objectives',
                () =>
                  db
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
                    .whenNotMatchedBySourceAnd((eb) => eb('trg.course_offering_id', 'in', courseOfferingIds))
                    .thenDelete()
                    .execute(),
                { recordCount: learningObjectiveRecords.length },
              )
            } else {
              await traced('delete_learning_objectives', () =>
                db
                  .deleteFrom('learning_objectives')
                  .where('course_offering_id', 'in', courseOfferingIds)
                  .execute(),
              )
            }
          })(),

          // Attributes
          (async () => {
            const attributeRecords = courseOfferings.flatMap((co) => {
              const courseOfferingId = HashMap.get(
                courseOfferingIdMap,
                Data.struct({
                  course_id: co.course_id,
                  subject_id: co.subject_id,
                  code_number: co.code_number,
                  code_suffix: co.code_suffix,
                  year: co.year,
                }),
              )
              if (Option.isNone(courseOfferingId)) {
                return []
              }

              return co.attributes.map((attr) => ({
                course_offering_id: courseOfferingId.value,
                ...attr,
              }))
            })

            if (attributeRecords.length > 0) {
              await traced(
                'merge_course_offering_attributes',
                () =>
                  db
                    .mergeInto('course_offering_attributes as trg')
                    .using(values(attributeRecords, 'src'), (join) =>
                      join.on(({ eb, and, ref }) =>
                        and([
                          eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
                          eb(ref('trg.name'), '=', ref('src.name')),
                          eb(ref('trg.value'), '=', ref('src.value')),
                          eb(ref('trg.description'), '=', ref('src.description')),
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
                      schedule_print: ref('src.schedule_print'),
                    }))
                    .whenNotMatchedBySourceAnd((eb) => eb('trg.course_offering_id', 'in', courseOfferingIds))
                    .thenDelete()
                    .execute(),
                { recordCount: attributeRecords.length },
              )
            } else {
              await traced('delete_course_offering_attributes', () =>
                db
                  .deleteFrom('course_offering_attributes')
                  .where('course_offering_id', 'in', courseOfferingIds)
                  .execute(),
              )
            }
          })(),

          // GERs
          (async () => {
            const gerRecords = courseOfferings.flatMap((co) => {
              const courseOfferingId = HashMap.get(
                courseOfferingIdMap,
                Data.struct({
                  course_id: co.course_id,
                  subject_id: co.subject_id,
                  code_number: co.code_number,
                  code_suffix: co.code_suffix,
                  year: co.year,
                }),
              )
              if (Option.isNone(courseOfferingId)) {
                return []
              }

              return co.gers.map((ger) => ({
                course_offering_id: courseOfferingId.value,
                ger_id: ger.ger_id,
              }))
            })

            if (gerRecords.length > 0) {
              await traced(
                'merge_course_offering_gers',
                () =>
                  db
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
                    .whenNotMatchedBySourceAnd((eb) => eb('trg.course_offering_id', 'in', courseOfferingIds))
                    .thenDelete()
                    .execute(),
                { recordCount: gerRecords.length },
              )
            } else {
              await traced('delete_course_offering_gers', () =>
                db
                  .deleteFrom('course_offering_gers')
                  .where('course_offering_id', 'in', courseOfferingIds)
                  .execute(),
              )
            }
          })(),

          // Tags
          (async () => {
            const tagRecords = courseOfferings.flatMap((co) => {
              const courseOfferingId = HashMap.get(
                courseOfferingIdMap,
                Data.struct({
                  course_id: co.course_id,
                  subject_id: co.subject_id,
                  code_number: co.code_number,
                  code_suffix: co.code_suffix,
                  year: co.year,
                }),
              )
              if (Option.isNone(courseOfferingId)) {
                return []
              }

              return co.tags.map((tag) => ({
                course_offering_id: courseOfferingId.value,
                name: tag.name,
                organization: tag.organization,
              }))
            })

            if (tagRecords.length > 0) {
              await traced(
                'merge_course_offering_tags',
                () =>
                  db
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
                    .whenNotMatchedBySourceAnd((eb) => eb('trg.course_offering_id', 'in', courseOfferingIds))
                    .thenDelete()
                    .execute(),
                { recordCount: tagRecords.length },
              )
            } else {
              await traced('delete_course_offering_tags', () =>
                db
                  .deleteFrom('course_offering_tags')
                  .where('course_offering_id', 'in', courseOfferingIds)
                  .execute(),
              )
            }
          })(),
        ])

        // ============================================================
        // STEP 3: Merge Sections
        // ============================================================
        const sectionRecords = courseOfferings.flatMap((co) => {
          const courseOfferingId = HashMap.get(
            courseOfferingIdMap,
            Data.struct({
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            }),
          )
          if (Option.isNone(courseOfferingId)) {
            return []
          }

          return co.sections.map((sec) => {
            const { attributes, schedules, ...rest } = sec
            return {
              course_offering_id: courseOfferingId.value,
              ...rest,
            }
          })
        })

        let sectionIdMap: HashMap.HashMap<
          {
            course_offering_id: bigint
            term_quarter: string
            section_number: string
          },
          bigint
        > = HashMap.empty()

        if (sectionRecords.length === 0) {
          await traced('delete_sections_all', () =>
            db.deleteFrom('sections').where('course_offering_id', 'in', courseOfferingIds).execute(),
          )
        } else {
          const mergedSections = (
            await traced(
              'merge_sections',
              () =>
                db
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
                  .whenNotMatchedBySourceAnd((eb) => eb('trg.course_offering_id', 'in', courseOfferingIds))
                  .thenDelete()
                  .returning([
                    'trg.id',
                    'trg.course_offering_id',
                    'trg.term_quarter',
                    'trg.section_number',
                    mergeAction().as('action'),
                  ])
                  .execute(),
              { recordCount: sectionRecords.length },
            )
          ).filter((ms) => ms.action !== 'DELETE')

          sectionIdMap = HashMap.fromIterable(
            mergedSections.map(
              (ms) =>
                [
                  Data.struct({
                    course_offering_id: ms.course_offering_id,
                    term_quarter: ms.term_quarter,
                    section_number: ms.section_number,
                  }),
                  ms.id,
                ] as const,
            ),
          )
        }

        const sectionIds = Array.from(HashMap.values(sectionIdMap))

        // ============================================================
        // STEP 4: Section Attributes
        // ============================================================
        const sectionAttributeRecords = courseOfferings.flatMap((co) => {
          const courseOfferingId = HashMap.get(
            courseOfferingIdMap,
            Data.struct({
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            }),
          )
          if (Option.isNone(courseOfferingId)) {
            return []
          }

          return co.sections.flatMap((sec) => {
            const sectionId = HashMap.get(
              sectionIdMap,
              Data.struct({
                course_offering_id: courseOfferingId.value,
                term_quarter: sec.term_quarter,
                section_number: sec.section_number,
              }),
            )
            if (Option.isNone(sectionId)) {
              return []
            }

            return sec.attributes.map((attr) => ({
              section_id: sectionId.value,
              ...attr,
            }))
          })
        })

        if (sectionAttributeRecords.length === 0) {
          if (sectionIds.length > 0) {
            await traced('delete_section_attributes', () =>
              db.deleteFrom('section_attributes').where('section_id', 'in', sectionIds).execute(),
            )
          }
        } else {
          await traced(
            'merge_section_attributes',
            () =>
              db
                .mergeInto('section_attributes as trg')
                .using(values(sectionAttributeRecords, 'src'), (join) =>
                  join.on(({ eb, and, ref }) =>
                    and([
                      eb(ref('trg.section_id'), '=', ref('src.section_id')),
                      eb(ref('trg.name'), '=', ref('src.name')),
                      eb(ref('trg.value'), '=', ref('src.value')),
                      eb(ref('trg.description'), '=', ref('src.description')),
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
                  schedule_print: ref('src.schedule_print'),
                }))
                .whenNotMatchedBySourceAnd((eb) => eb('trg.section_id', 'in', sectionIds))
                .thenDelete()
                .execute(),
            { recordCount: sectionAttributeRecords.length },
          )
        }

        // ============================================================
        // STEP 5: Schedules + Instructors
        // ============================================================

        // Build incoming schedule records (with instructors kept aside)
        const scheduleWithInstructorRecords = courseOfferings.flatMap((co) => {
          const courseOfferingId = HashMap.get(
            courseOfferingIdMap,
            Data.struct({
              course_id: co.course_id,
              subject_id: co.subject_id,
              code_number: co.code_number,
              code_suffix: co.code_suffix,
              year: co.year,
            }),
          )
          if (Option.isNone(courseOfferingId)) {
            return []
          }

          return co.sections.flatMap((sec) => {
            const sectionId = HashMap.get(
              sectionIdMap,
              Data.struct({
                course_offering_id: courseOfferingId.value,
                term_quarter: sec.term_quarter,
                section_number: sec.section_number,
              }),
            )
            if (Option.isNone(sectionId)) {
              return []
            }

            return sec.schedules.map((sched) => ({
              section_id: sectionId.value,
              start_date: sched.start_date,
              end_date: sched.end_date,
              days: sched.days,
              start_time: sched.start_time,
              end_time: sched.end_time,
              location: sched.location,
              instructors: sched.instructors,
            }))
          })
        })

        // Fetch existing schedules + instructors for diffing
        const existingScheduleRows =
          sectionIds.length > 0
            ? await traced('fetch_existing_schedules', () =>
                db.selectFrom('schedules').where('section_id', 'in', sectionIds).selectAll().execute(),
              )
            : []

        const existingInstructorRows =
          existingScheduleRows.length > 0
            ? await traced('fetch_existing_schedule_instructors', () =>
                db
                  .selectFrom('schedule_instructors')
                  .where(
                    'schedule_id',
                    'in',
                    existingScheduleRows.map((s) => s.id),
                  )
                  .selectAll()
                  .execute(),
              )
            : []

        const instructorsByScheduleId = new Map<bigint, typeof existingInstructorRows>()
        for (const inst of existingInstructorRows) {
          const arr = instructorsByScheduleId.get(inst.schedule_id) ?? []
          arr.push(inst)
          instructorsByScheduleId.set(inst.schedule_id, arr)
        }

        type ScheduleSet = HashSet.HashSet<ReturnType<typeof scheduleStruct>>

        const existingSetBySection = new Map<bigint, ScheduleSet>()
        for (const s of existingScheduleRows) {
          const instructors = (instructorsByScheduleId.get(s.id) ?? []).map((i) => ({
            instructor_id: i.instructor_id,
            instructor_role_id: i.instructor_role_id,
          }))
          const struct = scheduleStruct({ ...s, instructors })
          const existing = existingSetBySection.get(s.section_id) ?? HashSet.empty()
          existingSetBySection.set(s.section_id, HashSet.add(existing, struct))
        }

        const incomingSetBySection = new Map<bigint, ScheduleSet>()
        for (const s of scheduleWithInstructorRecords) {
          const struct = scheduleStruct(s)
          const existing = incomingSetBySection.get(s.section_id) ?? HashSet.empty()
          incomingSetBySection.set(s.section_id, HashSet.add(existing, struct))
        }

        // Diff: find sections that actually changed
        const allSectionIds = new Set([...existingSetBySection.keys(), ...incomingSetBySection.keys()])
        const changedSectionIds: Array<bigint> = []

        for (const sectionId of allSectionIds) {
          const existingSet = existingSetBySection.get(sectionId) ?? HashSet.empty()
          const incomingSet = incomingSetBySection.get(sectionId) ?? HashSet.empty()
          if (!Equal.equals(existingSet, incomingSet)) {
            changedSectionIds.push(sectionId)
          }
        }

        if (changedSectionIds.length > 0) {
          // Bulk delete all schedules (cascades to schedule_instructors) for changed sections
          await traced('delete_schedules_for_changed_sections', () =>
            db.deleteFrom('schedules').where('section_id', 'in', changedSectionIds).execute(),
          )

          // Collect all schedule insert records for changed sections, preserving order
          const changedSectionIdSet = new Set(changedSectionIds)
          const schedulesToInsert = scheduleWithInstructorRecords.filter((s) =>
            changedSectionIdSet.has(s.section_id),
          )

          if (schedulesToInsert.length > 0) {
            // Bulk insert — RETURNING id comes back in insertion order
            const insertedSchedules = await traced(
              'bulk_insert_schedules',
              () =>
                db
                  .insertInto('schedules')
                  .values(
                    schedulesToInsert.map((s) => ({
                      section_id: s.section_id,
                      start_date: s.start_date,
                      end_date: s.end_date,
                      days: s.days,
                      start_time: s.start_time,
                      end_time: s.end_time,
                      location: s.location,
                    })),
                  )
                  .returning([
                    'id',
                    'section_id',
                    'start_date',
                    'end_date',
                    'start_time',
                    'end_time',
                    'location',
                  ])
                  .execute(),
              { recordCount: schedulesToInsert.length },
            )

            // Sanity check: verify returned rows match insertion order
            for (let i = 0; i < insertedSchedules.length; i++) {
              const returned = insertedSchedules[i]
              const expected = schedulesToInsert[i]
              if (
                returned.section_id !== expected.section_id ||
                !Equal.equals(returned.start_date, expected.start_date) ||
                !Equal.equals(returned.end_date, expected.end_date) ||
                !Equal.equals(returned.start_time, expected.start_time) ||
                !Equal.equals(returned.end_time, expected.end_time) ||
                returned.location !== expected.location
              ) {
                console.error(
                  `Sanity check failed: returned ${JSON.stringify(returned)} does not match expected ${JSON.stringify(expected)}`,
                )
              }
            }

            // Zip returned IDs with original records to build instructor inserts
            const instructorRecords = insertedSchedules.flatMap((inserted, i) => {
              const original = schedulesToInsert[i]
              return original.instructors.map((inst) => ({
                schedule_id: inserted.id,
                instructor_id: inst.instructor_id,
                instructor_role_id: inst.instructor_role_id,
              }))
            })

            if (instructorRecords.length > 0) {
              await traced(
                'bulk_insert_schedule_instructors',
                () => db.insertInto('schedule_instructors').values(instructorRecords).execute(),
                { recordCount: instructorRecords.length },
              )
            }
          }
        }
      },
      catch: (error) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const step = (error as any)?.step ?? 'unknown'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recordCount = (error as any)?.recordCount
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const originalError = (error as any)?.originalError ?? error
        const msg = originalError instanceof Error ? originalError.message : String(originalError)

        return new CourseOfferingUpsertError({
          message: `Failed to upsert course offerings at [${step}]:\n ${msg}`,
          step,
          recordCount,
          courseOfferings: courseOfferingSummary,
          cause: originalError,
        })
      },
    })
  })
