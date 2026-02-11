import { values } from '@db/helpers.ts'
import { Data, Effect, Equal, HashMap, HashSet, MutableHashMap, Option } from 'effect'
import { mergeAction } from 'kysely/helpers/postgres'

import { DbService } from '@scrape/shared/db-layer.ts'
import type { EffectTemporal } from '@scrape/shared/effect-temporal.ts'
import type { Quarter, Weekday } from '@scrape/shared/schemas.ts'

import type { UploadCourseOffering, UploadSchedule } from './upsert-courses.types.ts'

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CourseSummary = CourseOfferingUpsertError['courseOfferings']

/**
 * Wraps a single database call in `Effect.tryPromise`, attaching structured
 * error metadata so every failure surfaces the step name and record count.
 */
const dbStep = <T>(
  step: string,
  fn: (db: Effect.Effect.Success<typeof DbService>) => Promise<T>,
  context: { summary: CourseSummary; recordCount?: number },
) =>
  Effect.gen(function* () {
    const db = yield* DbService
    return yield* Effect.tryPromise({
      try: () => fn(db),
      catch: (error) => {
        const msg = error instanceof Error ? error.message : String(error)
        return new CourseOfferingUpsertError({
          message: `Failed at [${step}]: ${msg}`,
          step,
          recordCount: context.recordCount,
          courseOfferings: context.summary,
          cause: error,
        })
      },
    })
  })

const scheduleStruct = (s: UploadSchedule & { section_id: number }) =>
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

/**
 * Look up a course offering's id from the merge result map.
 * Returns `Option<number>`.
 */
const getCourseOfferingId = (
  co: UploadCourseOffering,
  idMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
) =>
  HashMap.get(
    idMap,
    Data.struct({
      course_id: co.course_id,
      subject_id: co.subject_id,
      code_number: co.code_number,
      code_suffix: co.code_suffix,
      year: co.year,
    }),
  )

// ---------------------------------------------------------------------------
// Pre-step: deduplicate sections within each course offering
// ---------------------------------------------------------------------------

const deduplicateSections = (rawCourseOfferings: ReadonlyArray<UploadCourseOffering>) =>
  rawCourseOfferings.map((co) => {
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
      if (n.numEnrolled !== e.numEnrolled) return n.numEnrolled > e.numEnrolled
      if (n.numSchedules !== e.numSchedules) return n.numSchedules > e.numSchedules
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

// ---------------------------------------------------------------------------
// Step 1: Merge course offerings
// ---------------------------------------------------------------------------

const mergeCourseOfferings = (courseOfferings: ReadonlyArray<UploadCourseOffering>, summary: CourseSummary) =>
  Effect.gen(function* () {
    const courseOfferingRecords = courseOfferings.map((co) => {
      const { sections, learningObjectives, attributes, gers, tags, ...rest } = co
      return rest
    })

    const mergedCourseOfferings = yield* dbStep(
      'merge_course_offerings',
      (db) =>
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
      { summary, recordCount: courseOfferingRecords.length },
    )

    return HashMap.fromIterable(
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
  })

// ---------------------------------------------------------------------------
// Step 2: Course offering child tables (parallel)
// ---------------------------------------------------------------------------

const upsertLearningObjectives = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  courseOfferingIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const records = courseOfferings.flatMap((co) => {
      const id = getCourseOfferingId(co, coIdMap)
      if (Option.isNone(id)) return []
      return co.learningObjectives.map((lo) => ({
        course_offering_id: id.value,
        description: lo.description,
        requirement_code: lo.requirement_code,
      }))
    })

    if (records.length > 0) {
      yield* dbStep(
        'merge_learning_objectives',
        (db) =>
          db
            .mergeInto('learning_objectives as trg')
            .using(values(records, 'src'), (join) =>
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
        { summary, recordCount: records.length },
      )
    } else {
      yield* dbStep(
        'delete_learning_objectives',
        (db) =>
          db.deleteFrom('learning_objectives').where('course_offering_id', 'in', courseOfferingIds).execute(),
        { summary },
      )
    }
  })

const upsertAttributes = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  courseOfferingIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const records = courseOfferings.flatMap((co) => {
      const id = getCourseOfferingId(co, coIdMap)
      if (Option.isNone(id)) return []
      return co.attributes.map((attr) => ({
        course_offering_id: id.value,
        ...attr,
      }))
    })

    if (records.length > 0) {
      yield* dbStep(
        'merge_course_offering_attributes',
        (db) =>
          db
            .mergeInto('course_offering_attributes as trg')
            .using(values(records, 'src'), (join) =>
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
        { summary, recordCount: records.length },
      )
    } else {
      yield* dbStep(
        'delete_course_offering_attributes',
        (db) =>
          db
            .deleteFrom('course_offering_attributes')
            .where('course_offering_id', 'in', courseOfferingIds)
            .execute(),
        { summary },
      )
    }
  })

const upsertGers = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  courseOfferingIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const records = courseOfferings.flatMap((co) => {
      const id = getCourseOfferingId(co, coIdMap)
      if (Option.isNone(id)) return []
      return co.gers.map((ger) => ({
        course_offering_id: id.value,
        ger_id: ger.ger_id,
      }))
    })

    if (records.length > 0) {
      yield* dbStep(
        'merge_course_offering_gers',
        (db) =>
          db
            .mergeInto('course_offering_gers as trg')
            .using(values(records, 'src'), (join) =>
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
        { summary, recordCount: records.length },
      )
    } else {
      yield* dbStep(
        'delete_course_offering_gers',
        (db) =>
          db
            .deleteFrom('course_offering_gers')
            .where('course_offering_id', 'in', courseOfferingIds)
            .execute(),
        { summary },
      )
    }
  })

const upsertTags = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  courseOfferingIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const records = courseOfferings.flatMap((co) => {
      const id = getCourseOfferingId(co, coIdMap)
      if (Option.isNone(id)) return []
      return co.tags.map((tag) => ({
        course_offering_id: id.value,
        name: tag.name,
        organization: tag.organization,
      }))
    })

    if (records.length > 0) {
      yield* dbStep(
        'merge_course_offering_tags',
        (db) =>
          db
            .mergeInto('course_offering_tags as trg')
            .using(values(records, 'src'), (join) =>
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
        { summary, recordCount: records.length },
      )
    } else {
      yield* dbStep(
        'delete_course_offering_tags',
        (db) =>
          db
            .deleteFrom('course_offering_tags')
            .where('course_offering_id', 'in', courseOfferingIds)
            .execute(),
        { summary },
      )
    }
  })

const upsertCourseOfferingChildren = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  courseOfferingIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.all(
    [
      upsertLearningObjectives(courseOfferings, coIdMap, courseOfferingIds, summary),
      upsertAttributes(courseOfferings, coIdMap, courseOfferingIds, summary),
      upsertGers(courseOfferings, coIdMap, courseOfferingIds, summary),
      upsertTags(courseOfferings, coIdMap, courseOfferingIds, summary),
    ],
    { concurrency: 'unbounded' },
  )

// ---------------------------------------------------------------------------
// Step 3: Merge sections
// ---------------------------------------------------------------------------

const mergeSections = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  courseOfferingIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const sectionRecords = courseOfferings.flatMap((co) => {
      const id = getCourseOfferingId(co, coIdMap)
      if (Option.isNone(id)) return []
      return co.sections.map((sec) => {
        const { attributes, schedules, ...rest } = sec
        return { course_offering_id: id.value, ...rest }
      })
    })

    if (sectionRecords.length === 0) {
      yield* dbStep(
        'delete_sections_all',
        (db) => db.deleteFrom('sections').where('course_offering_id', 'in', courseOfferingIds).execute(),
        { summary },
      )
      return HashMap.empty<
        { course_offering_id: number; term_quarter: string; section_number: string },
        number
      >()
    }

    const mergedSections = yield* dbStep(
      'merge_sections',
      (db) =>
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
      { summary, recordCount: sectionRecords.length },
    )

    return HashMap.fromIterable(
      mergedSections
        .filter((ms) => ms.action !== 'DELETE')
        .map(
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
  })

// ---------------------------------------------------------------------------
// Step 4: Section attributes
// ---------------------------------------------------------------------------

const upsertSectionAttributes = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  sectionIdMap: HashMap.HashMap<
    { course_offering_id: number; term_quarter: string; section_number: string },
    number
  >,
  sectionIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const records = courseOfferings.flatMap((co) => {
      const coId = getCourseOfferingId(co, coIdMap)
      if (Option.isNone(coId)) return []

      return co.sections.flatMap((sec) => {
        const secId = HashMap.get(
          sectionIdMap,
          Data.struct({
            course_offering_id: coId.value,
            term_quarter: sec.term_quarter,
            section_number: sec.section_number,
          }),
        )
        if (Option.isNone(secId)) return []

        return sec.attributes.map((attr) => ({
          section_id: secId.value,
          ...attr,
        }))
      })
    })

    if (records.length === 0) {
      if (sectionIds.length > 0) {
        yield* dbStep(
          'delete_section_attributes',
          (db) => db.deleteFrom('section_attributes').where('section_id', 'in', sectionIds).execute(),
          { summary },
        )
      }
      return
    }

    yield* dbStep(
      'merge_section_attributes',
      (db) =>
        db
          .mergeInto('section_attributes as trg')
          .using(values(records, 'src'), (join) =>
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
      { summary, recordCount: records.length },
    )
  })

// ---------------------------------------------------------------------------
// Step 5: Schedules + Instructors (diff-based)
// ---------------------------------------------------------------------------

const buildScheduleRecords = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  sectionIdMap: HashMap.HashMap<
    { course_offering_id: number; term_quarter: string; section_number: string },
    number
  >,
) =>
  courseOfferings.flatMap((co) => {
    const coId = getCourseOfferingId(co, coIdMap)
    if (Option.isNone(coId)) return []

    return co.sections.flatMap((sec) => {
      const secId = HashMap.get(
        sectionIdMap,
        Data.struct({
          course_offering_id: coId.value,
          term_quarter: sec.term_quarter,
          section_number: sec.section_number,
        }),
      )
      if (Option.isNone(secId)) return []

      return sec.schedules.map((sched) => ({
        section_id: secId.value,
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

type ScheduleSet = HashSet.HashSet<ReturnType<typeof scheduleStruct>>

const buildExistingScheduleSets = (
  existingScheduleRows: ReadonlyArray<{
    id: number
    section_id: number
    start_date: EffectTemporal.PlainDate | null
    end_date: EffectTemporal.PlainDate | null
    days: Array<Weekday> | null
    start_time: EffectTemporal.PlainTime | null
    end_time: EffectTemporal.PlainTime | null
    location: string | null
  }>,
  instructorsByScheduleId: Map<
    number,
    Array<{ instructor_id: number; instructor_role_id: number; schedule_id: number }>
  >,
) => {
  const result = new Map<number, ScheduleSet>()
  for (const s of existingScheduleRows) {
    const instructors = (instructorsByScheduleId.get(s.id) ?? []).map((i) => ({
      instructor_id: i.instructor_id,
      instructor_role_id: i.instructor_role_id,
    }))
    const struct = scheduleStruct({ ...s, instructors })
    const existing = result.get(s.section_id) ?? HashSet.empty()
    result.set(s.section_id, HashSet.add(existing, struct))
  }
  return result
}

const buildIncomingScheduleSets = (
  scheduleRecords: ReadonlyArray<{
    section_id: number
    start_date: EffectTemporal.PlainDate | null
    end_date: EffectTemporal.PlainDate | null
    days: Array<Weekday> | null
    start_time: EffectTemporal.PlainTime | null
    end_time: EffectTemporal.PlainTime | null
    location: string | null
    instructors: Array<{ instructor_id: number; instructor_role_id: number }>
  }>,
) => {
  const result = new Map<number, ScheduleSet>()
  for (const s of scheduleRecords) {
    const struct = scheduleStruct(s)
    const existing = result.get(s.section_id) ?? HashSet.empty()
    result.set(s.section_id, HashSet.add(existing, struct))
  }
  return result
}

const findChangedSectionIds = (
  existingSets: Map<number, ScheduleSet>,
  incomingSets: Map<number, ScheduleSet>,
): Array<number> => {
  const allIds = new Set([...existingSets.keys(), ...incomingSets.keys()])
  const changed: Array<number> = []

  for (const sectionId of allIds) {
    const existingSet = existingSets.get(sectionId) ?? HashSet.empty()
    const incomingSet = incomingSets.get(sectionId) ?? HashSet.empty()
    if (!Equal.equals(existingSet, incomingSet)) {
      changed.push(sectionId)
    }
  }

  return changed
}

const upsertSchedulesAndInstructors = (
  courseOfferings: ReadonlyArray<UploadCourseOffering>,
  coIdMap: HashMap.HashMap<
    { course_id: number; subject_id: number; code_number: number; code_suffix: string | null; year: string },
    number
  >,
  sectionIdMap: HashMap.HashMap<
    { course_offering_id: number; term_quarter: string; section_number: string },
    number
  >,
  sectionIds: Array<number>,
  summary: CourseSummary,
) =>
  Effect.gen(function* () {
    const scheduleRecords = buildScheduleRecords(courseOfferings, coIdMap, sectionIdMap)

    // Fetch existing schedules + instructors for diffing
    const existingScheduleRows =
      sectionIds.length > 0
        ? yield* dbStep(
            'fetch_existing_schedules',
            (db) => db.selectFrom('schedules').where('section_id', 'in', sectionIds).selectAll().execute(),
            { summary },
          )
        : []

    const existingInstructorRows =
      existingScheduleRows.length > 0
        ? yield* dbStep(
            'fetch_existing_schedule_instructors',
            (db) =>
              db
                .selectFrom('schedule_instructors')
                .where(
                  'schedule_id',
                  'in',
                  existingScheduleRows.map((s) => s.id),
                )
                .selectAll()
                .execute(),
            { summary },
          )
        : []

    const instructorsByScheduleId = new Map<number, typeof existingInstructorRows>()
    for (const inst of existingInstructorRows) {
      const arr = instructorsByScheduleId.get(inst.schedule_id) ?? []
      arr.push(inst)
      instructorsByScheduleId.set(inst.schedule_id, arr)
    }

    // Diff existing vs incoming
    const existingSets = buildExistingScheduleSets(existingScheduleRows, instructorsByScheduleId)
    const incomingSets = buildIncomingScheduleSets(scheduleRecords)
    const changedSectionIds = findChangedSectionIds(existingSets, incomingSets)

    if (changedSectionIds.length === 0) return

    // Delete schedules for changed sections (cascades to schedule_instructors)
    yield* dbStep(
      'delete_schedules_for_changed_sections',
      (db) => db.deleteFrom('schedules').where('section_id', 'in', changedSectionIds).execute(),
      { summary },
    )

    // Collect schedules to insert for changed sections
    const changedSectionIdSet = new Set(changedSectionIds)
    const schedulesToInsert = scheduleRecords.filter((s) => changedSectionIdSet.has(s.section_id))

    if (schedulesToInsert.length === 0) return

    // Bulk insert schedules
    const insertedSchedules = yield* dbStep(
      'bulk_insert_schedules',
      (db) =>
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
          .returning(['id', 'section_id', 'start_date', 'end_date', 'start_time', 'end_time', 'location'])
          .execute(),
      { summary, recordCount: schedulesToInsert.length },
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
        yield* Effect.logWarning(
          `Schedule insert order mismatch at index ${i}: ` +
            `returned ${JSON.stringify(returned)}, expected ${JSON.stringify(expected)}`,
        )
      }
    }

    // Build and insert instructor records
    const instructorRecords = insertedSchedules.flatMap((inserted, i) => {
      const original = schedulesToInsert[i]
      return original.instructors.map((inst) => ({
        schedule_id: inserted.id,
        instructor_id: inst.instructor_id,
        instructor_role_id: inst.instructor_role_id,
      }))
    })

    if (instructorRecords.length > 0) {
      yield* dbStep(
        'bulk_insert_schedule_instructors',
        (db) => db.insertInto('schedule_instructors').values(instructorRecords).execute(),
        { summary, recordCount: instructorRecords.length },
      )
    }
  })

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const upsertCourseOfferings = (rawCourseOfferings: Array<UploadCourseOffering>) =>
  Effect.gen(function* () {
    // Pre-step: deduplicate sections
    const courseOfferings = deduplicateSections(rawCourseOfferings)

    const summary = courseOfferings.map((co) => ({
      course_id: co.course_id,
      subject_id: co.subject_id,
      code_number: co.code_number,
      code_suffix: co.code_suffix,
      year: co.year,
    }))

    // Step 1: Merge course offerings
    const coIdMap = yield* mergeCourseOfferings(courseOfferings, summary)
    const courseOfferingIds = Array.from(HashMap.values(coIdMap))

    // Step 2: Course offering child tables (parallel)
    yield* upsertCourseOfferingChildren(courseOfferings, coIdMap, courseOfferingIds, summary)

    // Step 3: Merge sections
    const sectionIdMap = yield* mergeSections(courseOfferings, coIdMap, courseOfferingIds, summary)
    const sectionIds = Array.from(HashMap.values(sectionIdMap))

    // Step 4: Section attributes
    yield* upsertSectionAttributes(courseOfferings, coIdMap, sectionIdMap, sectionIds, summary)

    // Step 5: Schedules + instructors (diff-based)
    yield* upsertSchedulesAndInstructors(courseOfferings, coIdMap, sectionIdMap, sectionIds, summary)
  })
