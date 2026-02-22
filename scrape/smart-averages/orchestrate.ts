import { sql } from 'kysely'
import pl from 'nodejs-polars'
import { Data, Effect } from 'effect'

import { DbService } from '@scrape/shared/db-layer.ts'
import { computeMetrics, DEFAULT_PARAMS, type MetricParams } from './smart-average.ts'

import type { DataFrame } from 'nodejs-polars'
import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db-postgres-js'
import { values } from '@courses/db/helpers'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SmartAverageError extends Data.TaggedError('SmartAverageError')<{
  message: string
  step: string
  cause?: unknown
}> {}

// ---------------------------------------------------------------------------
// Schema casting
// ---------------------------------------------------------------------------

const REPORTS_INT_COLS = ['report_id', 'responded', 'total', 'question_id'] as const
const REPORTS_LIST_INT_COLS = [
  'course_ids',
  'instructor_ids',
  'academic_career_ids',
  'subject_ids',
  'weights',
  'frequencies',
] as const
const SECTIONS_INT_COLS = ['section_id', 'course_id'] as const
const SECTIONS_LIST_INT_COLS = ['instructor_ids', 'academic_career_ids', 'subject_ids'] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dbStep<T>(step: string, fn: (db: Kysely<DB>) => Promise<T>) {
  return Effect.gen(function* () {
    const db = yield* DbService
    return yield* Effect.tryPromise({
      try: () => fn(db),
      catch: (error) => {
        const msg = error instanceof Error ? error.message : String(error)
        return new SmartAverageError({ message: `Failed at [${step}]: ${msg}`, step, cause: error })
      },
    })
  })
}

function castReportsDf(df: DataFrame): DataFrame {
  return df.withColumns(
    ...REPORTS_INT_COLS.map((c) => pl.col(c).cast(pl.Int64)),
    ...REPORTS_LIST_INT_COLS.map((c) => pl.col(c).cast(pl.List(pl.Int64))),
  )
}

function castSectionsDf(df: DataFrame): DataFrame {
  return df.withColumns(
    ...SECTIONS_INT_COLS.map((c) => pl.col(c).cast(pl.Int64)),
    ...SECTIONS_LIST_INT_COLS.map((c) => pl.col(c).cast(pl.List(pl.Int64))),
  )
}

function minYearForTargets(yearTerms: [string, string][], maxYears: number): string {
  const earliestStart = Math.min(...yearTerms.map(([y]) => Number.parseInt(y.split('-')[0], 10)))
  const floorStart = earliestStart - maxYears
  return `${floorStart}-${floorStart + 1}`
}

// ---------------------------------------------------------------------------
// DB operations
// ---------------------------------------------------------------------------

function fetchQuestionScales() {
  return Effect.gen(function* () {
    const rows = yield* dbStep('fetch_question_scales', (db) =>
      db
        .selectFrom('evaluation_numeric_questions as q')
        .innerJoin('evaluation_numeric_responses as r', 'r.question_id', 'q.id')
        .groupBy(['q.id', 'q.question_text'])
        .select((eb) => [
          'q.id as question_id',
          'q.question_text',
          eb.fn.min('r.weight').as('w_min'),
          eb.fn.max('r.weight').as('w_max'),
        ])
        .orderBy('q.id')
        .execute(),
    )
    yield* Effect.log(`Fetched scales for ${rows.length} questions`)
    if (rows.length === 0) return pl.DataFrame()
    return pl
      .DataFrame(rows)
      .withColumns(
        pl.col('question_id').cast(pl.Int64),
        pl.col('w_min').cast(pl.Float64),
        pl.col('w_max').cast(pl.Float64),
      )
  })
}

function fetchReports(minYear: string) {
  return Effect.gen(function* () {
    const rows = yield* dbStep('fetch_reports', (db) =>
      db
        .with('report_meta', (qb) =>
          qb
            .selectFrom('evaluation_report_sections as ers')
            .innerJoin('sections as sec', 'sec.id', 'ers.section_id')
            .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
            .leftJoin('schedules as sch', 'sch.section_id', 'sec.id')
            .leftJoin('schedule_instructors as si', 'si.schedule_id', 'sch.id')
            .where('sec.cancelled', '=', false)
            .where('sec.is_principal', '=', true)
            .where('co.year', '>=', minYear)
            .groupBy('ers.report_id')
            .select((eb) => [
              'ers.report_id',
              eb.fn.agg<number[]>('array_agg', ['co.course_id']).distinct().as('course_ids'),
              eb.fn.agg<number[]>('array_agg', ['si.instructor_id']).distinct().as('instructor_ids'),
              eb.fn
                .agg<number[]>('array_agg', ['co.academic_career_id'])
                .distinct()
                .as('academic_career_ids'),
              eb.fn.agg<number[]>('array_agg', ['co.subject_id']).distinct().as('subject_ids'),
              eb.fn.min('co.year').as('year'),
              eb.fn.min(eb.cast('sec.term_quarter', 'text')).as('term_quarter'),
            ]),
        )
        .with('report_questions', (qb) =>
          qb
            .selectFrom('evaluation_numeric_responses as enr')
            .groupBy(['enr.report_id', 'enr.question_id'])
            .select([
              'enr.report_id',
              'enr.question_id',
              sql<number[]>`array_agg(enr.weight order by enr.weight)`.as('weights'),
              sql<number[]>`array_agg(enr.frequency order by enr.weight)`.as('frequencies'),
            ]),
        )
        .selectFrom('report_meta as rm')
        .innerJoin('evaluation_reports as er', 'er.id', 'rm.report_id')
        .innerJoin('report_questions as rq', 'rq.report_id', 'rm.report_id')
        .orderBy('rm.year', 'desc')
        .orderBy('rm.report_id')
        .orderBy('rq.question_id')
        .select((eb) => [
          'rm.report_id',
          eb.fn.coalesce('rm.course_ids', sql`array[]::integer[]`).as('course_ids'),
          eb.fn.coalesce('rm.instructor_ids', sql`array[]::integer[]`).as('instructor_ids'),
          eb.fn.coalesce('rm.academic_career_ids', sql`array[]::integer[]`).as('academic_career_ids'),
          eb.fn.coalesce('rm.subject_ids', sql`array[]::integer[]`).as('subject_ids'),
          'rm.year',
          'rm.term_quarter',
          'er.responded',
          'er.total',
          'rq.question_id',
          'rq.weights',
          'rq.frequencies',
        ])
        .execute(),
    )
    yield* Effect.log(`Fetched ${rows.length} report rows (min_year=${minYear})`)
    if (rows.length === 0) return pl.DataFrame()
    return castReportsDf(pl.DataFrame(rows))
  })
}

function fetchSections(year: string, termQuarter: string) {
  return Effect.gen(function* () {
    const rows = yield* dbStep('fetch_sections', (db) =>
      db
        .selectFrom('sections as sec')
        .innerJoin('course_offerings as co', 'co.id', 'sec.course_offering_id')
        .leftJoin('schedules as sch', 'sch.section_id', 'sec.id')
        .leftJoin('schedule_instructors as si', 'si.schedule_id', 'sch.id')
        .leftJoin('course_offerings as co_sibling', (join) =>
          join.onRef('co_sibling.course_id', '=', 'co.course_id').on('co_sibling.year', '=', year),
        )
        .where('sec.cancelled', '=', false)
        .where('co.year', '=', year)
        .where(sql`sec.term_quarter::text`, '=', termQuarter)
        .groupBy(['sec.id', 'co.course_id', 'co.year', 'sec.term_quarter'])
        .select((eb) => [
          'sec.id as section_id',
          'co.course_id',
          eb.fn
            .coalesce(
              eb.fn.agg<number[]>('array_agg', ['si.instructor_id']).distinct(),
              sql`array[]::integer[]`,
            )
            .as('instructor_ids'),
          eb.fn
            .agg<number[]>('array_agg', ['co_sibling.academic_career_id'])
            .distinct()
            .as('academic_career_ids'),
          eb.fn.agg<number[]>('array_agg', ['co_sibling.subject_id']).distinct().as('subject_ids'),
          'co.year',
          eb.cast('sec.term_quarter', 'text').as('term_quarter'),
        ])
        .execute(),
    )
    yield* Effect.log(`Fetched ${rows.length} sections for ${year}/${termQuarter}`)
    if (rows.length === 0) return pl.DataFrame()
    return castSectionsDf(pl.DataFrame(rows))
  })
}

function writeResults(results: DataFrame, chunkCount = 16) {
  return Effect.gen(function* () {
    if (results.height === 0) return 0

    const filtered = results
      .filter(pl.col('smart_average').isNotNull())
      .select('section_id', 'question_id', 'smart_average', 'is_course_informed', 'is_instructor_informed')

    if (filtered.height === 0) return 0

    const sorted = filtered.sort(['section_id', 'question_id'])

    type Row = {
      section_id: number
      question_id: number
      smart_average: number
      is_course_informed: boolean
      is_instructor_informed: boolean
    }

    const allRows = sorted.toRecords() as Row[]
    if (allRows.length === 0) return 0

    const total = allRows.length
    const n = Math.max(1, Math.min(chunkCount, total))

    // Use Polars to compute the first row index of each section in sorted order.
    // These are valid chunk cut positions (except 0 which we add manually).
    const sectionStarts = sorted
      .withRowIndex('row_nr')
      .groupBy('section_id')
      .agg(pl.col('row_nr').min().alias('start_row'))
      .sort('start_row')
      .getColumn('start_row')
      .toArray() as number[]

    // Build section-safe boundaries by moving forward through sectionStarts
    // to the first section boundary at/after each approximate cut.
    const boundaries: number[] = [0]
    let startPtr = 0 // pointer into sectionStarts, monotonic increasing

    for (let i = 1; i < n; i++) {
      const approx = Math.floor((total * i) / n)
      const lastBoundary = boundaries[boundaries.length - 1]!

      if (approx <= lastBoundary) continue
      if (approx >= total) break

      // Advance pointer to first start_row >= approx
      while (startPtr < sectionStarts.length && sectionStarts[startPtr]! < approx) {
        startPtr++
      }

      if (startPtr >= sectionStarts.length) break

      const cut = sectionStarts[startPtr]!
      if (cut > lastBoundary && cut < total) {
        boundaries.push(cut)
      }
    }

    boundaries.push(total)

    let totalMerged = 0

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i]!
      const end = boundaries[i + 1]!
      if (end <= start) continue

      const rows = allRows.slice(start, end)
      if (rows.length === 0) continue

      // Safe because chunk boundaries never split a section.
      const sectionIds = [...new Set(rows.map((r) => r.section_id))]

      yield* dbStep(`merge_results_${i + 1}`, (db) =>
        db
          .mergeInto('evaluation_smart_averages as trg')
          .using(values(rows, 'src', { smart_average: 'float8' }), (join) =>
            join.on(({ eb, and, ref }) =>
              and([
                eb(ref('trg.section_id'), '=', ref('src.section_id')),
                eb(ref('trg.question_id'), '=', ref('src.question_id')),
              ]),
            ),
          )
          .whenMatched()
          .thenUpdateSet(({ ref }) => ({
            smart_average: ref('src.smart_average'),
            is_course_informed: ref('src.is_course_informed'),
            is_instructor_informed: ref('src.is_instructor_informed'),
          }))
          .whenNotMatched()
          .thenInsertValues(({ ref }) => ({
            section_id: ref('src.section_id'),
            question_id: ref('src.question_id'),
            smart_average: ref('src.smart_average'),
            is_course_informed: ref('src.is_course_informed'),
            is_instructor_informed: ref('src.is_instructor_informed'),
          }))
          .whenNotMatchedBySourceAnd((eb) => eb('trg.section_id', 'in', sectionIds))
          .thenDelete()
          .execute(),
      )

      totalMerged += rows.length
    }

    yield* Effect.log(`Merged ${totalMerged} metric rows in ${boundaries.length - 1} chunk(s)`)

    return totalMerged
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BatchStats {
  year: string
  termQuarter: string
  sections: number
  rowsWritten: number
}

export function computeAndStoreMetrics(yearTerms: [string, string][], params: MetricParams = DEFAULT_PARAMS) {
  return Effect.gen(function* () {
    if (yearTerms.length === 0) return [] as BatchStats[]

    const questionScales = yield* fetchQuestionScales()
    if (questionScales.height === 0) {
      yield* Effect.logWarning('No question scales found — cannot compute metrics')
      return yearTerms.map(
        ([year, termQuarter]): BatchStats => ({ year, termQuarter, sections: 0, rowsWritten: 0 }),
      )
    }

    const minYear = minYearForTargets(yearTerms, params.maxYears)
    const reportsDf = yield* fetchReports(minYear)

    if (reportsDf.height === 0) {
      yield* Effect.logWarning(`No report data found (min_year=${minYear})`)
      return yearTerms.map(
        ([year, termQuarter]): BatchStats => ({ year, termQuarter, sections: 0, rowsWritten: 0 }),
      )
    }

    const allStats: BatchStats[] = []

    for (const [year, termQuarter] of yearTerms) {
      yield* Effect.log(`Processing ${year}/${termQuarter}`)
      const sectionsDf = yield* fetchSections(year, termQuarter)

      if (sectionsDf.height === 0) {
        yield* Effect.log(`No sections for ${year}/${termQuarter}, skipping`)
        allStats.push({ year, termQuarter, sections: 0, rowsWritten: 0 })
        continue
      }

      const results = computeMetrics(reportsDf, sectionsDf, questionScales, params)
      yield* Effect.log(`Computed metrics for ${year}/${termQuarter}`)

      const rowsWritten = yield* writeResults(results)
      allStats.push({ year, termQuarter, sections: sectionsDf.height, rowsWritten })
      yield* Effect.log(
        `  ${year}/${termQuarter}: ${sectionsDf.height} sections, ${rowsWritten} rows written`,
      )
    }

    const db = yield* DbService
    yield* Effect.promise(() => db.executeQuery(sql`SET statement_timeout = '25min'`.compile(db)))
    yield* Effect.log('Set statement timeout to 25 minutes')

    yield* Effect.log('Refreshing course offerings full materialized view...')
    yield* Effect.promise(() =>
      db.schema.refreshMaterializedView('course_offerings_full_mv').concurrently().execute(),
    )
    yield* Effect.log('Refreshed course offerings full materialized view...')

    return allStats
  })
}
