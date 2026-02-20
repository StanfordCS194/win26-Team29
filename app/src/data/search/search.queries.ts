import { sql } from 'kysely'
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

// --- CTE context (shared by all match CTEs) ---

interface SearchCteContext {
  year: string
  quarters: QuarterType[]
  hasCodes: boolean
  hasSubjectCodes: boolean
  hasContentQuery: boolean
  hasInstructorQuery: boolean
  instructorQuery: string
  instructorQueryLower: string
  parsedCodes: Array<{ subject: string; code_number: number; code_suffix: string | null }>
  subjectCodes: string[]
  contentQuery: string
  ways: string[]
  unitsMin?: number
  unitsMax?: number
}

function buildSearchContext(params: SearchQueryParams): SearchCteContext {
  const { codes, subjectCodes, contentQuery, instructorQuery, year, quarters, ways, unitsMin, unitsMax } =
    params
  return {
    year,
    quarters,
    ways,
    unitsMin,
    unitsMax,
    hasCodes: codes.length > 0,
    hasSubjectCodes: subjectCodes.length > 0,
    hasContentQuery: contentQuery.length > 0,
    hasInstructorQuery: instructorQuery.length >= 4,
    instructorQuery,
    instructorQueryLower: instructorQuery.toLowerCase(),
    parsedCodes: codes.map((c) => ({
      subject: c.subject.toUpperCase(),
      code_number: c.codeNumber,
      code_suffix: c.codeSuffix?.toUpperCase() ?? null,
    })),
    subjectCodes,
    contentQuery,
  }
}

// --- CTE: code_matches ---

function buildCodeMatchesCte(ctx: SearchCteContext) {
  return (qb: any) =>
    qb
      .selectFrom(
        values(ctx.hasCodes ? ctx.parsedCodes : [{ subject: '', code_number: 0, code_suffix: null }], 'pc', {
          code_suffix: 'text',
        }),
      )
      .innerJoin('subjects as s', (join: any) => join.onRef('s.code', '=', 'pc.subject'))
      .innerJoin('course_offerings as co', 'co.subject_id', 's.id')
      .whereRef('co.code_number', '=', 'pc.code_number')
      .where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('eligible_offerings_mv as eo')
            .select('eo.offering_id')
            .whereRef('eo.offering_id', '=', 'co.id')
            .where('eo.year', '=', ctx.year)
            .where('eo.term_quarter', 'in', ctx.quarters),
        ),
      )
      .$if(!ctx.hasCodes, (qb: any) => qb.where(sql.lit(false)))
      .select((eb: any) => [
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
      ])
}

// --- CTE: subject_code_matches ---

function buildSubjectCodeMatchesCte(ctx: SearchCteContext) {
  return (qb: any) =>
    qb
      .selectFrom(
        values(
          ctx.hasSubjectCodes ? ctx.subjectCodes.map((s) => ({ code: s.toUpperCase() })) : [{ code: '' }],
          'subj',
        ),
      )
      .innerJoin('subjects as s', (join: any) => join.onRef('s.code', '=', 'subj.code'))
      .innerJoin('eligible_offerings_mv as eo', (join: any) =>
        join
          .onRef('eo.subject_id', '=', 's.id')
          .on('eo.year', '=', ctx.year)
          .on('eo.term_quarter', 'in', ctx.quarters),
      )
      .$if(!ctx.hasSubjectCodes, (qb: any) => qb.where(sql.lit(false)))
      .select(['eo.offering_id', sql.lit(0.3).as('rank'), sql.lit('code').as('match_type')])
}

// --- CTE: content_matches ---

function buildContentMatchesCte(ctx: SearchCteContext) {
  return (qb: any) =>
    qb
      .selectFrom('course_content_search as cs')
      .where(
        sql`cs.search_vector`,
        '@@',
        sql`plainto_tsquery('english'::regconfig, ${ctx.contentQuery}::text)`,
      )
      .where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('eligible_offerings_mv as eo')
            .select('eo.offering_id')
            .whereRef('eo.offering_id', '=', 'cs.offering_id')
            .where('eo.year', '=', ctx.year)
            .where('eo.term_quarter', 'in', ctx.quarters),
        ),
      )
      .$if(!ctx.hasContentQuery, (qb: any) => qb.where(sql.lit(false)))
      .select([
        'cs.offering_id',
        sql<number>`ts_rank(cs.search_vector, plainto_tsquery('english'::regconfig, ${ctx.contentQuery}::text))`.as(
          'rank',
        ),
        sql.lit('content').as('match_type'),
      ])
}

// --- CTE: instructor_candidates ---

function buildInstructorCandidatesCte(ctx: SearchCteContext) {
  return (qb: any) =>
    qb
      .selectFrom((sb: any) =>
        sb
          .selectFrom('instructors')
          .where('sunet', '=', ctx.instructorQueryLower)
          .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name'])
          .unionAll(
            sb
              .selectFrom('instructors')
              .where('first_and_last_name', sql`%`, ctx.instructorQuery)
              .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name']),
          )
          .unionAll(
            sb
              .selectFrom('instructors')
              .where('last_name', sql`%`, ctx.instructorQuery)
              .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name']),
          )
          .unionAll(
            sb
              .selectFrom('instructors')
              .where('first_name', sql`%`, ctx.instructorQuery)
              .select(['id', 'sunet', 'first_and_last_name', 'last_name', 'first_name']),
          )
          .as('candidates'),
      )
      .distinctOn('candidates.id')
      .select((eb: any) => [
        'candidates.id as instructor_id',
        'candidates.sunet',
        'candidates.first_and_last_name',
        'candidates.last_name',
        'candidates.first_name',
        eb
          .case()
          .when('candidates.sunet', '=', ctx.instructorQueryLower)
          .then(sql.lit(1.0))
          .else(
            (eb as any).fn('greatest', [
              (eb as any).fn('similarity', ['candidates.first_and_last_name', sql.val(ctx.instructorQuery)]),
              (eb as any).fn('similarity', ['candidates.last_name', sql.val(ctx.instructorQuery)]),
            ]),
          )
          .end()
          .as('candidate_score'),
      ])
      .orderBy('candidates.id')
      .orderBy('candidates.id')
}

// --- CTE: instructor_filtered ---

function buildInstructorFilteredCte() {
  return (qb: any) =>
    qb
      .selectFrom('instructor_candidates as ic')
      .where('ic.candidate_score', '>=', (eb: any) =>
        eb.selectFrom('instructor_candidates as c').select((eb: any) =>
          eb
            .case()
            .when(eb.fn.max('c.candidate_score'), '>', sql.lit(0.8))
            .then(eb(eb.fn.max('c.candidate_score'), '*', sql.lit(0.6)))
            .else(sql.lit(0.0))
            .end()
            .as('threshold'),
        ),
      )
      .selectAll('ic')
}

// --- CTE: instructor_matches ---

function buildInstructorMatchesCte(ctx: SearchCteContext) {
  return (qb: any) =>
    qb
      .selectFrom((sb: any) =>
        sb
          .selectFrom('instructor_filtered as ic')
          .innerJoin('schedule_instructors as si', 'si.instructor_id', 'ic.instructor_id')
          .innerJoin('instructor_roles as ir', 'ir.id', 'si.instructor_role_id')
          .innerJoin('schedules as sch', 'sch.id', 'si.schedule_id')
          .innerJoin('sections as sec', 'sec.id', 'sch.section_id')
          .where('sec.term_quarter', 'in', ctx.quarters)
          .where((eb: any) =>
            eb.exists(
              eb
                .selectFrom('eligible_offerings_mv as eo')
                .select('eo.offering_id')
                .whereRef('eo.offering_id', '=', 'sec.course_offering_id')
                .where('eo.year', '=', ctx.year)
                .where('eo.term_quarter', 'in', ctx.quarters),
            ),
          )
          .select((eb: any) => [
            'sec.course_offering_id as offering_id',
            'ic.instructor_id',
            eb(
              eb
                .case()
                .when('ic.sunet', '=', ctx.instructorQueryLower)
                .then(sql.lit(1.0))
                .else(
                  sql<number>`
                    1.0
                    - (1.0 - ${(eb as any).fn('similarity', ['ic.first_and_last_name', sql.val(ctx.instructorQuery)])} * 0.55)
                    * (1.0 - ${(eb as any).fn('similarity', ['ic.last_name', sql.val(ctx.instructorQuery)])} * 0.95)
                    * (1.0 - ${(eb as any).fn('similarity', ['ic.first_name', sql.val(ctx.instructorQuery)])} * 0.15)
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
      .$if(!ctx.hasInstructorQuery, (qb: any) => qb.where(sql.lit(false)))
      .select((eb: any) => [
        'sub.offering_id',
        sql<number>`(${eb.fn.max('sub.adj_rank')} * 0.97 + ${eb.fn.avg('sub.adj_rank')} * 0.03)
            * (1.0 / (1.0 + 0.05 * (${eb.fn.count('sub.instructor_id').distinct()} - 1)))`.as('rank'),
        sql.lit('instructor').as('match_type'),
      ])
      .groupBy('sub.offering_id')
}

// --- CTE: subject_matches ---

function buildSubjectMatchesCte(ctx: SearchCteContext) {
  return (qb: any) =>
    qb
      .selectFrom('subjects as s')
      .innerJoin('course_offerings as co', 'co.subject_id', 's.id')
      .where('s.longname', sql`%`, ctx.instructorQuery)
      .where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('eligible_offerings_mv as eo')
            .select('eo.offering_id')
            .whereRef('eo.offering_id', '=', 'co.id')
            .where('eo.year', '=', ctx.year)
            .where('eo.term_quarter', 'in', ctx.quarters),
        ),
      )
      .$if(!ctx.hasInstructorQuery, (qb: any) => qb.where(sql.lit(false)))
      .select((eb: any) => [
        'co.id as offering_id',
        (eb as any).fn('similarity', ['s.longname', sql.val(ctx.instructorQuery)]).as('rank'),
        sql.lit('subject').as('match_type'),
      ])
}

// --- CTE: combined (union of all match CTEs) ---

function buildCombinedCte() {
  return (qb: any) =>
    qb
      .selectFrom('code_matches')
      .select(['offering_id', 'rank', 'match_type'])
      .unionAll(qb.selectFrom('subject_code_matches').select(['offering_id', 'rank', 'match_type']))
      .unionAll(qb.selectFrom('content_matches').select(['offering_id', 'rank', 'match_type']))
      .unionAll(qb.selectFrom('instructor_matches').select(['offering_id', 'rank', 'match_type']))
      .unionAll(qb.selectFrom('subject_matches').select(['offering_id', 'rank', 'match_type']))
}

// --- CTE: scored (aggregate ranks per offering) ---

function buildScoredCte() {
  return (qb: any) =>
    qb
      .selectFrom('combined')
      .select((eb: any) => [
        'offering_id',
        (eb as any).fn.agg('array_agg', ['match_type']).distinct().as('matched_on'),
        sql<number>`
          coalesce(max(rank) FILTER (WHERE match_type = 'code'),       0) * 7
        + coalesce(max(rank) FILTER (WHERE match_type = 'content'),    0) * 6
        + coalesce(max(rank) FILTER (WHERE match_type = 'instructor'), 0) * 4
        + coalesce(max(rank) FILTER (WHERE match_type = 'subject'),    0) * 3
        `.as('score'),
      ])
      .groupBy('offering_id')
}

// --- Result filters (applied after join to course_offerings_full_mv; add one per filter type) ---

/** Filter to offerings whose gers overlap at least one selected Way. */
function applyWaysFilter(ctx: SearchCteContext) {
  return (qb: any) =>
    qb.where(
      sql<boolean>`mv.gers::text[] && ARRAY[${sql.join(
        ctx.ways.map((w) => sql.lit(w)),
        sql`, `,
      )}]::text[]`,
    )
}

/** Filter to offerings whose unit range overlaps [unitsMin, unitsMax] (inclusive). */
function applyUnitsFilter(ctx: SearchCteContext) {
  return (qb: any) => {
    let out = qb
    if (ctx.unitsMin != null) out = out.where('mv.units_max', '>=', ctx.unitsMin)
    if (ctx.unitsMax != null) out = out.where('mv.units_min', '<=', ctx.unitsMax)
    return out
  }
}

// --- Main entry ---

export async function searchCourseOfferings(
  db: Kysely<DB>,
  params: SearchQueryParams,
): Promise<SearchCourseResult[]> {
  const ctx = buildSearchContext(params)
  const t0 = performance.now()

  const compiledQuery = db
    .with('code_matches', buildCodeMatchesCte(ctx))
    .with('subject_code_matches', buildSubjectCodeMatchesCte(ctx))
    .with('content_matches', buildContentMatchesCte(ctx))
    .with('instructor_candidates', buildInstructorCandidatesCte(ctx))
    .with('instructor_filtered', buildInstructorFilteredCte())
    .with('instructor_matches', buildInstructorMatchesCte(ctx))
    .with('subject_matches', buildSubjectMatchesCte(ctx))
    .with('combined', buildCombinedCte())
    .with('scored', buildScoredCte())
    .selectFrom('scored as sc')
    .innerJoin('course_offerings_full_mv as mv', 'mv.offering_id', 'sc.offering_id' as any)
    .$if(ctx.ways.length > 0, applyWaysFilter(ctx))
    .$if(ctx.unitsMin != null || ctx.unitsMax != null, applyUnitsFilter(ctx))
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
    ] as any)
    .orderBy('sc.score' as any, 'desc')
    .orderBy('mv.subject_code' as any)
    .orderBy('mv.code_number' as any)
    .orderBy('mv.code_suffix' as any, (ob: any) => ob.asc().nullsFirst())
    .limit(50)
    .compile()

  const t1 = performance.now()
  const { rows } = await db.executeQuery(compiledQuery)
  const t2 = performance.now()
  console.log(`[search] build: ${(t1 - t0).toFixed(1)}ms, execute: ${(t2 - t1).toFixed(1)}ms`)

  return rows as unknown as SearchCourseResult[]
}
