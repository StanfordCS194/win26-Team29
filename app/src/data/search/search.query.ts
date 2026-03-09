import { Expression, sql, type SqlBool } from 'kysely'
import { pg } from 'kysely-helpers'

import type { Kysely, DB, MvSection } from '@courses/db/db-postgres-js'
import type { SearchQueryResult } from './search.params'
import type { z } from 'zod'
import { dbQuerySchema, EVAL_QUESTION_SLUGS } from './search.query-schema'

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */

export const PAGE_SIZE = 10

export function inlineParams(sql: string, params: readonly unknown[]): string {
  return sql.replace(/\$(\d+)/g, (_, i) => {
    const value = params[Number(i) - 1]
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
    if (Array.isArray(value)) return `'{${value.join(',')}}'`
    return JSON.stringify(value)
  })
}

// Maximum number of vector-similarity candidates fetched before filtering.
const VECTOR_TOP_K = 100
const VECTOR_MIN_SIMILARITY = 0.349 // cosine similarity threshold; below this is not considered a match

// Offerings whose final relevance_score falls below this are dropped.
// Prevents noise results when a content/code/embedding query is active.
const MIN_RELEVANCE_THRESHOLD = 0.38

// Relevance score rounding step (e.g. 0.02 → 0.38, 0.40, 0.42, …)
const RELEVANCE_SCORE_ROUNDING = 0.0075

// ── Logsumexp sharpness ────────────────────────────────────────────────────
// Higher k → winner-takes-more; lower k → scores blend more evenly.
const LOGSUMEXP_K = 5

// ── Text-tier blend weights (must sum to 1.0) ─────────────────────────────
// Phrase match carries the most weight; OR is a weak fallback signal.
const SCALE_PHRASE = 1.25
const SCALE_AND = 0.765
const SCALE_OR = 0.31475
// Course-code match is a high-signal, structured filter: exact hits (1.0)
// should dominate; title (0.8) and description (0.5) fuzzy hits still surface
// the result but rank below genuine text/vector matches.
const SCALE_CODE = 1.5

// ── AND/OR dampening steepness ────────────────────────────────────────────
// When a strong phrase signal exists, AND is mildly suppressed;
// OR is aggressively suppressed. When AND is also strong, OR gets
// an additional multiplicative penalty.
const DAMPEN_AND_BY_PHRASE = 8.0 // steepness of AND suppression via phrase score
const DAMPEN_OR_BY_PHRASE = 10.25 // steepness of OR suppression via phrase score
const DAMPEN_OR_BY_AND = 8.25 // steepness of OR suppression via AND score

// ── Enrollment popularity boost ───────────────────────────────────────────
// Softly scales relevance upward for courses with higher historical enrolment.
// Formula: 1 + (ENROLL_BOOST_WEIGHT * N) / (N + ENROLL_BOOST_MIDPOINT)
// At midpoint enrolment the boost is exactly 1 + ENROLL_BOOST_WEIGHT / 2.
const ENROLL_BOOST_WEIGHT = 0.175
const ENROLL_BOOST_MIDPOINT = 200.0

// ── Vector score scaling ───────────────────────────────────────────────────
// Cosine similarity [0,1] is shifted and cubed so that near-duplicate
// embeddings score much higher than loose semantic matches.
const VECTOR_SHIFT = 0.2725 // added to score before squaring
const VECTOR_FLOOR = -0.3 // coalesce fallback when no vector match
const SCALE_VECTOR = 1.02 // overall multiplier on the cubed term
const SUBJECT_BOOST_FALLBACK = 0.85 // subject_boost when centroid is absent

// ── Code-number tier multipliers ──────────────────────────────────────────
// Slightly penalises very low-numbered (freshman) and graduate-level courses
// to keep the mid-level undergraduate sweet spot at full weight.
const CODE_MULT_BELOW_100 = 0.98
const CODE_MULT_100 = 1.0
const CODE_MULT_200 = 0.99
const CODE_MULT_300 = 0.95
const CODE_MULT_400_PLUS = 0.9

export type EvalSlug = (typeof EVAL_QUESTION_SLUGS)[number]

type SearchInput = z.infer<typeof dbQuerySchema>

export interface SearchQueryParams extends SearchInput {
  evalQuestionIds: Record<EvalSlug, number>
  /** Pre-computed query embedding for hybrid search scoring. */
  embedding?: number[]
  /** Offering IDs whose sections are already in the server-side cache; mv.sections will be NULL for these rows. */
  cachedOfferingIds?: number[]
  hoursPerUnitFilter?: { min?: number; max?: number }
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
): Promise<{ results: SearchQueryResult[]; totalCount: number }> {
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
    hasAccompanyingSections,
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
    endTime,
    classDuration,
    evalFilters,
    evalQuestionIds,
    hoursPerUnitFilter,
    sort,
    page,
    dedupeCrosslistings,
    embedding,
    cachedOfferingIds,
  } = params

  const offset = (page - 1) * PAGE_SIZE

  const hasCodeFilter = code != null && code.length > 0
  const hasContentQuery = query != null && query.length > 0
  const hasEmbedding = embedding != null && embedding.length > 0
  const embeddingVector = hasEmbedding ? `[${embedding!.join(',')}]` : null
  const orQueryStr = hasContentQuery ? query.split(/\s+/).join(' | ') : null

  const phraseTs = sql`(phraseto_tsquery('english', ${query}) || phraseto_tsquery('simple', ${query}))`
  const andTs = sql`(plainto_tsquery('english', ${query}) || plainto_tsquery('simple', ${query}))`
  const orTs = sql`(to_tsquery('english', ${orQueryStr}) || to_tsquery('simple', ${orQueryStr}))`

  const codeStrings = (code ?? []).flatMap((c) => {
    if (c.subject == null) return []
    const num = `${c.code_number}${c.code_suffix ?? ''}`
    return [`${c.subject}${num}`, `${c.subject} ${num}`]
  })
  const hasCodeStrings = codeStrings.length > 0
  const hasCandidateFilter = hasContentQuery || hasCodeFilter || hasEmbedding

  const isEvalSort = (EVAL_QUESTION_SLUGS as readonly string[]).includes(sort.by)
  const isHoursPerUnitSort = sort.by === 'hours_per_unit'

  const needsScheduleFilter = days != null || startTime != null || endTime != null || classDuration != null

  const needsSectionJoin =
    (componentTypeId?.include?.length ?? 0) > 0 ||
    (componentTypeId?.exclude?.length ?? 0) > 0 ||
    numEnrolled != null ||
    maxEnrolled != null ||
    (enrollmentStatus?.length ?? 0) > 0 ||
    (instructorSunets?.include?.length ?? 0) > 0 ||
    (instructorSunets?.exclude?.length ?? 0) > 0 ||
    numMeetingDays != null ||
    needsScheduleFilter ||
    sort.by === 'num_enrolled' ||
    isEvalSort ||
    isHoursPerUnitSort ||
    evalFilters != null ||
    hoursPerUnitFilter != null
  console.log('needsSectionJoin', needsSectionJoin)

  const compiledQuery = db

    // ═══════════════════════════════════════════════════════════
    //  CTE 0: vector_candidates
    //
    //  Top-K offerings by cosine similarity when an embedding is
    //  provided. Produces zero rows (WHERE false) when no embedding
    //  is available so the LEFT JOIN in filtered_offerings is always
    //  structurally valid.
    // ═══════════════════════════════════════════════════════════
    .with('vector_candidates', (cte) =>
      hasEmbedding
        ? cte
            .selectFrom('course_offerings as vo')
            .innerJoinLateral(
              (eb) =>
                eb
                  .selectFrom(sql`(select 1)`.as('_'))
                  .select(sql<number>`vo.embedding <=> ${embeddingVector!}::vector`.as('dist'))
                  .as('d'),
              (join) => join.onTrue(),
            )
            .select(['vo.id as offering_id', sql<number>`1 - d.dist`.as('vector_score')])
            .where('vo.embedding', 'is not', null)
            .where('vo.year', '=', year)
            .where(sql<SqlBool>`1 - d.dist >= ${VECTOR_MIN_SIMILARITY}`)
            .orderBy(sql`d.dist`)
            .limit(VECTOR_TOP_K)
        : cte
            .selectFrom('course_offerings as vo')
            .select(['vo.id as offering_id', sql<number>`null::float`.as('vector_score')])
            .where(sql<SqlBool>`false`),
    )

    // ═══════════════════════════════════════════════════════════
    //  CTEs 0.5–0.7: phrase / AND / OR candidates
    //
    //  Three tiers of full-text matching on the merged search_vector
    //  (english + simple lexemes). Each tsquery ORs both dictionaries
    //  so stemmed and unstemmed forms are matched in one pass:
    //   • phrase_candidates  – exact phrase order (phraseto_tsquery)
    //   • and_candidates     – all terms present, any order (plainto_tsquery)
    //   • or_candidates      – any term present (to_tsquery with |)
    //  Each produces zero rows when no content query is active.
    // ═══════════════════════════════════════════════════════════
    .with('phrase_candidates', (cte) =>
      hasContentQuery
        ? cte
            .selectFrom('course_content_search as cs')
            .select(['cs.offering_id', sql<number>`ts_rank(cs.search_vector, ${phraseTs})`.as('score')])
            .where(sql<SqlBool>`cs.search_vector @@ ${phraseTs}`)
            .where('cs.year', '=', year)
        : cte
            .selectFrom('course_content_search as cs')
            .select(['cs.offering_id', sql<number>`null::float`.as('score')])
            .where(sql<SqlBool>`false`),
    )

    .with('and_candidates', (cte) =>
      hasContentQuery
        ? cte
            .selectFrom('course_content_search as cs')
            .select(['cs.offering_id', sql<number>`ts_rank(cs.search_vector, ${andTs})`.as('score')])
            .where(sql<SqlBool>`cs.search_vector @@ ${andTs}`)
            .where('cs.year', '=', year)
        : cte
            .selectFrom('course_content_search as cs')
            .select(['cs.offering_id', sql<number>`null::float`.as('score')])
            .where(sql<SqlBool>`false`),
    )

    .with('or_candidates', (cte) =>
      hasContentQuery
        ? cte
            .selectFrom('course_content_search as cs')
            .select(['cs.offering_id', sql<number>`ts_rank(cs.search_vector, ${orTs})`.as('score')])
            .where(sql<SqlBool>`cs.search_vector @@ ${orTs}`)
            .where('cs.year', '=', year)
        : cte
            .selectFrom('course_content_search as cs')
            .select(['cs.offering_id', sql<number>`null::float`.as('score')])
            .where(sql<SqlBool>`false`),
    )

    // ═══════════════════════════════════════════════════════════
    //  CTE 0.95: phrase_signal
    //
    //  Global best phrase score across all phrase_candidates rows.
    //  Used to dampen AND/OR contributions when a strong phrase
    //  match exists. Always produces exactly one row.
    // ═══════════════════════════════════════════════════════════
    .with('phrase_signal', (cte) =>
      hasContentQuery
        ? cte
            .selectFrom('phrase_candidates as pc')
            .select(sql<number>`coalesce(max(pc.score), 0)`.as('best_phrase'))
        : cte
            .selectFrom('phrase_candidates as pc')
            .select(sql<number>`coalesce(max(0::float), 0)`.as('best_phrase')),
    )

    .with('and_signal', (cte) =>
      hasContentQuery
        ? cte
            .selectFrom('and_candidates as ac')
            .select(sql<number>`coalesce(max(ac.score), 0)`.as('best_and'))
        : cte
            .selectFrom('and_candidates as ac')
            .select(sql<number>`coalesce(max(0::float), 0)`.as('best_and')),
    )

    .with('code_candidates', (cte) =>
      hasCodeFilter
        ? (() => {
            const exact = cte
              .selectFrom('course_offerings as co')
              .innerJoin('subjects as s', 's.id', 'co.subject_id')
              .select(['co.id as offering_id', sql<number>`1.0`.as('code_score')])
              .where('co.year', '=', year)
              .where((eb) =>
                eb.or(
                  code!.map((c) => {
                    const conditions: Expression<SqlBool>[] = []
                    if (c.subject != null) conditions.push(eb('s.code', '=', c.subject))
                    conditions.push(eb('co.code_number', '=', c.code_number))
                    if (c.code_suffix != null)
                      conditions.push(
                        eb(eb.fn('upper', ['co.code_suffix']), '=', c.code_suffix.toUpperCase()),
                      )
                    return eb.and(conditions)
                  }),
                ),
              )

            let query = exact

            console.log('codeStrings', codeStrings)

            if (hasCodeStrings) {
              const titleTier = cte
                .selectFrom('course_offerings as co')
                .select(['co.id as offering_id', sql<number>`0.8`.as('code_score')])
                .where('co.year', '=', year)
                .where((eb) => eb.or(codeStrings.map((s) => sql<SqlBool>`co.title ILIKE ${`%${s}%`}`)))

              const descTier = cte
                .selectFrom('course_offerings as co')
                .select(['co.id as offering_id', sql<number>`0.5`.as('code_score')])
                .where('co.year', '=', year)
                .where((eb) => eb.or(codeStrings.map((s) => sql<SqlBool>`co.description ILIKE ${`%${s}%`}`)))

              query = query.union(titleTier).union(descTier)
            }

            return cte
              .selectFrom(query.as('raw_cc'))
              .select(['raw_cc.offering_id', sql<number>`max(raw_cc.code_score)`.as('code_score')])
              .groupBy('raw_cc.offering_id')
          })()
        : cte
            .selectFrom('course_offerings as co')
            .select(['co.id as offering_id', sql<number>`null::float`.as('code_score')])
            .where(sql<SqlBool>`false`),
    )

    .with('all_candidates', (cte) =>
      hasCandidateFilter
        ? (() => {
            let q = hasCodeFilter
              ? cte.selectFrom('code_candidates').select('offering_id')
              : cte
                  .selectFrom('vector_candidates')
                  .select('offering_id')
                  .where(sql<SqlBool>`false`)

            if (hasContentQuery) {
              q = q
                .union(cte.selectFrom('phrase_candidates').select('offering_id'))
                .union(cte.selectFrom('and_candidates').select('offering_id'))
                .union(cte.selectFrom('or_candidates').select('offering_id'))
            }
            if (hasEmbedding) {
              q = q.union(cte.selectFrom('vector_candidates').select('offering_id'))
            }
            return q
          })()
        : cte
            .selectFrom('course_offerings as co')
            .select(['co.id as offering_id'])
            .where(sql<SqlBool>`false`),
    )
    .with('subject_scores', (cte) =>
      hasEmbedding
        ? cte.selectFrom('subject_embedding_centroids_mv as sec').select([
            'sec.subject_id',
            sql<number>`
                round(
                  greatest(
                    1.0 / (1.0 + exp(-20.0 * (
                      (1.0 - (sec.centroid <=> ${embeddingVector!}::vector))
                      * sec.subject_multiplier * 2.0
                      - 0.38
                    ))),
                    0.8
                  ) / 0.05
                ) * 0.05
              `.as('subject_boost'),
          ])
        : cte
            .selectFrom('subject_embedding_centroids_mv as sec')
            .select(['sec.subject_id', sql<number>`null::float`.as('subject_boost')])
            .where(sql<SqlBool>`false`),
    )

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
        .leftJoin('course_enrollment_trends_mv as cet', (join) =>
          join.onRef('cet.course_id', '=', 'co.course_id').onRef('cet.year', '=', 'co.year'),
        )
        .leftJoin('all_candidates as ac', 'ac.offering_id', 'co.id')
        .leftJoin('vector_candidates as vc', 'vc.offering_id', 'co.id')
        .leftJoin('phrase_candidates as pc', 'pc.offering_id', 'co.id')
        .leftJoin('and_candidates as andc', 'andc.offering_id', 'co.id')
        .leftJoin('or_candidates as orc', 'orc.offering_id', 'co.id')
        .leftJoin('phrase_signal as ps', (join) => join.onTrue())
        .leftJoin('and_signal as ans', (join) => join.onTrue())
        .leftJoin('code_candidates as cc', 'cc.offering_id', 'co.id')
        .leftJoin('subject_scores as ss', 'ss.subject_id', 'co.subject_id')
        .where('co.year', '=', year)

        .$if(hasCandidateFilter, (qb) => qb.where('ac.offering_id', 'is not', null))

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

        // ── Has accompanying sections ───────────────────────
        .$if(hasAccompanyingSections === true, (qb) =>
          qb.where((eb) =>
            eb.exists(
              eb
                .selectFrom('sections as acc_sec')
                .whereRef('acc_sec.course_offering_id', '=', 'co.id')
                .where('acc_sec.is_principal', '=', false)
                .where('acc_sec.cancelled', '=', false)
                .$if(quarters?.include != null && quarters.include.length > 0, (q) =>
                  q.where('acc_sec.term_quarter', 'in', quarters!.include!),
                )
                .select(eb.val(1).as('one')),
            ),
          ),
        )
        .$if(hasAccompanyingSections === false, (qb) =>
          qb.where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom('sections as acc_sec')
                  .whereRef('acc_sec.course_offering_id', '=', 'co.id')
                  .where('acc_sec.is_principal', '=', false)
                  .where('acc_sec.cancelled', '=', false)
                  .$if(quarters?.include != null && quarters.include.length > 0, (q) =>
                    q.where('acc_sec.term_quarter', 'in', quarters!.include!),
                  )
                  .select(eb.val(1).as('one')),
              ),
            ),
          ),
        )

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
        .select((eb) => {
          const k = sql.lit(LOGSUMEXP_K)
          const scale = {
            phrase: sql.lit(SCALE_PHRASE),
            and: sql.lit(SCALE_AND),
            or: sql.lit(SCALE_OR),
            vector: sql.lit(SCALE_VECTOR),
            code: sql.lit(SCALE_CODE),
          }
          const dAndByPhrase = sql.lit(DAMPEN_AND_BY_PHRASE)
          const dOrByPhrase = sql.lit(DAMPEN_OR_BY_PHRASE)
          const dOrByAnd = sql.lit(DAMPEN_OR_BY_AND)
          const vFloor = sql.lit(VECTOR_FLOOR)
          const vShift = sql.lit(VECTOR_SHIFT)
          const subjectFallback = sql.lit(SUBJECT_BOOST_FALLBACK)
          const enrollWeight = sql.lit(ENROLL_BOOST_WEIGHT)
          const enrollMidpoint = sql.lit(ENROLL_BOOST_MIDPOINT)

          const relevanceScore = hasCandidateFilter
            ? sql<number>`(
                ln(
                  exp(${k} * ${scale.code} * coalesce(${eb.ref('cc.code_score')}, 0))
                  +
                  exp(${k} * ${scale.phrase} * coalesce(${eb.ref('pc.score')}, 0))
                  +
                  exp(
                    ${k} * ${scale.and} * (
                      coalesce(${eb.ref('andc.score')}, 0)
                      * (1.0 / (1.0 + ${dAndByPhrase} * ${eb.ref('ps.best_phrase')}))
                    )
                  )
                  +
                  exp(
                    ${k} * ${scale.or} * (
                      coalesce(${eb.ref('orc.score')}, 0)
                      * (1.0 / (1.0 + ${dOrByPhrase} * coalesce(${eb.ref('ps.best_phrase')}, 0)))
                      * (1.0 / (1.0 + ${dOrByAnd} * coalesce(${eb.ref('ps.best_phrase')}, 0)))
                    )
                  )
                  +
                  exp(
                    ${k} * (
                      ${scale.vector} * pow(coalesce(${eb.ref('vc.vector_score')}, ${vFloor}) + ${vShift}, 2)
                      * coalesce(${eb.ref('ss.subject_boost')}, ${subjectFallback})
                    )
                  )
                ) / ${k}
              )`
            : eb.cast(eb.val(null), 'float8')

          const codeNumberMultiplier = sql`
            CASE
              WHEN ${eb.ref('co.code_number')} < 100 THEN ${sql.lit(CODE_MULT_BELOW_100)}
              WHEN ${eb.ref('co.code_number')} < 200 THEN ${sql.lit(CODE_MULT_100)}
              WHEN ${eb.ref('co.code_number')} < 300 THEN ${sql.lit(CODE_MULT_200)}
              WHEN ${eb.ref('co.code_number')} < 400 THEN ${sql.lit(CODE_MULT_300)}
              ELSE ${sql.lit(CODE_MULT_400_PLUS)}
            END
          `

          return [
            'co.id as offering_id',
            'co.course_id',
            's.code as subject_code',
            'co.code_number',
            'co.code_suffix',
            'co.units_min',
            'co.units_max',
            sql<number>`round(
              (coalesce(${relevanceScore}, 0) * (
                1.0 + (${enrollWeight} * coalesce(${eb.ref('cet.cumulative_num_enrolled')}, 0))
                    / (coalesce(${eb.ref('cet.cumulative_num_enrolled')}, 0) + ${enrollMidpoint})
              ) * ${codeNumberMultiplier}) / ${sql.lit(RELEVANCE_SCORE_ROUNDING)}
            ) * ${sql.lit(RELEVANCE_SCORE_ROUNDING)}`.as('relevance_score'),
            'cet.cumulative_num_enrolled',
          ]
        }),
    )

    // ═══════════════════════════════════════════════════════════
    //  CTE 1.5: relevance_filtered
    //
    //  Applies the minimum relevance floor when a content query is
    //  active. A separate CTE is required because Postgres cannot
    //  reference a SELECT alias in a WHERE clause at the same level.
    // ═══════════════════════════════════════════════════════════
    .with('relevance_filtered', (qb) =>
      qb
        .selectFrom('filtered_offerings as fo')
        .selectAll()
        .$if(hasCandidateFilter, (qb) => qb.where('fo.relevance_score', '>=', MIN_RELEVANCE_THRESHOLD)),
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
          .selectFrom('relevance_filtered as fo')
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
            'fo.cumulative_num_enrolled',
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
            .$if(sort.by === 'popularity', (qb) =>
              qb.orderBy('fo.cumulative_num_enrolled', (ob) =>
                sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
              ),
            )
        }

        return q
      }

      let q = qb
        .selectFrom('relevance_filtered as fo')
        .leftJoin('sections as sec', (join) =>
          join
            .onRef('sec.course_offering_id', '=', 'fo.offering_id')
            .on('sec.is_principal', '=', true)
            .on('sec.cancelled', '=', false),
        )
        .leftJoin('section_day_counts_mv as sdc_mv', 'sdc_mv.section_id', 'sec.id')

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
                    if (startTime?.min != null) {
                      predicates.push(eb('sch_exists.start_time', 'is not', null))
                    }

                    // End time filter active → require non-null end_time
                    if (endTime?.max != null) {
                      predicates.push(eb('sch_exists.end_time', 'is not', null))
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

                      // End time max: violation = end_time after max
                      if (endTime?.max != null) {
                        violations.push(
                          eb.and([eb('sch.end_time', 'is not', null), eb('sch.end_time', '>', endTime.max)]),
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

        // ── Meeting days count (via MV) ────────────────────
        .$if(numMeetingDays?.min != null, (qb) =>
          qb.where((eb) =>
            eb(eb.fn.coalesce(eb.ref('sdc_mv.num_days'), eb.val(0)), '>=', numMeetingDays!.min!),
          ),
        )
        .$if(numMeetingDays?.max != null, (qb) =>
          qb.where((eb) =>
            eb(eb.fn.coalesce(eb.ref('sdc_mv.num_days'), eb.val(0)), '<=', numMeetingDays!.max!),
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
        .$if(isHoursPerUnitSort, (qb) =>
          qb.orderBy(
            sql`esa_hours.smart_average / NULLIF(CEIL((COALESCE(sec.units_min, fo.units_min) + COALESCE(sec.units_max, fo.units_max)) / 2.0), 0)`,
            (ob) => (sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast()),
          ),
        )
        .$if(sort.by === 'num_enrolled', (qb) =>
          qb.orderBy('sec.num_enrolled', (ob) =>
            sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          ),
        )
        .$if(sort.by === 'popularity', (qb) =>
          qb.orderBy('fo.cumulative_num_enrolled', (ob) =>
            sort.direction === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast(),
          ),
        )

        // ── Hours per unit filter ─────────────────────────
        .$if(hoursPerUnitFilter?.min != null, (qb) =>
          qb.where(
            sql`esa_hours.smart_average / NULLIF(CEIL((COALESCE(sec.units_min, fo.units_min) + COALESCE(sec.units_max, fo.units_max)) / 2.0), 0)`,
            '>=',
            hoursPerUnitFilter!.min!,
          ),
        )
        .$if(hoursPerUnitFilter?.max != null, (qb) =>
          qb.where(
            sql`esa_hours.smart_average / NULLIF(CEIL((COALESCE(sec.units_min, fo.units_min) + COALESCE(sec.units_max, fo.units_max)) / 2.0), 0)`,
            '<=',
            hoursPerUnitFilter!.max!,
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
          sql<number | null>`${
            isHoursPerUnitSort
              ? sql`esa_hours.smart_average / NULLIF(CEIL((COALESCE(sec.units_min, fo.units_min) + COALESCE(sec.units_max, fo.units_max)) / 2.0), 0)`
              : isEvalSort
                ? sql.ref(`esa_${sort.by}.smart_average`)
                : eb.val(null)
          }`.as('eval_sort_score'),
          'sec.num_enrolled',
          'fo.cumulative_num_enrolled',
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
              : sort.by === 'popularity'
                ? sql.ref('sf.cumulative_num_enrolled')
                : isEvalSort || isHoursPerUnitSort
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
      'mv.course_id',
      'mv.year',
      'mv.subject_code',
      'mv.code_number',
      'mv.code_suffix',
      'mv.title',
      'mv.title_clean',
      'mv.description',
      'mv.academic_group',
      'mv.academic_career',
      'mv.academic_organization',
      'mv.grading_option',
      'mv.final_exam_flag',
      'mv.units_min',
      'mv.units_max',
      'mv.gers',
      sql<
        MvSection[] | null
      >`CASE WHEN mv.offering_id = ANY(${sql.raw(`ARRAY[${(cachedOfferingIds ?? []).join(',')}]::int[]`)}) THEN NULL ELSE mv.sections END`.as(
        'sections',
      ),
      'mv.crosslistings',
      'sp.relevance_score',
      sql<number>`(SELECT count FROM total_count)::int`.as('total_count'),
    ])
    .compile()

  console.log(inlineParams(compiledQuery.sql, compiledQuery.parameters))

  const { rows } = await db.executeQuery(compiledQuery)

  const totalCount = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).total_count) : 0
  const results = rows as SearchQueryResult[]
  return { results, totalCount }
}
