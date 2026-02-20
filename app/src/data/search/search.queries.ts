import { sql, SqlBool } from 'kysely'
import { values } from '@courses/db/helpers'

import type { Kysely, DB, QuarterType } from '@courses/db/db-bun'
import type { SearchCourseResult } from './search.types'

export interface SearchQueryParams {
  codes: Array<{ subject: string; codeNumber: number; codeSuffix?: string }>
  subjectCodes: string[]
  contentQuery: string
  instructorQuery: string
  year: string
  quarters: QuarterType[]
  ways: string[]
  unitsMin?: number
  unitsMax?: number
}

export async function searchCourseOfferings(
  db: Kysely<DB>,
  params: SearchQueryParams,
): Promise<SearchCourseResult[]> {
  const { codes, subjectCodes, contentQuery, instructorQuery, year, quarters, ways, unitsMin, unitsMax } =
    params

  const hasCodes = codes.length > 0
  const hasSubjectCodes = subjectCodes.length > 0
  const hasContentQuery = contentQuery.length > 0
  const hasInstructorQuery = instructorQuery.length >= 4
  const instructorQueryLower = instructorQuery.toLowerCase()

  const parsedCodes = codes.map((c) => ({
    subject: c.subject.toUpperCase(),
    code_number: c.codeNumber,
    code_suffix: c.codeSuffix?.toUpperCase() ?? null,
  }))

  const hasWays = ways.length > 0
  const waysArray = hasWays
    ? sql`ARRAY[${sql.join(
        ways.map((w) => sql.lit(w)),
        sql`, `,
      )}]::text[]`
    : sql.lit(null)

  const t0 = performance.now()

  const compiledQuery = db
    // ─── CTE: code_matches ───
    .with('code_matches', (qb) =>
      qb
        .selectFrom(
          values(hasCodes ? parsedCodes : [{ subject: '', code_number: 0, code_suffix: null }], 'pc', {
            code_suffix: 'text',
          }),
        )
        .innerJoin('subjects as s', (join) => join.onRef('s.code', '=', 'pc.subject'))
        .innerJoin('course_offerings as co', 'co.subject_id', 's.id')
        .whereRef('co.code_number', '=', 'pc.code_number')
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('eligible_offerings_mv as eo')
              .select('eo.offering_id')
              .whereRef('eo.offering_id', '=', 'co.id')
              .where('eo.year', '=', year)
              .where('eo.term_quarter', 'in', quarters)
              .$if(hasWays, (qb) => qb.where(sql<SqlBool>`eo.gers::text[] && ${waysArray}`))
              .$if(unitsMin != null, (qb) => qb.where('eo.units_max', '>=', unitsMin!))
              .$if(unitsMax != null, (qb) => qb.where('eo.units_min', '<=', unitsMax!)),
          ),
        )
        .$if(!hasCodes, (qb) => qb.where(sql.lit(false)))
        .select((eb) => [
          eb.ref('co.id').as('offering_id'),
          eb
            .case()
            .when(
              eb.and([
                eb('co.code_number', '=', eb.ref('pc.code_number')),
                eb(
                  eb.fn.coalesce('co.code_suffix', sql.lit('')),
                  '=',
                  eb.fn.coalesce('pc.code_suffix', sql.lit('')),
                ),
              ]),
            )
            .then(sql.lit(1.0))
            .when(
              eb.and([eb('co.code_number', '=', eb.ref('pc.code_number')), eb('pc.code_suffix', 'is', null)]),
            )
            .then(sql.lit(0.7))
            .end()
            .as('rank'),
          sql.lit('code').as('match_type'),
        ]),
    )

    // ─── CTE: subject_code_matches ───
    .with('subject_code_matches', (qb) =>
      qb
        .selectFrom(
          values(
            hasSubjectCodes ? subjectCodes.map((s) => ({ code: s.toUpperCase() })) : [{ code: '' }],
            'subj',
          ),
        )
        .innerJoin('subjects as s', (join) => join.onRef('s.code', '=', 'subj.code'))
        .innerJoin('eligible_offerings_mv as eo', (join) => {
          let j = join
            .onRef('eo.subject_id', '=', 's.id')
            .on('eo.year', '=', year)
            .on('eo.term_quarter', 'in', quarters)
          if (hasWays) j = j.on(sql`eo.gers::text[] && ${waysArray}`)
          if (unitsMin != null) j = j.on('eo.units_max', '>=', unitsMin!)
          if (unitsMax != null) j = j.on('eo.units_min', '<=', unitsMax!)
          return j
        })
        .$if(!hasSubjectCodes, (qb) => qb.where(sql.lit(false)))
        .select(['eo.offering_id', sql.lit(0.3).as('rank'), sql.lit('code').as('match_type')]),
    )

    // ─── CTE: content_matches ───
    .with('content_matches', (qb) =>
      qb
        .selectFrom('course_content_search as cs')
        .where(sql`cs.search_vector`, '@@', sql`plainto_tsquery('english'::regconfig, ${contentQuery}::text)`)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('eligible_offerings_mv as eo')
              .select('eo.offering_id')
              .whereRef('eo.offering_id', '=', 'cs.offering_id')
              .where('eo.year', '=', year)
              .where('eo.term_quarter', 'in', quarters)
              .$if(hasWays, (qb) => qb.where(sql<SqlBool>`eo.gers::text[] && ${waysArray}`))
              .$if(unitsMin != null, (qb) => qb.where('eo.units_max', '>=', unitsMin!))
              .$if(unitsMax != null, (qb) => qb.where('eo.units_min', '<=', unitsMax!)),
          ),
        )
        .$if(!hasContentQuery, (qb) => qb.where(sql.lit(false)))
        .select([
          'cs.offering_id',
          sql<number>`ts_rank(cs.search_vector, plainto_tsquery('english'::regconfig, ${contentQuery}::text))`.as(
            'rank',
          ),
          sql.lit('content').as('match_type'),
        ]),
    )

    // ─── CTE: instructor_candidates ───
    .with('instructor_candidates', (qb) =>
      qb
        .selectFrom((sb) =>
          sb
            .selectFrom('instructors')
            .where('sunet', '=', instructorQueryLower)
            .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name'])
            .unionAll(
              sb
                .selectFrom('instructors')
                .where('first_and_last_name', sql`%`, instructorQuery)
                .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name']),
            )
            .unionAll(
              sb
                .selectFrom('instructors')
                .where('last_name', sql`%`, instructorQuery)
                .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name']),
            )
            .unionAll(
              sb
                .selectFrom('instructors')
                .where('first_name', sql`%`, instructorQuery)
                .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name']),
            )
            .as('candidates'),
        )
        .distinctOn('candidates.id')
        .select((eb) => [
          'candidates.id as instructor_id',
          'candidates.sunet',
          'candidates.first_and_last_name',
          'candidates.last_name',
          'candidates.first_name',
          eb
            .case()
            .when('candidates.sunet', '=', instructorQueryLower)
            .then(sql.lit(1.0))
            .else(
              eb.fn<number>('greatest', [
                eb.fn<number>('similarity', ['candidates.first_and_last_name', sql.val(instructorQuery)]),
                eb.fn<number>('similarity', ['candidates.last_name', sql.val(instructorQuery)]),
              ]),
            )
            .end()
            .as('candidate_score'),
        ])
        .orderBy('candidates.id')
        .orderBy('candidates.id'),
    )

    // ─── CTE: instructor_filtered ───
    .with('instructor_filtered', (qb) =>
      qb
        .selectFrom('instructor_candidates as ic')
        .where('ic.candidate_score', '>=', (eb) =>
          eb.selectFrom('instructor_candidates as c').select((eb) =>
            eb
              .case()
              .when(eb.fn.max('c.candidate_score'), '>', sql.lit(0.8))
              .then(eb(eb.fn.max('c.candidate_score'), '*', sql.lit(0.6)))
              .else(sql.lit(0.0))
              .end()
              .as('threshold'),
          ),
        )
        .selectAll('ic'),
    )

    // ─── CTE: instructor_matches ───
    .with('instructor_matches', (qb) =>
      qb
        .selectFrom((sb) =>
          sb
            .selectFrom('instructor_filtered as ic')
            .innerJoin('schedule_instructors as si', 'si.instructor_id', 'ic.instructor_id')
            .innerJoin('instructor_roles as ir', 'ir.id', 'si.instructor_role_id')
            .innerJoin('schedules as sch', 'sch.id', 'si.schedule_id')
            .innerJoin('sections as sec', 'sec.id', 'sch.section_id')
            .where('sec.term_quarter', 'in', quarters)
            .where((eb) =>
              eb.exists(
                eb
                  .selectFrom('eligible_offerings_mv as eo')
                  .select('eo.offering_id')
                  .whereRef('eo.offering_id', '=', 'sec.course_offering_id')
                  .where('eo.year', '=', year)
                  .where('eo.term_quarter', 'in', quarters)
                  .$if(hasWays, (qb) => qb.where(sql<SqlBool>`eo.gers::text[] && ${waysArray}`))
                  .$if(unitsMin != null, (qb) => qb.where('eo.units_max', '>=', unitsMin!))
                  .$if(unitsMax != null, (qb) => qb.where('eo.units_min', '<=', unitsMax!)),
              ),
            )
            .select((eb) => [
              'sec.course_offering_id as offering_id',
              'ic.instructor_id',
              eb(
                eb
                  .case()
                  .when('ic.sunet', '=', instructorQueryLower)
                  .then(sql.lit(1.0))
                  .else(
                    sql<number>`
                        1.0
                        - (1.0 - ${eb.fn<number>('similarity', ['ic.first_and_last_name', sql.val(instructorQuery)])} * 0.55)
                        * (1.0 - ${eb.fn<number>('similarity', ['ic.last_name', sql.val(instructorQuery)])} * 0.95)
                        * (1.0 - ${eb.fn<number>('similarity', ['ic.first_name', sql.val(instructorQuery)])} * 0.15)
                      `,
                  )
                  .end(),
                '*',
                eb.case().when('ir.code', '=', 'TA').then(sql.lit(0.5)).else(sql.lit(1.0)).end(),
              ).as('adj_rank'),
            ])
            .distinct()
            .as('sub'),
        )
        .$if(!hasInstructorQuery, (qb) => qb.where(sql.lit(false)))
        .select((eb) => [
          'sub.offering_id',
          sql<number>`(${eb.fn.max('sub.adj_rank')} * 0.97 + ${eb.fn.avg('sub.adj_rank')} * 0.03)
                  * (1.0 / (1.0 + 0.05 * (${eb.fn.count('sub.instructor_id').distinct()} - 1)))`.as('rank'),
          sql.lit('instructor').as('match_type'),
        ])
        .groupBy('sub.offering_id'),
    )

    // ─── CTE: subject_matches ───
    .with('subject_matches', (qb) =>
      qb
        .selectFrom('subjects as s')
        .innerJoin('course_offerings as co', 'co.subject_id', 's.id')
        .where('s.longname', sql`%`, instructorQuery)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('eligible_offerings_mv as eo')
              .select('eo.offering_id')
              .whereRef('eo.offering_id', '=', 'co.id')
              .where('eo.year', '=', year)
              .where('eo.term_quarter', 'in', quarters)
              .$if(hasWays, (qb) => qb.where(sql<SqlBool>`eo.gers::text[] && ${waysArray}`))
              .$if(unitsMin != null, (qb) => qb.where('eo.units_max', '>=', unitsMin!))
              .$if(unitsMax != null, (qb) => qb.where('eo.units_min', '<=', unitsMax!)),
          ),
        )
        .$if(!hasInstructorQuery, (qb) => qb.where(sql.lit(false)))
        .select((eb) => [
          'co.id as offering_id',
          eb.fn<number>('similarity', ['s.longname', sql.val(instructorQuery)]).as('rank'),
          sql.lit('subject').as('match_type'),
        ]),
    )

    // ─── CTE: combined ───
    .with('combined', (qb) =>
      qb
        .selectFrom('code_matches')
        .select(['offering_id', 'rank', 'match_type'])
        .unionAll(qb.selectFrom('subject_code_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('content_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('instructor_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('subject_matches').select(['offering_id', 'rank', 'match_type'])),
    )

    // ─── CTE: scored ───
    .with('scored', (qb) =>
      qb
        .selectFrom('combined')
        .select((eb) => [
          'offering_id',
          eb.fn.agg<string[]>('array_agg', ['match_type']).distinct().as('matched_on'),
          sql<number>`
            coalesce(max(rank) FILTER (WHERE match_type = 'code'),       0) * 7
          + coalesce(max(rank) FILTER (WHERE match_type = 'content'),    0) * 6
          + coalesce(max(rank) FILTER (WHERE match_type = 'instructor'), 0) * 4
          + coalesce(max(rank) FILTER (WHERE match_type = 'subject'),    0) * 3
          `.as('score'),
        ])
        .groupBy('offering_id'),
    )

    // ─── Final SELECT ───
    .selectFrom('scored as sc')
    .innerJoin('course_offerings_full_mv as mv', 'mv.offering_id', 'sc.offering_id')
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
      'mv.units_min',
      'mv.units_max',
      'mv.gers',
      'mv.sections',
      'sc.matched_on',
    ])
    .orderBy('sc.score', 'desc')
    .orderBy('mv.subject_code')
    .orderBy('mv.code_number')
    .orderBy('mv.code_suffix', (ob) => ob.asc().nullsFirst())
    .limit(50)
    .compile()
  console.log(compiledQuery.sql)
  const t1 = performance.now()

  const { rows } = await db.executeQuery(compiledQuery)

  const t2 = performance.now()
  console.log(`[search] build: ${(t1 - t0).toFixed(1)}ms, execute: ${(t2 - t1).toFixed(1)}ms`)

  return rows
}
