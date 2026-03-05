import { Expression, sql, type SqlBool } from 'kysely'
import { pg } from 'kysely-helpers'

import type { Kysely, DB } from '@courses/db/db-postgres-js'
import type { SearchCourseResult } from './search.params'
import type { z } from 'zod'
import { dbQuerySchema, EVAL_QUESTION_SLUGS } from './search.query-schema'

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */

export const PAGE_SIZE = 10

export type EvalSlug = (typeof EVAL_QUESTION_SLUGS)[number]

type SearchInput = z.infer<typeof dbQuerySchema>

export interface SearchQueryParams extends SearchInput {
  evalQuestionIds: Record<EvalSlug, number>
}

const quarterArray = (values: readonly string[]) =>
  sql`array[${sql.join(values.map((q) => sql`${q}::quarter_type`))}]`

const dayArray = (values: readonly string[]) =>
  sql`array[${sql.join(values.map((d) => sql`${d}::weekday_type`))}]`

const varcharArray = (values: readonly string[]) =>
  sql`array[${sql.join(values.map((v) => sql`${v}`))}]::varchar[]`

/* ──────────────────────────────────────────
   Main Search Function
────────────────────────────────────────── */

export async function searchCourseOfferings(
  db: Kysely<DB>,
  params: SearchQueryParams,
): Promise<{ results: SearchCourseResult[]; totalCount: number }> {
  const {
    year,
    code,
    query,
    querySubjects,
    subjects,
    numSubjects,
    numQuarters,
    numMeetingDays,
    codeNumberRange,
    repeatable,
    gradingOptionId,
    gradingOptionIdExclude,
    units,
    academicCareerId,
    academicCareerIdExclude,
    finalExamFlagId,
    finalExamFlagIdExclude,
    gers,
    numGers,
    quarters,
    componentTypeId,
    numEnrolled,
    maxEnrolled,
    enrollmentStatus,
    instructorSunets,
    days,
    startTime,
    classDuration,
    evalFilters,
    evalQuestionIds,
    sort,
    page,
    dedupeCrosslistings,
  } = params

  console.log('\nsort', sort.by, sort.direction)

  const offset = (page - 1) * PAGE_SIZE

  const hasCodeFilter = code != null && code.length > 0
  const hasContentQuery = query != null && query.length > 0

  const isEvalSort = (EVAL_QUESTION_SLUGS as readonly string[]).includes(sort.by)

  const needsScheduleFilter = days != null || startTime != null || classDuration != null

  const needsSectionJoin =
    componentTypeId != null ||
    numEnrolled != null ||
    maxEnrolled != null ||
    enrollmentStatus != null ||
    instructorSunets != null ||
    numMeetingDays != null ||
    needsScheduleFilter ||
    sort.by === 'num_enrolled' ||
    isEvalSort ||
    evalFilters != null

  const compiledQuery = db

    // ═══════════════════════════════════════════════════════════
    //  CTE 1: filtered_offerings
    // ═══════════════════════════════════════════════════════════
    .with('filtered_offerings', (qb) =>
      qb
        .selectFrom('course_offerings as co')
        .innerJoin('subjects as s', 's.id', 'co.subject_id')
        .leftJoin('offering_aggregates_mv as oa', 'oa.offering_id', 'co.id')
        .leftJoin('crosslistings_mv as cl', (join) =>
          join.onRef('cl.course_id', '=', 'co.course_id').onRef('cl.year', '=', 'co.year'),
        )
        .where('co.year', '=', year)

        // -- Quarters filter ──────────────────────────────────
        .$if(
          quarters?.include != null && quarters.include.length > 0 && quarters.includeMode === 'or',
          (qb) =>
            qb.where(
              (eb) =>
                sql<boolean>`
                ${eb.ref('oa.quarters')} &&
                ${quarterArray(quarters!.include!)}
              `,
            ),
        )

        .$if(
          quarters?.include != null && quarters.include.length > 0 && quarters.includeMode === 'and',
          (qb) =>
            qb.where(
              (eb) =>
                sql<boolean>`
                ${eb.ref('oa.quarters')} @>
                ${quarterArray(quarters!.include!)}
              `,
            ),
        )

        .$if(quarters?.exclude != null && quarters.exclude.length > 0, (qb) =>
          qb.where(
            (eb) =>
              sql<boolean>`
                not (
                  ${eb.ref('oa.quarters')} &&
                  ${quarterArray(quarters!.exclude!)}
                )
              `,
          ),
        )

        // ── Code filter ────────────────────────────────────
        .$if(hasCodeFilter, (qb) =>
          qb.where((eb) =>
            eb.or(
              code!.map((c) => {
                const conditions: Expression<SqlBool>[] = []
                if (c.subject != null) conditions.push(eb('s.code', '=', c.subject))
                conditions.push(eb('co.code_number', '=', c.code_number))
                if (c.code_suffix != null)
                  conditions.push(eb(eb.fn('upper', ['co.code_suffix']), '=', c.code_suffix.toUpperCase()))
                return eb.and(conditions)
              }),
            ),
          ),
        )

        // ── Content query ──────────────────────────────────
        .$if(hasContentQuery, (qb) =>
          qb.where((eb) =>
            eb.exists(
              eb
                .selectFrom('course_content_search as cs')
                .whereRef('cs.offering_id', '=', 'co.id')
                // oxlint-disable-next-line typescript/no-explicit-any
                .where('cs.search_vector', '@@', sql<any>`plainto_tsquery('english', ${query})`),
            ),
          ),
        )

        // ── Subject: include / exclude ─────────────────────
        .$if(subjects?.include != null && subjects.include.length > 0, (qb) =>
          qb.where((eb) => {
            const include = subjects!.include!

            if (!subjects!.withCrosslistings) {
              if (subjects!.includeMode === 'and' && include.length > 1) {
                return eb.val(false) // impossible: one offering can't have multiple subjects
              }
              return eb('s.code', 'in', include)
            }

            const subjectArray = varcharArray(include)
            return subjects!.includeMode === 'and'
              ? sql<boolean>`${eb.ref('cl.subject_codes')} @> ${subjectArray}`
              : sql<boolean>`${eb.ref('cl.subject_codes')} && ${subjectArray}`
          }),
        )
        .$if(subjects?.exclude != null && subjects.exclude.length > 0, (qb) =>
          qb.where((eb) => {
            const exclude = subjects!.exclude!
            const subjectArray = varcharArray(exclude)

            if (subjects!.withCrosslistings) {
              // group must NOT overlap with excluded subjects
              return sql<boolean>`not (${eb.ref('cl.subject_codes')} && ${subjectArray})`
            } else {
              return eb('s.code', 'not in', exclude)
            }
          }),
        )

        // ── Query subjects: hard match on s.code ──────────────
        .$if(querySubjects != null && querySubjects.length > 0, (qb) =>
          qb.where('s.code', 'in', querySubjects!),
        )

        // ── numSubjects ────────────────────────────────────────
        // coalesce to 1: offerings absent from MV are not cross-listed
        .$if(numSubjects?.min != null, (qb) =>
          qb.where((eb) => eb(eb.fn.coalesce('cl.num_subjects', eb.val(1)), '>=', numSubjects!.min!)),
        )
        .$if(numSubjects?.max != null, (qb) =>
          qb.where((eb) => eb(eb.fn.coalesce('cl.num_subjects', eb.val(1)), '<=', numSubjects!.max!)),
        )

        // ── Code number range ──────────────────────────────
        .$if(codeNumberRange?.min != null, (qb) => qb.where('co.code_number', '>=', codeNumberRange!.min!))
        .$if(codeNumberRange?.max != null, (qb) => qb.where('co.code_number', '<=', codeNumberRange!.max!))

        // ── Repeatable ─────────────────────────────────────
        .$if(repeatable != null, (qb) => qb.where('co.repeatable', '=', repeatable!))

        // ── Grading option ─────────────────────────────────
        .$if(gradingOptionId != null, (qb) => qb.where('co.grading_option_id', 'in', gradingOptionId!))
        .$if(gradingOptionIdExclude != null, (qb) =>
          qb.where('co.grading_option_id', 'not in', gradingOptionIdExclude!),
        )

        // ── Units: overlaps_with (default) ─────────────────
        .$if(units != null && units.mode !== 'contained_in' && units.min != null, (qb) =>
          qb.where('co.units_max', '>=', units!.min!),
        )
        .$if(units != null && units.mode !== 'contained_in' && units.max != null, (qb) =>
          qb.where('co.units_min', '<=', units!.max!),
        )
        // ── Units: contained_in ────────────────────────────
        .$if(units != null && units.mode === 'contained_in' && units.min != null, (qb) =>
          qb.where('co.units_min', '>=', units!.min!),
        )
        .$if(units != null && units.mode === 'contained_in' && units.max != null, (qb) =>
          qb.where('co.units_max', '<=', units!.max!),
        )

        // ── Academic career ────────────────────────────────
        .$if(academicCareerId != null, (qb) => qb.where('co.academic_career_id', 'in', academicCareerId!))
        .$if(academicCareerIdExclude != null, (qb) =>
          qb.where('co.academic_career_id', 'not in', academicCareerIdExclude!),
        )

        // ── Final exam flag ────────────────────────────────
        .$if(finalExamFlagId != null, (qb) => qb.where('co.final_exam_flag_id', 'in', finalExamFlagId!))
        .$if(finalExamFlagIdExclude != null, (qb) =>
          qb.where('co.final_exam_flag_id', 'not in', finalExamFlagIdExclude!),
        )

        // ── GER codes: include ─────────────────────────────
        .$if(gers?.include != null && gers.include.length > 0, (qb) =>
          qb.where((eb) => {
            const gerArray = varcharArray(gers!.include!)
            return gers!.includeMode === 'or'
              ? sql<boolean>`${eb.ref('oa.ger_codes')} && ${gerArray}`
              : sql<boolean>`${eb.ref('oa.ger_codes')} @> ${gerArray}`
          }),
        )
        // ── GER codes: exclude ─────────────────────────────
        .$if(gers?.exclude != null && gers.exclude.length > 0, (qb) =>
          qb.where((eb) => {
            const gerArray = varcharArray(gers!.exclude!)
            return sql<boolean>`not (${eb.ref('oa.ger_codes')} && ${gerArray})`
          }),
        )

        // ── GER codes: number of GERs ─────────────────────
        .$if(numGers != null && numGers.min != null, (qb) =>
          qb.where(pg.array<string>('oa.ger_codes').length, '>=', numGers!.min!),
        )
        .$if(numGers != null && numGers.max != null, (qb) =>
          qb.where(pg.array<string>('oa.ger_codes').length, '<=', numGers!.max!),
        )

        // ── Quarter count ─────────────────────────────────
        .$if(numQuarters?.min != null, (qb) =>
          qb.where(pg.array('oa.quarters').length, '>=', numQuarters!.min!),
        )
        .$if(numQuarters?.max != null, (qb) =>
          qb.where(pg.array('oa.quarters').length, '<=', numQuarters!.max!),
        )

        // ── Select + relevance score ───────────────────────
        .select((eb) => [
          'co.id as offering_id',
          'co.course_id',
          's.code as subject_code',
          'co.code_number',
          'co.code_suffix',
          'co.units_min',
          'co.units_max',
          ...(hasContentQuery
            ? [
                eb.fn
                  .coalesce(
                    eb
                      .selectFrom('course_content_search as cs')
                      .whereRef('cs.offering_id', '=', 'co.id')
                      // oxlint-disable-next-line typescript/no-explicit-any
                      .where('cs.search_vector', '@@', sql<any>`plainto_tsquery('english', ${query})`)
                      .select(
                        sql<number>`ts_rank(cs.search_vector, plainto_tsquery('english', ${query}))`.as(
                          'score',
                        ),
                      ),
                    eb.val(0),
                  )
                  .as('relevance_score'),
              ]
            : [eb.val(0).as('relevance_score')]),
        ]),
    )

    // ═══════════════════════════════════════════════════════════
    //  CTE 2: section_filtered
    //
    //  When section-level filters are active, join sections and
    //  apply filters. Always left join all evals (optimizer
    //  removes unused ones). DISTINCT ON collapses to one row
    //  per offering. When no section filters needed, pass through.
    // ═══════════════════════════════════════════════════════════
    .with('section_filtered', (qb) => {
      if (!needsSectionJoin) {
        let q = qb
          .selectFrom('filtered_offerings as fo')
          .select((eb) => [
            'fo.offering_id',
            'fo.relevance_score',
            'fo.subject_code',
            'fo.code_number',
            'fo.code_suffix',
            'fo.units_min',
            'fo.units_max',
            eb.val(null).as('eval_sort_score'),
            eb.val(null).as('num_enrolled'),
          ])

        if (dedupeCrosslistings) {
          q = q
            .distinctOn('fo.course_id')
            .orderBy('fo.course_id')
            // Prefer direct subject match when subject or querySubjects filter is active
            .$if(
              (subjects?.include != null && subjects.include.length > 0) ||
                (querySubjects != null && querySubjects.length > 0),
              (qb) => {
                const combined = [...(subjects?.include ?? []), ...(querySubjects ?? [])]
                return qb.orderBy((eb) => eb('fo.subject_code', 'in', combined), 'desc')
              },
            )
            .$if(sort.by === 'relevance', (qb) => qb.orderBy('fo.relevance_score', 'desc'))
            .$if(sort.by === 'units', (qb) =>
              sort.direction === 'desc'
                ? qb.orderBy('fo.units_max', 'desc')
                : qb.orderBy('fo.units_min', 'asc'),
            )
            .$if(sort.by === 'code', (qb) =>
              qb
                .orderBy('fo.subject_code', sort.direction)
                .orderBy('fo.code_number', sort.direction)
                .orderBy('fo.code_suffix', (ob) =>
                  sort.direction === 'asc' ? ob.asc().nullsFirst() : ob.desc().nullsLast(),
                ),
            )
        }

        return q
      }

      let q = qb
        .selectFrom('filtered_offerings as fo')
        .leftJoin('sections as sec', (join) =>
          join
            .onRef('sec.course_offering_id', '=', 'fo.offering_id')
            .on('sec.is_principal', '=', true)
            .on('sec.cancelled', '=', false),
        )

        // ── Quarters ───────────────────────────────────────
        .$if(quarters?.include != null && quarters.include.length > 0, (qb) =>
          qb.where('sec.term_quarter', 'in', quarters!.include!),
        )
        .$if(quarters?.exclude != null && quarters.exclude.length > 0, (qb) =>
          qb.where('sec.term_quarter', 'not in', quarters!.exclude!),
        )

        // ── Component type ─────────────────────────────────
        .$if(componentTypeId?.include != null && componentTypeId.include.length > 0, (qb) =>
          qb.where('sec.component_type_id', 'in', componentTypeId!.include!),
        )
        .$if(componentTypeId?.exclude != null && componentTypeId.exclude.length > 0, (qb) =>
          qb.where('sec.component_type_id', 'not in', componentTypeId!.exclude!),
        )

        // ── Enrollment / waitlist ranges ───────────────────
        .$if(numEnrolled?.min != null, (qb) => qb.where('sec.num_enrolled', '>=', numEnrolled!.min!))
        .$if(numEnrolled?.max != null, (qb) => qb.where('sec.num_enrolled', '<=', numEnrolled!.max!))
        .$if(maxEnrolled?.min != null, (qb) => qb.where('sec.max_enrolled', '>=', maxEnrolled!.min!))
        .$if(maxEnrolled?.max != null, (qb) => qb.where('sec.max_enrolled', '<=', maxEnrolled!.max!))

        // ── Enrollment status ──────────────────────────────
        // space_available: num_enrolled < max_enrolled
        // waitlist_only:   num_enrolled >= max_enrolled AND num_waitlist < max_waitlist
        // full:            num_enrolled >= max_enrolled AND (max_waitlist = 0 OR num_waitlist >= max_waitlist)
        .$if(enrollmentStatus != null && enrollmentStatus.length > 0, (qb) =>
          qb.where((eb) => {
            const clauses = enrollmentStatus!.map((status): Expression<SqlBool> => {
              if (status === 'space_available') {
                return eb(eb.ref('sec.num_enrolled'), '<', eb.ref('sec.max_enrolled'))
              }
              if (status === 'waitlist_only') {
                return eb.and([
                  eb(eb.ref('sec.num_enrolled'), '>=', eb.ref('sec.max_enrolled')),
                  eb(eb.ref('sec.num_waitlist'), '<', eb.ref('sec.max_waitlist')),
                ])
              }
              // full
              return eb.and([
                eb(eb.ref('sec.num_enrolled'), '>=', eb.ref('sec.max_enrolled')),
                eb.or([
                  eb('sec.max_waitlist', '=', 0),
                  eb(eb.ref('sec.num_waitlist'), '>=', eb.ref('sec.max_waitlist')),
                ]),
              ])
            })
            return eb.or(clauses)
          }),
        )

        // ── Schedule filter (NOT EXISTS negated) ───────────
        //  "All schedules match" = at least one exists AND
        //  no schedule exists that violates the conditions.
        // ── Schedule filter (NOT EXISTS negated) ───────────
        //  "All schedules match" =
        //   1) At least one schedule exists (that has filtered-by fields)
        //   2) No schedule exists that violates the conditions.
        .$if(needsScheduleFilter, (qb) =>
          qb

            // At least one schedule exists (that has filtered-by fields)
            .where((eb) =>
              eb.exists(
                eb
                  .selectFrom('schedules as sch_exists')
                  .whereRef('sch_exists.section_id', '=', 'sec.id')
                  .where((eb) => {
                    const predicates: Expression<SqlBool>[] = []

                    // Days filter active → require non-null days
                    if (days?.include != null && days.include.length > 0) {
                      predicates.push(eb('sch_exists.days', 'is not', null))
                    }

                    // Start time filter active → require non-null start_time
                    if (startTime?.min != null || startTime?.max != null) {
                      predicates.push(eb('sch_exists.start_time', 'is not', null))
                    }

                    // Class duration filter active → require non-null start & end
                    if (classDuration?.min != null || classDuration?.max != null) {
                      predicates.push(eb('sch_exists.start_time', 'is not', null))
                      predicates.push(eb('sch_exists.end_time', 'is not', null))
                    }

                    return predicates.length > 0 ? eb.and(predicates) : eb.val(true)
                  }),
              ),
            )

            // No schedule violates the filters
            .where((eb) =>
              eb.not(
                eb.exists(
                  eb
                    .selectFrom('schedules as sch')
                    .whereRef('sch.section_id', '=', 'sec.id')
                    .where((eb) => {
                      const violations: Expression<SqlBool>[] = []

                      // Days include (overlap): violation = no overlap
                      if (days?.include != null && days.include.length > 0 && days.includeMode === 'or') {
                        violations.push(
                          eb.and([
                            eb('sch.days', 'is not', null),
                            sql<boolean>`not (${eb.ref('sch.days')} && ${dayArray(days.include)})`,
                          ]),
                        )
                      }

                      // Days include (and / all): violation = doesn't contain all
                      if (days?.include != null && days.include.length > 0 && days.includeMode === 'and') {
                        violations.push(
                          eb.and([
                            eb('sch.days', 'is not', null),
                            sql<boolean>`not (${eb.ref('sch.days')} @> ${dayArray(days.include)})`,
                          ]),
                        )
                      }

                      // Days exclude: violation = has overlap with excluded
                      if (days?.exclude != null && days.exclude.length > 0) {
                        violations.push(
                          eb.and([
                            eb('sch.days', 'is not', null),
                            sql<boolean>`${eb.ref('sch.days')} && ${dayArray(days.exclude)}`,
                          ]),
                        )
                      }

                      // Start time min: violation = start_time before min
                      if (startTime?.min != null) {
                        violations.push(
                          eb.and([
                            eb('sch.start_time', 'is not', null),
                            eb('sch.start_time', '<', startTime.min),
                          ]),
                        )
                      }

                      // Start time max: violation = start_time after max
                      if (startTime?.max != null) {
                        violations.push(
                          eb.and([
                            eb('sch.start_time', 'is not', null),
                            eb('sch.start_time', '>', startTime.max),
                          ]),
                        )
                      }

                      // Class duration min: violation = duration < min
                      if (classDuration?.min != null) {
                        violations.push(
                          eb.and([
                            eb('sch.start_time', 'is not', null),
                            eb('sch.end_time', 'is not', null),
                            eb(
                              sql`extract(epoch from (sch.end_time - sch.start_time)) / 3600.0`,
                              '<',
                              classDuration.min,
                            ),
                          ]),
                        )
                      }

                      // Class duration max: violation = duration > max
                      if (classDuration?.max != null) {
                        violations.push(
                          eb.and([
                            eb('sch.start_time', 'is not', null),
                            eb('sch.end_time', 'is not', null),
                            eb(
                              sql`extract(epoch from (sch.end_time - sch.start_time)) / 3600.0`,
                              '>',
                              classDuration.max,
                            ),
                          ]),
                        )
                      }

                      if (violations.length === 0) {
                        return eb.val(false)
                      }

                      return violations.length === 1 ? violations[0] : eb.or(violations)
                    }),
                ),
              ),
            ),
        )

        // ── Meeting days count ─────────────────────────────
        // Count distinct weekdays across all schedules of the section.
        // LATERAL unnest has no Kysely builder equivalent, so the inner
        // aggregate is expressed with sql<> and wrapped in a Kysely subquery.
        .$if(numMeetingDays?.min != null, (qb) =>
          qb.where((eb) =>
            eb(
              eb.fn.coalesce(
                eb
                  .selectFrom(
                    sql<{ n: number }>`(
                      SELECT cardinality(array_agg(DISTINCT d)) AS n
                      FROM schedules sch_d
                      CROSS JOIN LATERAL unnest(sch_d.days) AS d
                      WHERE sch_d.section_id = ${eb.ref('sec.id')}
                        AND sch_d.days IS NOT NULL
                    )`.as('_days'),
                  )
                  .select('_days.n'),
                eb.val(0),
              ),
              '>=',
              numMeetingDays!.min!,
            ),
          ),
        )
        .$if(numMeetingDays?.max != null, (qb) =>
          qb.where((eb) =>
            eb(
              eb.fn.coalesce(
                eb
                  .selectFrom(
                    sql<{ n: number }>`(
                      SELECT cardinality(array_agg(DISTINCT d)) AS n
                      FROM schedules sch_d
                      CROSS JOIN LATERAL unnest(sch_d.days) AS d
                      WHERE sch_d.section_id = ${eb.ref('sec.id')}
                        AND sch_d.days IS NOT NULL
                    )`.as('_days'),
                  )
                  .select('_days.n'),
                eb.val(0),
              ),
              '<=',
              numMeetingDays!.max!,
            ),
          ),
        )

        // ── Instructor sunets (via MV) ─────────────────────
        .$if(instructorSunets != null, (qb) =>
          qb
            .innerJoin('section_instructor_sunets_mv as si_mv', 'si_mv.section_id', 'sec.id')
            // Include
            .$if(instructorSunets?.include != null && instructorSunets.include.length > 0, (qb) =>
              qb.where((eb) => {
                const sunetArray = varcharArray(instructorSunets!.include!)
                return instructorSunets!.includeMode === 'or'
                  ? sql<boolean>`${eb.ref('si_mv.instructor_sunets')} && ${sunetArray}`
                  : sql<boolean>`${eb.ref('si_mv.instructor_sunets')} @> ${sunetArray}`
              }),
            )
            // Exclude
            .$if(instructorSunets?.exclude != null && instructorSunets.exclude.length > 0, (qb) =>
              qb.where((eb) => {
                const sunetArray = varcharArray(instructorSunets!.exclude!)
                return sql<boolean>`not (${eb.ref('si_mv.instructor_sunets')} && ${sunetArray})`
              }),
            ),
        )

        // ── Always left join all evals ─────────────────────
        .leftJoin('evaluation_smart_averages as esa_quality', (join) =>
          join
            .onRef('esa_quality.section_id', '=', 'sec.id')
            .on('esa_quality.question_id', '=', evalQuestionIds.quality),
        )
        .leftJoin('evaluation_smart_averages as esa_hours', (join) =>
          join
            .onRef('esa_hours.section_id', '=', 'sec.id')
            .on('esa_hours.question_id', '=', evalQuestionIds.hours),
        )
        .leftJoin('evaluation_smart_averages as esa_learning', (join) =>
          join
            .onRef('esa_learning.section_id', '=', 'sec.id')
            .on('esa_learning.question_id', '=', evalQuestionIds.learning),
        )
        .leftJoin('evaluation_smart_averages as esa_organized', (join) =>
          join
            .onRef('esa_organized.section_id', '=', 'sec.id')
            .on('esa_organized.question_id', '=', evalQuestionIds.organized),
        )
        .leftJoin('evaluation_smart_averages as esa_goals', (join) =>
          join
            .onRef('esa_goals.section_id', '=', 'sec.id')
            .on('esa_goals.question_id', '=', evalQuestionIds.goals),
        )
        .leftJoin('evaluation_smart_averages as esa_attend_in_person', (join) =>
          join
            .onRef('esa_attend_in_person.section_id', '=', 'sec.id')
            .on('esa_attend_in_person.question_id', '=', evalQuestionIds.attend_in_person),
        )
        .leftJoin('evaluation_smart_averages as esa_attend_online', (join) =>
          join
            .onRef('esa_attend_online.section_id', '=', 'sec.id')
            .on('esa_attend_online.question_id', '=', evalQuestionIds.attend_online),
        )

        // ── Eval filters (from evalFilters record) ─────────
        .$if(evalFilters?.quality?.min != null, (qb) =>
          qb.where('esa_quality.smart_average', '>=', evalFilters!.quality!.min!),
        )
        .$if(evalFilters?.quality?.max != null, (qb) =>
          qb.where('esa_quality.smart_average', '<=', evalFilters!.quality!.max!),
        )
        .$if(evalFilters?.hours?.min != null, (qb) =>
          qb.where('esa_hours.smart_average', '>=', evalFilters!.hours!.min!),
        )
        .$if(evalFilters?.hours?.max != null, (qb) =>
          qb.where('esa_hours.smart_average', '<=', evalFilters!.hours!.max!),
        )
        .$if(evalFilters?.learning?.min != null, (qb) =>
          qb.where('esa_learning.smart_average', '>=', evalFilters!.learning!.min!),
        )
        .$if(evalFilters?.learning?.max != null, (qb) =>
          qb.where('esa_learning.smart_average', '<=', evalFilters!.learning!.max!),
        )
        .$if(evalFilters?.organized?.min != null, (qb) =>
          qb.where('esa_organized.smart_average', '>=', evalFilters!.organized!.min!),
        )
        .$if(evalFilters?.organized?.max != null, (qb) =>
          qb.where('esa_organized.smart_average', '<=', evalFilters!.organized!.max!),
        )
        .$if(evalFilters?.goals?.min != null, (qb) =>
          qb.where('esa_goals.smart_average', '>=', evalFilters!.goals!.min!),
        )
        .$if(evalFilters?.goals?.max != null, (qb) =>
          qb.where('esa_goals.smart_average', '<=', evalFilters!.goals!.max!),
        )
        .$if(evalFilters?.attend_in_person?.min != null, (qb) =>
          qb.where('esa_attend_in_person.smart_average', '>=', evalFilters!.attend_in_person!.min!),
        )
        .$if(evalFilters?.attend_in_person?.max != null, (qb) =>
          qb.where('esa_attend_in_person.smart_average', '<=', evalFilters!.attend_in_person!.max!),
        )
        .$if(evalFilters?.attend_online?.min != null, (qb) =>
          qb.where('esa_attend_online.smart_average', '>=', evalFilters!.attend_online!.min!),
        )
        .$if(evalFilters?.attend_online?.max != null, (qb) =>
          qb.where('esa_attend_online.smart_average', '<=', evalFilters!.attend_online!.max!),
        )

        // ── DISTINCT ON: pick best section per offering ────
        .distinctOn(dedupeCrosslistings ? 'fo.course_id' : 'fo.offering_id')
        .orderBy(dedupeCrosslistings ? 'fo.course_id' : 'fo.offering_id')
        // Prefer direct subject match when subject or querySubjects filter is active
        .$if(
          (subjects?.include != null && subjects.include.length > 0) ||
            (querySubjects != null && querySubjects.length > 0),
          (qb) => {
            const combined = [...(subjects?.include ?? []), ...(querySubjects ?? [])]
            return qb.orderBy((eb) => eb('fo.subject_code', 'in', combined), 'desc')
          },
        )
        // Secondary order within DISTINCT ON: pick the "best" section for the sort column
        .$if(isEvalSort, (qb) =>
          qb.orderBy(sql.ref(`esa_${sort.by}.smart_average`), (ob) =>
            sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          ),
        )
        .$if(sort.by === 'num_enrolled', (qb) =>
          qb.orderBy('sec.num_enrolled', (ob) =>
            sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          ),
        )

        // ── Select ─────────────────────────────────────────
        .select((eb) => [
          'fo.offering_id',
          'fo.relevance_score',
          'fo.subject_code',
          'fo.code_number',
          'fo.code_suffix',
          'fo.units_min',
          'fo.units_max',
          sql<number | null>`${isEvalSort ? sql.ref(`esa_${sort.by}.smart_average`) : eb.val(null)}`.as(
            'eval_sort_score',
          ),
          'sec.num_enrolled',
        ])

      return q
    })

    // ═══════════════════════════════════════════════════════════
    //  CTE 3: total_count
    //
    //  Exact count of all matching rows before pagination.
    // ═══════════════════════════════════════════════════════════
    .with('total_count', (qb) =>
      qb.selectFrom('section_filtered as sf').select((eb) => eb.fn.countAll<number>().as('count')),
    )

    // ═══════════════════════════════════════════════════════════
    //  CTE 4: sorted_page
    //
    //  Single unified sort + pagination.
    // ═══════════════════════════════════════════════════════════
    .with('sorted_page', (qb) => {
      // Map sort.by to the primary sort expression
      const primarySortCol =
        sort.by === 'relevance'
          ? sql.ref('sf.relevance_score')
          : sort.by === 'units'
            ? sql.ref(sort.direction === 'desc' ? 'sf.units_max' : 'sf.units_min')
            : sort.by === 'num_enrolled'
              ? sql.ref('sf.num_enrolled')
              : isEvalSort
                ? sql.ref('sf.eval_sort_score')
                : null // 'code' — handled by composite below

      let q = qb.selectFrom('section_filtered as sf').select(['sf.offering_id', 'sf.relevance_score'])

      // ── Primary sort ─────────────────────────────────────
      if (sort.by === 'code') {
        // Code sort: composite (subject, number, suffix)
        q = q
          .orderBy('sf.subject_code', sort.direction)
          .orderBy('sf.code_number', sort.direction)
          .orderBy('sf.code_suffix', (ob) =>
            sort.direction === 'asc' ? ob.asc().nullsFirst() : ob.desc().nullsLast(),
          )
      } else {
        // All other sorts use a single primary column
        q = q.orderBy(primarySortCol!, (ob) =>
          sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
        )
      }

      // ── Tiebreakers (always the same) ────────────────────
      if (sort.by !== 'relevance') {
        q = q.orderBy('sf.relevance_score', 'desc')
      }
      if (sort.by !== 'code') {
        q = q
          .orderBy('sf.subject_code')
          .orderBy('sf.code_number')
          .orderBy('sf.code_suffix', (ob) => ob.asc().nullsFirst())
      }

      return q.limit(PAGE_SIZE).offset(offset)
    })

    // ═══════════════════════════════════════════════════════════
    //  Final SELECT: hydrate from materialized view
    // ═══════════════════════════════════════════════════════════
    .selectFrom('sorted_page as sp')
    .innerJoin('course_offerings_full_mv as mv', 'mv.offering_id', 'sp.offering_id')
    .select([
      'mv.offering_id as id',
      'mv.year',
      'mv.subject_code',
      'mv.code_number',
      'mv.code_suffix',
      'mv.title',
      'mv.description',
      'mv.academic_group',
      'mv.academic_career',
      'mv.academic_organization',
      'mv.grading_option',
      'mv.final_exam_flag',
      'mv.units_min',
      'mv.units_max',
      'mv.gers',
      'mv.sections',
      'sp.relevance_score',
      sql<number>`(SELECT count FROM total_count)::int`.as('total_count'),
    ])
    .compile()

  // console.log(compiledQuery.sql)
  // console.log(compiledQuery.parameters)

  const { rows } = await db.executeQuery(compiledQuery)

  const totalCount = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).total_count) : 0
  const results = rows as SearchCourseResult[]
  return { results, totalCount }
}
