import { sql, SqlBool } from 'kysely'
import { values } from '@courses/db/helpers'

import type { EvalSlug } from './eval-questions'
import type { Kysely, DB, QuarterType } from '@courses/db/db-bun'
import type { SearchCourseResult, SortOption } from './search.types'

const PAGE_SIZE = 10
export interface EvalFilterParam {
  slug: EvalSlug
  min?: number
  max?: number
}

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
  evalQuestionIds: Record<EvalSlug, number>
  sort: SortOption
  sortOrder: 'asc' | 'desc'
  evalFilters: EvalFilterParam[]
  page: number
}

export async function searchCourseOfferings(
  db: Kysely<DB>,
  params: SearchQueryParams,
): Promise<{ results: SearchCourseResult[]; hasMore: boolean }> {
  const {
    codes,
    subjectCodes,
    contentQuery,
    instructorQuery,
    year,
    quarters,
    ways,
    unitsMin,
    unitsMax,
    evalQuestionIds,
    sort,
    sortOrder,
    evalFilters,
    page,
  } = params

  const offset = (page - 1) * PAGE_SIZE

  const isEvalSort = sort !== 'relevance' && sort !== 'code' && sort !== 'units'
  const evalSortSlug = isEvalSort ? (sort as EvalSlug) : undefined

  const hasCodes = codes.length > 0
  const hasSubjectCodes = subjectCodes.length > 0
  const hasContentQuery = contentQuery.length > 0
  const hasInstructorQuery = instructorQuery.length >= 4
  const hasQuarters = quarters.length > 0
  const hasAnyTextFilter = hasCodes || hasSubjectCodes || hasContentQuery || hasInstructorQuery
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

  const needsEvalPath = evalFilters.length > 0 || isEvalSort
  const evalFiltersBySlug = new Map(evalFilters.map((f) => [f.slug, f]))

  const t0 = performance.now()

  const compiledQuery = db
    // ─── CTE: filtered_offerings ───
    .with(
      (wb) => wb('filtered_offerings').materialized(),
      (qb) =>
        qb
          .selectFrom('offering_quarters_mv as oq')
          .where('oq.year', '=', year)
          .$if(hasQuarters, (qb) => qb.where('oq.term_quarter', 'in', quarters))
          .$if(hasWays, (qb) => qb.where(sql<SqlBool>`oq.gers::text[] && ${waysArray}`))
          .$if(unitsMin != null, (qb) => qb.where('oq.units_max', '>=', unitsMin!))
          .$if(unitsMax != null, (qb) => qb.where('oq.units_min', '<=', unitsMax!))
          .select([
            'oq.offering_id',
            'oq.subject_id',
            'oq.term_quarter',
            'oq.units_min',
            'oq.units_max',
            'oq.gers',
          ]),
    )

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
              .selectFrom('filtered_offerings as fo')
              .select('fo.offering_id')
              .whereRef('fo.offering_id', '=', 'co.id'),
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
    // Optimization: query offering_quarters_mv directly instead of scanning
    // the full materialized filtered_offerings CTE. This lets Postgres use
    // idx_eligible_mv_subject for a fast index lookup.
    .with('subject_code_matches', (qb) =>
      qb
        .selectFrom(
          values(
            hasSubjectCodes ? subjectCodes.map((s) => ({ code: s.toUpperCase() })) : [{ code: '' }],
            'subj',
          ),
        )
        .innerJoin('subjects as s', (join) => join.onRef('s.code', '=', 'subj.code'))
        .innerJoin('offering_quarters_mv as oq', (join) =>
          join.onRef('oq.subject_id', '=', 's.id').on('oq.year', '=', year),
        )
        .$if(hasQuarters, (qb) => qb.where('oq.term_quarter', 'in', quarters))
        .$if(hasWays, (qb) => qb.where(sql<SqlBool>`oq.gers::text[] && ${waysArray}`))
        .$if(unitsMin != null, (qb) => qb.where('oq.units_max', '>=', unitsMin!))
        .$if(unitsMax != null, (qb) => qb.where('oq.units_min', '<=', unitsMax!))
        .$if(!hasSubjectCodes, (qb) => qb.where(sql.lit(false)))
        .select(['oq.offering_id', sql.lit(0.3).as('rank'), sql.lit('code').as('match_type')]),
    )

    // ─── CTE: content_matches ───
    .with('content_matches', (qb) =>
      qb
        .selectFrom('course_content_search as cs')
        .where(sql`cs.search_vector`, '@@', sql`plainto_tsquery('english'::regconfig, ${contentQuery}::text)`)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('filtered_offerings as fo')
              .select('fo.offering_id')
              .whereRef('fo.offering_id', '=', 'cs.offering_id'),
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
            .where('sec.is_principal', '=', true)
            .where('sec.cancelled', '=', false)
            .$if(hasQuarters, (qb) => qb.where('sec.term_quarter', 'in', quarters))
            .where((eb) =>
              eb.exists(
                eb
                  .selectFrom('filtered_offerings as fo')
                  .select('fo.offering_id')
                  .whereRef('fo.offering_id', '=', 'sec.course_offering_id'),
              ),
            )
            .select((eb) => [
              'sec.course_offering_id as offering_id',
              'ic.instructor_id',
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
                .end()
                .as('adj_rank'),
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
              .selectFrom('filtered_offerings as fo')
              .select('fo.offering_id')
              .whereRef('fo.offering_id', '=', 'co.id'),
          ),
        )
        .$if(!hasInstructorQuery, (qb) => qb.where(sql.lit(false)))
        .select((eb) => [
          'co.id as offering_id',
          eb.fn<number>('similarity', ['s.longname', sql.val(instructorQuery)]).as('rank'),
          sql.lit('subject').as('match_type'),
        ]),
    )

    // ─── CTE: all_offerings_matches ───
    // When no text filter is active, seed results with all offerings from
    // filtered_offerings so "empty query" means "give me everything".
    .with('all_offerings_matches', (qb) =>
      qb
        .selectFrom('filtered_offerings as fo')
        .select(['fo.offering_id', sql.lit(0.5).as('rank'), sql.lit('all').as('match_type')])
        .$if(hasAnyTextFilter, (qb) => qb.where(sql.lit(false))),
    )

    // ─── CTE: combined ───
    .with('combined', (qb) =>
      qb
        .selectFrom('code_matches')
        .select(['offering_id', 'rank', 'match_type'])
        .unionAll(qb.selectFrom('subject_code_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('content_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('instructor_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('subject_matches').select(['offering_id', 'rank', 'match_type']))
        .unionAll(qb.selectFrom('all_offerings_matches').select(['offering_id', 'rank', 'match_type'])),
    )

    // ─── CTE: relevance_scored ───
    .with('relevance_scored', (qb) =>
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
          + coalesce(max(rank) FILTER (WHERE match_type = 'all'),        0) * 1
          `.as('relevance_score'),
        ])
        .groupBy('offering_id'),
    )

    // ─── CTE: eval_offerings ───
    // When eval sorting/filtering is active, we join sections onto
    // relevance_scored and LEFT JOIN each eval slug's smart_average.
    // Filters are applied per-section row (a section must pass ALL active
    // filters). DISTINCT ON then picks one section per offering, ordered
    // by the sort slug's score in the requested direction. This gives
    // correct semantics: an offering is included if it has at least one
    // section passing all filters, and is sorted by that section's score.
    //
    // When no eval path is needed, we skip the section join entirely.
    .with('eval_offerings', (qb) => {
      if (!needsEvalPath) {
        let baseQ = qb
          .selectFrom('relevance_scored as sc')
          .innerJoin('course_offerings as co', 'co.id', 'sc.offering_id')
          .innerJoin('subjects as s', 's.id', 'co.subject_id')
          .$if(sort === 'units', (qb) =>
            qb.innerJoin('course_offerings_full_mv as mv', 'mv.offering_id', 'sc.offering_id'),
          )
          .select(['sc.offering_id', 'sc.relevance_score', 'sc.matched_on'])

        if (sort === 'code') {
          baseQ = baseQ
            .orderBy('s.code', sortOrder)
            .orderBy('co.code_number', sortOrder)
            .orderBy('co.code_suffix', (ob) =>
              sortOrder === 'asc' ? ob.asc().nullsFirst() : ob.desc().nullsLast(),
            )
            .orderBy('sc.relevance_score', 'desc')
        } else if (sort === 'units') {
          baseQ = baseQ
            .orderBy(sql.ref(sortOrder === 'desc' ? 'mv.units_max' : 'mv.units_min'), (ob) =>
              sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
            )
            .orderBy('sc.relevance_score', 'desc')
            .orderBy('s.code')
            .orderBy('co.code_number')
            .orderBy('co.code_suffix', (ob) => ob.asc().nullsFirst())
        } else {
          baseQ = baseQ
            .orderBy('sc.relevance_score', sortOrder)
            .orderBy('s.code')
            .orderBy('co.code_number')
            .orderBy('co.code_suffix', (ob) => ob.asc().nullsFirst())
        }

        return baseQ.limit(PAGE_SIZE + 1).offset(offset)
      }

      const sortRef =
        evalSortSlug != null ? sql.ref(`esa_${evalSortSlug}.smart_average`) : sql.ref('sc.relevance_score')

      // ── Fast path: no text filters, just browse all + eval sort/filter ──
      if (!hasAnyTextFilter) {
        const sortRefDirect =
          evalSortSlug != null ? sql.ref(`esa_${evalSortSlug}.smart_average`) : sql.lit(0.5)

        const innerQuery = qb
          .selectFrom('filtered_offerings as fo')
          .leftJoin('sections as sec', 'sec.course_offering_id', 'fo.offering_id')
          .$if(hasQuarters, (qb) =>
            qb
              .where('sec.is_principal', '=', true)
              .where('sec.cancelled', '=', false)
              .where('sec.term_quarter', 'in', quarters),
          )
          .innerJoin('course_offerings as co', 'co.id', 'fo.offering_id')
          .innerJoin('subjects as s', 's.id', 'co.subject_id')
          .leftJoin('evaluation_smart_averages as esa_rating', (join) =>
            join
              .onRef('esa_rating.section_id', '=', 'sec.id')
              .on('esa_rating.question_id', '=', evalQuestionIds.rating),
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
          .leftJoin('evaluation_smart_averages as esa_hours', (join) =>
            join
              .onRef('esa_hours.section_id', '=', 'sec.id')
              .on('esa_hours.question_id', '=', evalQuestionIds.hours),
          )
          .$if(evalFiltersBySlug.has('rating'), (qb) => {
            const f = evalFiltersBySlug.get('rating')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_rating.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_rating.smart_average', '<=', f.max!))
          })
          .$if(evalFiltersBySlug.has('learning'), (qb) => {
            const f = evalFiltersBySlug.get('learning')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_learning.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_learning.smart_average', '<=', f.max!))
          })
          .$if(evalFiltersBySlug.has('organized'), (qb) => {
            const f = evalFiltersBySlug.get('organized')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_organized.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_organized.smart_average', '<=', f.max!))
          })
          .$if(evalFiltersBySlug.has('goals'), (qb) => {
            const f = evalFiltersBySlug.get('goals')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_goals.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_goals.smart_average', '<=', f.max!))
          })
          .$if(evalFiltersBySlug.has('attend_in_person'), (qb) => {
            const f = evalFiltersBySlug.get('attend_in_person')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_attend_in_person.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_attend_in_person.smart_average', '<=', f.max!))
          })
          .$if(evalFiltersBySlug.has('attend_online'), (qb) => {
            const f = evalFiltersBySlug.get('attend_online')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_attend_online.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_attend_online.smart_average', '<=', f.max!))
          })
          .$if(evalFiltersBySlug.has('hours'), (qb) => {
            const f = evalFiltersBySlug.get('hours')!
            return qb
              .$if(f.min != null, (qb) => qb.where('esa_hours.smart_average', '>=', f.min!))
              .$if(f.max != null, (qb) => qb.where('esa_hours.smart_average', '<=', f.max!))
          })
          .distinctOn('fo.offering_id')
          .select([
            'fo.offering_id',
            sql.lit(1.0).as('relevance_score'),
            sql<string[]>`ARRAY['all']::text[]`.as('matched_on'),
            sql<number | null>`${sortRefDirect}`.as('eval_sort_score'),
            's.code as subject_code',
            'co.code_number',
            'co.code_suffix',
            'fo.units_min',
            'fo.units_max',
          ])
          .orderBy('fo.offering_id')
          .orderBy(sql`${sortRefDirect}`, (ob) =>
            sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          )

        let outerQ = qb
          .selectFrom(innerQuery.as('sub'))
          .select(['sub.offering_id', 'sub.relevance_score', 'sub.matched_on'])

        if (sort === 'code') {
          outerQ = outerQ
            .orderBy('sub.subject_code', sortOrder)
            .orderBy('sub.code_number', sortOrder)
            .orderBy('sub.code_suffix', (ob) =>
              sortOrder === 'asc' ? ob.asc().nullsFirst() : ob.desc().nullsLast(),
            )
            .orderBy('sub.relevance_score', 'desc')
        } else if (sort === 'units') {
          outerQ = outerQ
            .orderBy(sortOrder === 'desc' ? 'sub.units_max' : 'sub.units_min', (ob) =>
              sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
            )
            .orderBy('sub.relevance_score', 'desc')
            .orderBy('sub.subject_code')
            .orderBy('sub.code_number')
            .orderBy('sub.code_suffix', (ob) => ob.asc().nullsFirst())
        } else {
          outerQ = outerQ
            .orderBy('sub.eval_sort_score', (ob) =>
              sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
            )
            .orderBy('sub.relevance_score', 'desc')
            .orderBy('sub.subject_code')
            .orderBy('sub.code_number')
            .orderBy('sub.code_suffix', (ob) => ob.asc().nullsFirst())
        }

        return outerQ.limit(PAGE_SIZE + 1).offset(offset)
      }

      // ── Standard path: text filters active, use combined/relevance_scored ──
      const innerQuery = qb
        .selectFrom('relevance_scored as sc')
        .leftJoin('sections as sec', 'sec.course_offering_id', 'sc.offering_id')
        .$if(hasQuarters, (qb) =>
          qb
            .where('sec.is_principal', '=', true)
            .where('sec.cancelled', '=', false)
            .where('sec.term_quarter', 'in', quarters),
        )
        .innerJoin('course_offerings as co', 'co.id', 'sc.offering_id')
        .innerJoin('subjects as s', 's.id', 'co.subject_id')
        .$if(sort === 'units', (qb) =>
          qb.innerJoin('course_offerings_full_mv as mv', 'mv.offering_id', 'sc.offering_id'),
        )
        .leftJoin('evaluation_smart_averages as esa_rating', (join) =>
          join
            .onRef('esa_rating.section_id', '=', 'sec.id')
            .on('esa_rating.question_id', '=', evalQuestionIds.rating),
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
        .leftJoin('evaluation_smart_averages as esa_hours', (join) =>
          join
            .onRef('esa_hours.section_id', '=', 'sec.id')
            .on('esa_hours.question_id', '=', evalQuestionIds.hours),
        )
        .$if(evalFiltersBySlug.has('rating'), (qb) => {
          const f = evalFiltersBySlug.get('rating')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_rating.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_rating.smart_average', '<=', f.max!))
        })
        .$if(evalFiltersBySlug.has('learning'), (qb) => {
          const f = evalFiltersBySlug.get('learning')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_learning.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_learning.smart_average', '<=', f.max!))
        })
        .$if(evalFiltersBySlug.has('organized'), (qb) => {
          const f = evalFiltersBySlug.get('organized')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_organized.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_organized.smart_average', '<=', f.max!))
        })
        .$if(evalFiltersBySlug.has('goals'), (qb) => {
          const f = evalFiltersBySlug.get('goals')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_goals.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_goals.smart_average', '<=', f.max!))
        })
        .$if(evalFiltersBySlug.has('attend_in_person'), (qb) => {
          const f = evalFiltersBySlug.get('attend_in_person')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_attend_in_person.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_attend_in_person.smart_average', '<=', f.max!))
        })
        .$if(evalFiltersBySlug.has('attend_online'), (qb) => {
          const f = evalFiltersBySlug.get('attend_online')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_attend_online.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_attend_online.smart_average', '<=', f.max!))
        })
        .$if(evalFiltersBySlug.has('hours'), (qb) => {
          const f = evalFiltersBySlug.get('hours')!
          return qb
            .$if(f.min != null, (qb) => qb.where('esa_hours.smart_average', '>=', f.min!))
            .$if(f.max != null, (qb) => qb.where('esa_hours.smart_average', '<=', f.max!))
        })
        .distinctOn('sc.offering_id')
        .select([
          'sc.offering_id',
          'sc.relevance_score',
          'sc.matched_on',
          sql<number | null>`${sortRef}`.as('eval_sort_score'),
          's.code as subject_code',
          'co.code_number',
          'co.code_suffix',
          ...(sort === 'units'
            ? [sql.ref('mv.units_min').as('units_min'), sql.ref('mv.units_max').as('units_max')]
            : []),
        ])
        .orderBy('sc.offering_id')
        .orderBy(sql`${sortRef}`, (ob) =>
          sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
        )

      let outerQ = qb
        .selectFrom(innerQuery.as('sub'))
        .select(['sub.offering_id', 'sub.relevance_score', 'sub.matched_on'])

      if (sort === 'code') {
        outerQ = outerQ
          .orderBy('sub.subject_code', sortOrder)
          .orderBy('sub.code_number', sortOrder)
          .orderBy('sub.code_suffix', (ob) =>
            sortOrder === 'asc' ? ob.asc().nullsFirst() : ob.desc().nullsLast(),
          )
          .orderBy('sub.relevance_score', 'desc')
      } else if (sort === 'units') {
        outerQ = outerQ
          .orderBy(sortOrder === 'desc' ? 'sub.units_max' : 'sub.units_min', (ob) =>
            sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          )
          .orderBy('sub.relevance_score', 'desc')
          .orderBy('sub.subject_code')
          .orderBy('sub.code_number')
          .orderBy('sub.code_suffix', (ob) => ob.asc().nullsFirst())
      } else {
        outerQ = outerQ
          .orderBy(evalSortSlug != null ? 'sub.eval_sort_score' : 'sub.relevance_score', (ob) =>
            sortOrder === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          )
          .orderBy('sub.relevance_score', 'desc')
          .orderBy('sub.subject_code')
          .orderBy('sub.code_number')
          .orderBy('sub.code_suffix', (ob) => ob.asc().nullsFirst())
      }

      return outerQ.limit(PAGE_SIZE + 1).offset(offset)
    })

    // ─── Final SELECT ───
    .selectFrom('eval_offerings as eo')
    .innerJoin('course_offerings_full_mv as mv', 'mv.offering_id', 'eo.offering_id')
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
      'eo.matched_on',
    ])
    .compile()

  console.log(compiledQuery.sql)
  console.log(compiledQuery.parameters)
  const t1 = performance.now()

  const { rows } = await db.executeQuery(compiledQuery)

  const t2 = performance.now()
  console.log(`[search] build: ${(t1 - t0).toFixed(1)}ms, execute: ${(t2 - t1).toFixed(1)}ms`)

  const hasMore = rows.length > PAGE_SIZE
  const results = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return { results, hasMore }
}
