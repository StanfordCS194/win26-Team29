import pl, { type DataFrame, type Expr } from 'nodejs-polars'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUARTER_NAMES = Object.entries({ autumn: 0, winter: 1, spring: 2, summer: 3 })

// ---------------------------------------------------------------------------
// Per-question parameter types & defaults
// ---------------------------------------------------------------------------

export interface QuestionParams {
  baseCourse: number
  baseInstructor: number
  baseInteraction: number
  wCareer: number
  wSubject: number
  decay: number
  dampeningK: number
  /** Bayesian shrinkage prior weight. null => disable priors entirely for this question. */
  m: number | null
}

/** Global (question-independent) parameters */
export interface GlobalParams {
  maxYears: number
}

export interface MetricParams extends GlobalParams {
  /** Fallback for questions not in QUESTION_PARAMS */
  defaults: QuestionParams
}

export const DEFAULT_QUESTION_PARAMS: QuestionParams = {
  baseCourse: 0.25,
  baseInstructor: 0.0,
  baseInteraction: 0.75,
  wCareer: 0.1,
  wSubject: 0.1,
  decay: 0.8,
  dampeningK: 0.7,
  m: null,
}

export const DEFAULT_PARAMS: MetricParams = {
  maxYears: 4,
  defaults: DEFAULT_QUESTION_PARAMS,
}

/** Per-question param overrides for well-known questions */
export const QUESTION_PARAMS: Record<string, QuestionParams> = {
  'Overall, how would you describe the quality of the instruction in this course?': {
    baseCourse: 0.15,
    baseInstructor: 0.15,
    baseInteraction: 0.7,
    wCareer: 0.05,
    wSubject: 0.05,
    decay: 0.8,
    dampeningK: 0.75,
    m: 10.0,
  },
  'How much did you learn from this course?': {
    baseCourse: 0.15,
    baseInstructor: 0.15,
    baseInteraction: 0.7,
    wCareer: 0.05,
    wSubject: 0.05,
    decay: 0.8,
    dampeningK: 0.75,
    m: 10.0,
  },
  'How organized was the course?': {
    baseCourse: 0.15,
    baseInstructor: 0.15,
    baseInteraction: 0.7,
    wCareer: 0.05,
    wSubject: 0.05,
    decay: 0.8,
    dampeningK: 0.75,
    m: 10.0,
  },
  'How well did you achieve the learning goals of this course?': {
    baseCourse: 0.15,
    baseInstructor: 0.15,
    baseInteraction: 0.7,
    wCareer: 0.05,
    wSubject: 0.05,
    decay: 0.8,
    dampeningK: 0.75,
    m: 10.0,
  },
  'About what percent of the class meetings (including discussions) did you attend in person?': {
    baseCourse: 0.5,
    baseInstructor: 0.0,
    baseInteraction: 0.5,
    wCareer: 0.0,
    wSubject: 0.0,
    decay: 0.6,
    dampeningK: 0.4,
    m: null,
  },
  'About what percent of the class meetings did you attend online?': {
    baseCourse: 0.5,
    baseInstructor: 0.0,
    baseInteraction: 0.5,
    wCareer: 0.0,
    wSubject: 0.0,
    decay: 0.6,
    dampeningK: 0.4,
    m: null,
  },
  'How many hours per week on average did you spend on this course (including class meetings)?': {
    baseCourse: 0.55,
    baseInstructor: 0.0,
    baseInteraction: 0.45,
    wCareer: 0.05,
    wSubject: 0.05,
    decay: 0.8,
    dampeningK: 0.4,
    m: null,
  },
}

// ---------------------------------------------------------------------------
// Question param lookup (plain JS; no DataFrame)
// ---------------------------------------------------------------------------

interface QuestionScaleRow {
  question_id: number
  question_text: string
  w_min: number
  w_max: number
}

interface ResolvedQuestionInfo {
  questionId: number
  questionText: string
  wMin: number
  wMax: number
  params: QuestionParams
}

function resolveQuestionInfos(questionScales: DataFrame, defaults: QuestionParams): ResolvedQuestionInfo[] {
  const records = questionScales
    .select('question_id', 'question_text', 'w_min', 'w_max')
    .toRecords() as Array<QuestionScaleRow>

  return records.map((row) => {
    const hasCustomParams = row.question_text in QUESTION_PARAMS
    if (hasCustomParams) {
      console.log('Question text using custom params: ', row.question_text)
    }
    return {
      questionId: Number(row.question_id),
      questionText: String(row.question_text),
      wMin: Number(row.w_min),
      wMax: Number(row.w_max),
      params: QUESTION_PARAMS[row.question_text] ?? defaults,
    }
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quarterOrd(colName: string, alias: string): Expr {
  return pl
    .when(pl.col(colName).str.toLowerCase().eq(pl.lit('autumn')))
    .then(pl.lit(0))
    .when(pl.col(colName).str.toLowerCase().eq(pl.lit('winter')))
    .then(pl.lit(1))
    .when(pl.col(colName).str.toLowerCase().eq(pl.lit('spring')))
    .then(pl.lit(2))
    .when(pl.col(colName).str.toLowerCase().eq(pl.lit('summer')))
    .then(pl.lit(3))
    .otherwise(pl.lit(0))
    .cast(pl.Int64)
    .alias(alias)
}

function makePriorKey(subjectIds: number[], careerIds: number[]): string {
  const subjectKey = [...subjectIds].sort((a, b) => a - b).join(',')
  const careerKey = [...careerIds].sort((a, b) => a - b).join(',')
  return `${subjectKey}|${careerKey}`
}

function emptyResult(): DataFrame {
  return pl.DataFrame(
    {
      section_id: [] as number[],
      question_id: [] as number[],
      smart_average: [] as number[],
      is_course_informed: [] as boolean[],
      is_instructor_informed: [] as boolean[],
    },
    {
      schema: {
        section_id: pl.Int64,
        question_id: pl.Int64,
        smart_average: pl.Float64,
        is_course_informed: pl.Bool,
        is_instructor_informed: pl.Bool,
      },
    },
  )
}

/**
 * Compute per-report-question stats (raw_mean → normalized_mean) using global
 * question scales rather than per-report observed min/max.
 *
 * `questionScales` must have columns: question_id (Int64), w_min (Float64), w_max (Float64)
 */
function addReportQuestionStats(df: DataFrame, questionScales: DataFrame): DataFrame {
  const withIdx = df.withRowIndex('_row_idx')

  const wfSums = withIdx
    .select('_row_idx', 'weights', 'frequencies')
    .explode('weights', 'frequencies')
    .withColumns(pl.col('weights').cast(pl.Float64).mul(pl.col('frequencies').cast(pl.Float64)).alias('_wf'))
    .groupBy('_row_idx')
    .agg(pl.col('_wf').sum().alias('wf_sum'))

  return withIdx
    .withColumns(pl.col('frequencies').lst.sum().cast(pl.Int64).alias('n'))
    .join(wfSums, { on: '_row_idx' })
    .drop('_row_idx')
    .withColumns(pl.col('wf_sum').div(pl.col('n').cast(pl.Float64)).alias('raw_mean'))
    .join(questionScales.select('question_id', 'w_min', 'w_max'), { on: 'question_id', how: 'inner' })
    .withColumns(
      pl
        .when(pl.col('w_max').neq(pl.col('w_min')))
        .then(
          pl
            .col('raw_mean')
            .minus(pl.col('w_min'))
            .div(pl.col('w_max').minus(pl.col('w_min'))),
        )
        .otherwise(pl.lit(0.0))
        .alias('normalized_mean'),
    )
    .drop('wf_sum', 'raw_mean')
}

function filterEligibleReports(
  reportMeta: DataFrame,
  targetStartYear: number,
  targetQuarterOrd: number,
  maxYears: number,
): DataFrame {
  return reportMeta
    .withColumns(pl.lit(targetStartYear).minus(pl.col('report_start_year')).alias('years_ago'))
    .filter(pl.col('years_ago').gtEq(0).and(pl.col('years_ago').ltEq(maxYears)))
    .filter(
      pl
        .col('years_ago')
        .gt(0)
        .or(pl.col('quarter_ord').ltEq(pl.lit(targetQuarterOrd))),
    )
}

// ---------------------------------------------------------------------------
// Vectorized hierarchical prior computation (single question version)
// ---------------------------------------------------------------------------

/** Bayesian shrinkage: (n * avg + m * fallback) / (n + m) */
function shrinkExpr(nCol: string, avgCol: string, m: number, fallbackCol: string, alias: string): Expr {
  return pl
    .col(nCol)
    .mul(pl.col(avgCol))
    .plus(pl.lit(m).mul(pl.col(fallbackCol)))
    .div(pl.col(nCol).plus(pl.lit(m)))
    .alias(alias)
}

/** Weighted-mean aggregation expressions used at each hierarchy level */
function weightedMeanAggs(avgAlias: string, nAlias: string): Expr[] {
  return [
    pl.col('normalized_mean').mul(pl.col('decayed_n')).sum().div(pl.col('decayed_n').sum()).alias(avgAlias),
    pl.col('decayed_n').sum().alias(nAlias),
  ]
}

/**
 * Compute hierarchical priors for a single question over all prior keys.
 * Hierarchy: career → subject → (subject, career). No global level.
 *
 * timeStatsQ columns:
 *   normalized_mean, decayed_n, subject_ids, academic_career_ids
 *
 * Returns:
 *   (prior_key, prior, subject_informed)
 */
function computeAllPriorsForQuestion(
  timeStatsQ: DataFrame,
  keyToLists: Map<string, [number[], number[]]>,
  m: number,
): DataFrame {
  if (timeStatsQ.height === 0 || keyToLists.size === 0) {
    return pl.DataFrame(
      { prior_key: [] as string[], prior: [] as number[], subject_informed: [] as boolean[] },
      { schema: { prior_key: pl.Utf8, prior: pl.Float64, subject_informed: pl.Bool } },
    )
  }

  const tsWithIdx = timeStatsQ.withRowIndex('_ts_idx')

  const tsCareer = tsWithIdx
    .select('_ts_idx', 'academic_career_ids')
    .explode('academic_career_ids')
    .rename({ academic_career_ids: 'career_id' })
    .dropNulls('career_id')
    .unique({ subset: ['_ts_idx', 'career_id'] })

  const tsSubject = tsWithIdx
    .select('_ts_idx', 'subject_ids')
    .explode('subject_ids')
    .rename({ subject_ids: 'subject_id' })
    .dropNulls('subject_id')
    .unique({ subset: ['_ts_idx', 'subject_id'] })

  const tsCore = tsWithIdx.select('_ts_idx', 'normalized_mean', 'decayed_n')

  const perCareerAvg = tsCareer
    .join(tsCore, { on: '_ts_idx', how: 'inner' })
    .groupBy('career_id')
    .agg(...weightedMeanAggs('career_avg', 'career_n'))

  const perSubjectAvg = tsSubject
    .join(tsCore, { on: '_ts_idx', how: 'inner' })
    .groupBy('subject_id')
    .agg(...weightedMeanAggs('subject_avg', 'subject_n'))

  const perSCAvg = tsCareer
    .join(tsSubject, { on: '_ts_idx', how: 'inner' })
    .join(tsCore, { on: '_ts_idx', how: 'inner' })
    .groupBy('subject_id', 'career_id')
    .agg(...weightedMeanAggs('sc_avg', 'sc_n'))

  const keyCareerRows: { prior_key: string[]; career_id: number[] } = { prior_key: [], career_id: [] }
  const keySubjectRows: { prior_key: string[]; subject_id: number[] } = { prior_key: [], subject_id: [] }
  const keySCRows: { prior_key: string[]; subject_id: number[]; career_id: number[] } = {
    prior_key: [],
    subject_id: [],
    career_id: [],
  }

  for (const [key, [subjList, careerList]] of keyToLists) {
    for (const cid of careerList) {
      keyCareerRows.prior_key.push(key)
      keyCareerRows.career_id.push(cid)
    }
    for (const sid of subjList) {
      keySubjectRows.prior_key.push(key)
      keySubjectRows.subject_id.push(sid)
    }
    for (const sid of subjList) {
      for (const cid of careerList) {
        keySCRows.prior_key.push(key)
        keySCRows.subject_id.push(sid)
        keySCRows.career_id.push(cid)
      }
    }
  }

  const emptyKey = (extra: Record<string, number[]>, extraSchema: Record<string, unknown>) =>
    pl.DataFrame({ prior_key: [] as string[], ...extra }, { schema: { prior_key: pl.Utf8, ...extraSchema } })

  const keyCareerAgg =
    keyCareerRows.career_id.length > 0
      ? pl
          .DataFrame(keyCareerRows)
          .withColumns(pl.col('career_id').cast(pl.Int64))
          .join(perCareerAvg, { on: 'career_id', how: 'inner' })
          .groupBy('prior_key')
          .agg(
            pl
              .col('career_avg')
              .mul(pl.col('career_n'))
              .sum()
              .div(pl.col('career_n').sum())
              .alias('key_career_avg'),
            pl.col('career_n').sum().alias('key_career_n'),
          )
      : emptyKey(
          { key_career_avg: [], key_career_n: [] },
          { key_career_avg: pl.Float64, key_career_n: pl.Float64 },
        )

  const keySubjectAgg =
    keySubjectRows.subject_id.length > 0
      ? pl
          .DataFrame(keySubjectRows)
          .withColumns(pl.col('subject_id').cast(pl.Int64))
          .join(perSubjectAvg, { on: 'subject_id', how: 'inner' })
          .groupBy('prior_key')
          .agg(
            pl
              .col('subject_avg')
              .mul(pl.col('subject_n'))
              .sum()
              .div(pl.col('subject_n').sum())
              .alias('key_subject_avg'),
            pl.col('subject_n').sum().alias('key_subject_n'),
          )
      : emptyKey(
          { key_subject_avg: [], key_subject_n: [] },
          { key_subject_avg: pl.Float64, key_subject_n: pl.Float64 },
        )

  const keySCAgg =
    keySCRows.prior_key.length > 0
      ? pl
          .DataFrame(keySCRows)
          .withColumns(pl.col('subject_id').cast(pl.Int64), pl.col('career_id').cast(pl.Int64))
          .join(perSCAvg, { on: ['subject_id', 'career_id'], how: 'inner' })
          .groupBy('prior_key')
          .agg(
            pl.col('sc_avg').mul(pl.col('sc_n')).sum().div(pl.col('sc_n').sum()).alias('key_sc_avg'),
            pl.col('sc_n').sum().alias('key_sc_n'),
          )
      : emptyKey({ key_sc_avg: [], key_sc_n: [] }, { key_sc_avg: pl.Float64, key_sc_n: pl.Float64 })

  const base = pl.DataFrame({ prior_key: [...keyToLists.keys()] })

  return base
    .join(keyCareerAgg, { on: 'prior_key', how: 'left' })
    .withColumns(pl.col('key_career_n').fillNull(0.0))
    .withColumns(pl.col('key_career_avg').alias('prior_3'))
    .join(keySubjectAgg, { on: 'prior_key', how: 'left' })
    .withColumns(pl.col('key_subject_avg').fillNull(pl.col('prior_3')), pl.col('key_subject_n').fillNull(0.0))
    .withColumns(shrinkExpr('key_subject_n', 'key_subject_avg', m, 'prior_3', 'prior_2'))
    .join(keySCAgg, { on: 'prior_key', how: 'left' })
    .withColumns(pl.col('key_sc_avg').fillNull(pl.col('prior_2')), pl.col('key_sc_n').fillNull(0.0))
    .withColumns(shrinkExpr('key_sc_n', 'key_sc_avg', m, 'prior_2', 'prior'))
    .withColumns(pl.col('key_subject_n').gt(0).or(pl.col('key_sc_n').gt(0)).alias('subject_informed'))
    .select('prior_key', 'prior', 'subject_informed')
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

function generateCoursePairs(groupSections: DataFrame, eligibleMeta: DataFrame): DataFrame {
  const reportCourses = eligibleMeta
    .select('report_id', 'course_ids')
    .explode('course_ids')
    .rename({ course_ids: 'course_id' })
    .unique({ subset: ['report_id', 'course_id'] })

  return groupSections
    .select('section_id', 'course_id')
    .join(reportCourses, { on: 'course_id', how: 'inner' })
    .select('section_id', 'report_id')
    .unique({ subset: ['section_id', 'report_id'] })
    .withColumns(pl.lit(1.0).alias('course_match'))
}

function generateInstructorPairs(groupSections: DataFrame, eligibleMeta: DataFrame): DataFrame {
  const secInst = groupSections
    .select('section_id', 'instructor_ids')
    .explode('instructor_ids')
    .rename({ instructor_ids: 'instructor_id' })
    .dropNulls('instructor_id')
    .unique({ subset: ['section_id', 'instructor_id'] })

  const repInst = eligibleMeta
    .select('report_id', 'instructor_ids')
    .explode('instructor_ids')
    .rename({ instructor_ids: 'instructor_id' })
    .dropNulls('instructor_id')
    .unique({ subset: ['report_id', 'instructor_id'] })

  return secInst
    .join(repInst, { on: 'instructor_id', how: 'inner' })
    .groupBy('section_id', 'report_id')
    .agg(pl.col('instructor_id').nUnique().cast(pl.Int64).alias('inst_intersection'))
}

// ---------------------------------------------------------------------------
// Similarity computation
// ---------------------------------------------------------------------------

interface ExplodedMappings {
  secCareer: DataFrame
  repCareer: DataFrame
  secSubject: DataFrame
  repSubject: DataFrame
}

function preExplodeMappings(groupSections: DataFrame, eligibleMeta: DataFrame): ExplodedMappings {
  const secCareer = groupSections
    .select('section_id', pl.col('academic_career_ids').alias('career_ids'))
    .explode('career_ids')
    .rename({ career_ids: 'career_id' })
    .dropNulls('career_id')
    .unique({ subset: ['section_id', 'career_id'] })

  const repCareer = eligibleMeta
    .select('report_id', pl.col('academic_career_ids').alias('career_ids'))
    .explode('career_ids')
    .rename({ career_ids: 'career_id' })
    .dropNulls('career_id')
    .unique({ subset: ['report_id', 'career_id'] })

  const secSubject = groupSections
    .select('section_id', 'subject_ids')
    .explode('subject_ids')
    .rename({ subject_ids: 'subject_id' })
    .dropNulls('subject_id')
    .unique({ subset: ['section_id', 'subject_id'] })

  const repSubject = eligibleMeta
    .select('report_id', 'subject_ids')
    .explode('subject_ids')
    .rename({ subject_ids: 'subject_id' })
    .dropNulls('subject_id')
    .unique({ subset: ['report_id', 'subject_id'] })

  return { secCareer, repCareer, secSubject, repSubject }
}

function computeCareerSim(pairs: DataFrame, mappings: ExplodedMappings): DataFrame {
  const carEdges = mappings.secCareer
    .join(mappings.repCareer, { on: 'career_id', how: 'inner' })
    .join(pairs.select('section_id', 'report_id'), { on: ['section_id', 'report_id'], how: 'inner' })

  const carPairs = carEdges
    .groupBy('section_id', 'report_id')
    .agg(pl.col('career_id').nUnique().cast(pl.Int64).alias('career_intersection'))

  return pairs
    .join(carPairs, { on: ['section_id', 'report_id'], how: 'left' })
    .withColumns(pl.col('career_intersection').fillNull(0).cast(pl.Int64))
    .withColumns(
      pl
        .col('section_career_len')
        .plus(pl.col('report_career_len'))
        .minus(pl.col('career_intersection'))
        .alias('career_union'),
    )
    .withColumns(
      pl
        .when(pl.col('career_union').gt(0))
        .then(
          pl
            .col('career_intersection')
            .cast(pl.Float64)
            .div(pl.col('career_union').cast(pl.Float64))
            .pow(0.5),
        )
        .otherwise(pl.lit(0.0))
        .alias('career_sim'),
    )
    .drop('career_union')
}

function computeSubjectMatch(pairs: DataFrame, mappings: ExplodedMappings): DataFrame {
  const subPairs = mappings.secSubject
    .join(mappings.repSubject, { on: 'subject_id', how: 'inner' })
    .join(pairs.select('section_id', 'report_id'), { on: ['section_id', 'report_id'], how: 'inner' })
    .select('section_id', 'report_id')
    .unique({ subset: ['section_id', 'report_id'] })
    .withColumns(pl.lit(1.0).alias('subject_match'))

  return pairs
    .join(subPairs, { on: ['section_id', 'report_id'], how: 'left' })
    .withColumns(pl.col('subject_match').fillNull(0.0))
}

// ---------------------------------------------------------------------------
// Dampening
// ---------------------------------------------------------------------------

function dampenedLogExprColumn(xCol: Expr, k: number): Expr {
  if (!(k > 0)) return xCol
  const kLit = pl.lit(k)
  return kLit
    .mul(xCol)
    .plus(pl.lit(1.0))
    .log()
    .div(kLit.plus(pl.lit(1.0)).log())
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeMetrics(
  reportsDf: DataFrame,
  sectionsDf: DataFrame,
  questionScales: DataFrame,
  params: MetricParams = DEFAULT_PARAMS,
): DataFrame {
  const tTotal = performance.now()
  console.error(
    `compute_metrics: START — reports=${reportsDf.height} rows, sections=${sectionsDf.height} rows, questions=${questionScales.height}`,
  )

  if (reportsDf.height === 0 || sectionsDf.height === 0) {
    console.error('compute_metrics: empty input')
    return emptyResult()
  }
  if (questionScales.height === 0) {
    console.error('compute_metrics: no question scales')
    return emptyResult()
  }

  const resolvedQuestions = resolveQuestionInfos(questionScales, params.defaults)

  // Step 1: Normalize reports once (all questions)
  let t0 = performance.now()
  console.error('Step 1: Normalizing report data …')

  const rqAll = addReportQuestionStats(reportsDf, questionScales)
    .withColumns(
      pl.col('year').str.split('-').lst.first().cast(pl.Int64).alias('report_start_year'),
      quarterOrd('term_quarter', 'quarter_ord'),
    )
    .select(
      'report_id',
      'question_id',
      'normalized_mean',
      'n',
      'report_start_year',
      'quarter_ord',
      'course_ids',
      'instructor_ids',
      'academic_career_ids',
      'subject_ids',
    )
    .filter(pl.col('n').gt(0))

  const reportMeta = rqAll
    .groupBy('report_id')
    .agg(
      pl.col('course_ids').first(),
      pl.col('instructor_ids').first(),
      pl.col('academic_career_ids').first(),
      pl.col('subject_ids').first(),
      pl.col('report_start_year').first(),
      pl.col('quarter_ord').first(),
    )
    .withColumns(
      pl.col('instructor_ids').lst.lengths().cast(pl.Int64).alias('report_instructor_len'),
      pl.col('academic_career_ids').lst.lengths().cast(pl.Int64).alias('report_career_len'),
    )

  const reportQAll = rqAll.select(
    'report_id',
    'question_id',
    'normalized_mean',
    'n',
    'report_start_year',
    'quarter_ord',
    'subject_ids',
    'academic_career_ids',
  )

  console.error(
    `Step 1: Done in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${reportMeta.height} unique reports, ${reportQAll.height} (report, question) rows`,
  )

  // Step 2: Prepare sections once
  t0 = performance.now()
  console.error('Step 2: Preparing sections …')

  const sections = sectionsDf.withColumns(
    pl.col('year').str.split('-').lst.first().cast(pl.Int64).alias('start_year'),
    quarterOrd('term_quarter', 'target_quarter_ord'),
    pl.col('instructor_ids').lst.lengths().cast(pl.Int64).alias('section_instructor_len'),
    pl.col('academic_career_ids').lst.lengths().cast(pl.Int64).alias('section_career_len'),
  )

  const timeGroups = sections.select('start_year', 'target_quarter_ord').unique()
  const nGroups = timeGroups.height

  console.error(
    `Step 2: Done in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${sections.height} sections across ${nGroups} time group(s)`,
  )

  const allResults: DataFrame[] = []
  const timeGroupRecords = timeGroups.toRecords()

  // Step 3: Process each time group
  for (let groupIdx = 0; groupIdx < timeGroupRecords.length; groupIdx++) {
    const tg = timeGroupRecords[groupIdx] as { start_year: number; target_quarter_ord: number }
    const targetStartYear = Number(tg.start_year)
    const targetQuarterOrd = Number(tg.target_quarter_ord)
    const quarterName = QUARTER_NAMES.find(([, v]) => v === targetQuarterOrd)?.[0] ?? String(targetQuarterOrd)
    const groupLabel = `${targetStartYear}/${quarterName}`
    const tGroup = performance.now()

    console.error(`Step 3: Time group ${groupIdx + 1}/${nGroups} [${groupLabel}] ──────────────────────────`)

    const groupSections = sections.filter(
      pl
        .col('start_year')
        .eq(pl.lit(targetStartYear))
        .and(pl.col('target_quarter_ord').eq(pl.lit(targetQuarterOrd))),
    )
    console.error(`  3a: ${groupSections.height} sections in group`)

    // 3a: Eligible reports (shared by all questions in this time group)
    t0 = performance.now()
    const eligibleMeta = filterEligibleReports(reportMeta, targetStartYear, targetQuarterOrd, params.maxYears)
    console.error(
      `  3a: Filtered eligible reports in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${eligibleMeta.height} eligible (of ${reportMeta.height} total)`,
    )
    if (eligibleMeta.height === 0) {
      console.error('  3a: SKIP — no eligible reports')
      continue
    }

    // 3b: Candidate generation (shared by all questions in this time group)
    t0 = performance.now()
    console.error('  3b: Generating candidate pairs …')

    const coursePairs = generateCoursePairs(groupSections, eligibleMeta)
    const instPairs = generateInstructorPairs(groupSections, eligibleMeta)
    console.error(`    course pairs: ${coursePairs.height}, instructor pairs: ${instPairs.height}`)

    const candidateKeys = pl
      .concat([coursePairs.select('section_id', 'report_id'), instPairs.select('section_id', 'report_id')])
      .unique({ subset: ['section_id', 'report_id'] })

    let basePairs = candidateKeys
      .join(coursePairs.select('section_id', 'report_id', 'course_match'), {
        on: ['section_id', 'report_id'],
        how: 'left',
      })
      .join(instPairs.select('section_id', 'report_id', 'inst_intersection'), {
        on: ['section_id', 'report_id'],
        how: 'left',
      })
      .withColumns(
        pl.col('course_match').fillNull(0.0),
        pl.col('inst_intersection').fillNull(0).cast(pl.Int64),
      )

    console.error(
      `  3b: Done in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${basePairs.height} unique candidate pairs`,
    )
    if (basePairs.height === 0) {
      console.error('  3b: SKIP')
      continue
    }

    // 3c: Similarity features (shared by all questions in this time group)
    t0 = performance.now()
    console.error('  3c: Computing similarity features …')

    const mappings = preExplodeMappings(groupSections, eligibleMeta)
    const secLen = groupSections.select('section_id', 'section_instructor_len', 'section_career_len')
    const repLen = eligibleMeta.select('report_id', 'report_instructor_len', 'report_career_len')

    basePairs = basePairs
      .join(secLen, { on: 'section_id', how: 'inner' })
      .join(repLen, { on: 'report_id', how: 'inner' })
      .withColumns(
        pl
          .col('section_instructor_len')
          .plus(pl.col('report_instructor_len'))
          .minus(pl.col('inst_intersection'))
          .alias('inst_union'),
      )
      .withColumns(
        pl
          .when(pl.col('inst_union').gt(0))
          .then(
            pl.col('inst_intersection').cast(pl.Float64).div(pl.col('inst_union').cast(pl.Float64)).pow(0.5),
          )
          .otherwise(pl.lit(0.0))
          .alias('instructor_sim'),
      )
      .drop('inst_union')

    basePairs = computeCareerSim(basePairs, mappings)
    basePairs = computeSubjectMatch(basePairs, mappings)

    console.error(`  3c: Done in ${((performance.now() - t0) / 1000).toFixed(2)}s`)

    // Build prior keys for sections once per time group (shared across questions)
    const sectionKeysRecords = groupSections
      .select('section_id', 'subject_ids', 'academic_career_ids')
      .toRecords() as unknown as Array<{
      section_id: number
      subject_ids: number[]
      academic_career_ids: number[]
    }>

    const sectionKeyMap = new Map<number, string>()
    const keyToLists = new Map<string, [number[], number[]]>()

    for (const row of sectionKeysRecords) {
      const sid = Number(row.section_id)
      const subjectIds = (row.subject_ids ?? []) as number[]
      const careerIds = (row.academic_career_ids ?? []) as number[]
      const key = makePriorKey(subjectIds, careerIds)
      sectionKeyMap.set(sid, key)
      if (!keyToLists.has(key)) {
        keyToLists.set(key, [[...subjectIds].sort((a, b) => a - b), [...careerIds].sort((a, b) => a - b)])
      }
    }

    const sectionKeyDf = pl
      .DataFrame({ section_id: [...sectionKeyMap.keys()], prior_key: [...sectionKeyMap.values()] })
      .withColumns(pl.col('section_id').cast(pl.Int64))

    // Shared eligible report/question base joined to eligibility for this time group
    const eligibleReportQBase = reportQAll.join(eligibleMeta.select('report_id', 'years_ago'), {
      on: 'report_id',
      how: 'inner',
    })

    console.error(`  3d: Processing questions in batches (looping per question_id) …`)

    // Loop over question IDs (batch size = 1; easy to expand later)
    for (let qIdx = 0; qIdx < resolvedQuestions.length; qIdx++) {
      const q = resolvedQuestions[qIdx]
      const qp = q.params
      const tQuestion = performance.now()

      // Filter to this question early
      const eligibleQ = eligibleReportQBase
        .filter(pl.col('question_id').eq(pl.lit(q.questionId)))
        .withColumns(
          pl
            .col('n')
            .cast(pl.Float64)
            .mul(pl.col('years_ago').cast(pl.Float64).mul(pl.lit(qp.decay).log()).exp())
            .alias('decayed_n'),
        )
        .select('report_id', 'question_id', 'normalized_mean', 'decayed_n')

      if (eligibleQ.height === 0) {
        console.error(`      skip question_id=${q.questionId} — no eligible (report, question) rows`)
        continue
      }

      // Per-(pair, question) relevance → blend
      const joined = basePairs
        .select('section_id', 'report_id', 'course_match', 'instructor_sim', 'career_sim', 'subject_match')
        .join(eligibleQ, { on: 'report_id', how: 'inner' })

      const withRelevance = joined
        .withColumns(
          pl
            .lit(1.0)
            .plus(pl.lit(qp.wCareer).mul(pl.col('career_sim')))
            .mul(pl.lit(1.0).plus(pl.lit(qp.wSubject).mul(pl.col('subject_match'))))
            .alias('boost'),
        )
        .withColumns(
          pl.lit(qp.baseCourse).mul(pl.col('course_match')).mul(pl.col('boost')).alias('r_course'),
          pl.lit(qp.baseInstructor).mul(pl.col('instructor_sim')).mul(pl.col('boost')).alias('r_instructor'),
          pl
            .lit(qp.baseInteraction)
            .mul(pl.col('course_match'))
            .mul(pl.col('instructor_sim'))
            .mul(pl.col('boost'))
            .alias('r_interaction'),
        )
        .filter(pl.col('r_course').gt(0).or(pl.col('r_instructor').gt(0)).or(pl.col('r_interaction').gt(0)))

      if (withRelevance.height === 0) {
        console.error(`      skip question_id=${q.questionId} — no relevance > 0 rows`)
        continue
      }

      const perComponent = withRelevance
        .withColumns(
          pl.col('r_course').mul(pl.col('decayed_n')).alias('n_course'),
          pl.col('r_instructor').mul(pl.col('decayed_n')).alias('n_instructor'),
          pl.col('r_interaction').mul(pl.col('decayed_n')).alias('n_interaction'),
        )
        .withColumns(
          pl.col('n_course').mul(pl.col('normalized_mean')).alias('nmu_course'),
          pl.col('n_instructor').mul(pl.col('normalized_mean')).alias('nmu_instructor'),
          pl.col('n_interaction').mul(pl.col('normalized_mean')).alias('nmu_interaction'),
        )

      const agg = perComponent
        .groupBy('section_id', 'question_id')
        .agg(
          pl.col('n_course').sum().alias('sum_n_course'),
          pl.col('n_instructor').sum().alias('sum_n_instructor'),
          pl.col('n_interaction').sum().alias('sum_n_interaction'),
          pl.col('nmu_course').sum().alias('sum_nmu_course'),
          pl.col('nmu_instructor').sum().alias('sum_nmu_instructor'),
          pl.col('nmu_interaction').sum().alias('sum_nmu_interaction'),
        )

      const blended = agg
        .withColumns(
          pl
            .when(pl.col('sum_n_course').gt(0))
            .then(pl.col('sum_nmu_course').div(pl.col('sum_n_course')))
            .otherwise(pl.lit(0.0))
            .alias('mean_course'),
          pl
            .when(pl.col('sum_n_instructor').gt(0))
            .then(pl.col('sum_nmu_instructor').div(pl.col('sum_n_instructor')))
            .otherwise(pl.lit(0.0))
            .alias('mean_instructor'),
          pl
            .when(pl.col('sum_n_interaction').gt(0))
            .then(pl.col('sum_nmu_interaction').div(pl.col('sum_n_interaction')))
            .otherwise(pl.lit(0.0))
            .alias('mean_interaction'),
        )
        .withColumns(
          dampenedLogExprColumn(pl.col('sum_n_course'), qp.dampeningK).alias('dn_course'),
          dampenedLogExprColumn(pl.col('sum_n_instructor'), qp.dampeningK).alias('dn_instructor'),
          pl.col('sum_n_interaction').alias('dn_interaction'),
        )
        .withColumns(
          pl.col('dn_course').gt(0).alias('is_course_informed'),
          pl.col('dn_instructor').gt(0).alias('is_instructor_informed'),
        )
        .withColumns(
          pl
            .col('dn_course')
            .plus(pl.col('dn_instructor'))
            .plus(pl.col('dn_interaction'))
            .alias('total_effective_n'),
          pl
            .col('dn_course')
            .mul(pl.col('mean_course'))
            .plus(pl.col('dn_instructor').mul(pl.col('mean_instructor')))
            .plus(pl.col('dn_interaction').mul(pl.col('mean_interaction')))
            .alias('total_effective_n_mu'),
        )
        .withColumns(pl.col('total_effective_n_mu').div(pl.col('total_effective_n')).alias('blended_avg'))
        .select(
          'section_id',
          'question_id',
          'total_effective_n',
          'blended_avg',
          'is_course_informed',
          'is_instructor_informed',
        )

      let assembled: DataFrame

      if (qp.m === null) {
        // Priors disabled for this question: emit only observed rows.
        assembled = blended
          .filter(pl.col('total_effective_n').gt(0))
          .withColumns(
            pl
              .col('blended_avg')
              .mul(pl.lit(q.wMax - q.wMin))
              .plus(pl.lit(q.wMin))
              .alias('smart_average'),
          )
          .select(
            'section_id',
            'question_id',
            'smart_average',
            'is_course_informed',
            'is_instructor_informed',
          )
      } else {
        // Hierarchical priors for this question only
        const timeStatsQ = eligibleReportQBase
          .filter(pl.col('question_id').eq(pl.lit(q.questionId)))
          .withColumns(
            pl
              .col('n')
              .cast(pl.Float64)
              .mul(pl.col('years_ago').cast(pl.Float64).mul(pl.lit(qp.decay).log()).exp())
              .alias('decayed_n'),
          )
          .select('normalized_mean', 'decayed_n', 'subject_ids', 'academic_career_ids')

        const priorsQ = computeAllPriorsForQuestion(timeStatsQ, keyToLists, qp.m)
        if (priorsQ.height === 0) {
          console.error(`      skip question_id=${q.questionId} — no priors`)
          continue
        }

        const sectionPriors = sectionKeyDf.join(priorsQ, { on: 'prior_key', how: 'inner' }).drop('prior_key')

        assembled = sectionPriors
          .withColumns(pl.lit(q.questionId).cast(pl.Int64).alias('question_id'))
          .join(blended, { on: ['section_id', 'question_id'], how: 'left' })
          .withColumns(
            pl.col('total_effective_n').fillNull(0.0),
            pl.col('blended_avg').fillNull(0.0),
            pl.col('is_course_informed').fillNull(false),
            pl.col('is_instructor_informed').fillNull(false),
          )
          .withColumns(
            pl
              .col('total_effective_n')
              .mul(pl.col('blended_avg'))
              .plus(pl.lit(qp.m).mul(pl.col('prior')))
              .div(pl.col('total_effective_n').plus(pl.lit(qp.m)))
              .alias('normalized_smart_average'),
          )
          .withColumns(
            pl
              .when(
                pl
                  .col('is_course_informed')
                  .not()
                  .and(pl.col('is_instructor_informed').not().and(pl.col('subject_informed').not())),
              )
              .then(pl.lit(null))
              .otherwise(
                pl
                  .col('normalized_smart_average')
                  .mul(pl.lit(q.wMax - q.wMin))
                  .plus(pl.lit(q.wMin)),
              )
              .alias('smart_average'),
          )
          .select(
            'section_id',
            'question_id',
            'smart_average',
            'is_course_informed',
            'is_instructor_informed',
          )
          .filter(pl.col('smart_average').isNotNull())
      }

      if (assembled.height === 0) {
        console.error(`      skip question_id=${q.questionId} — no emitted rows after null filtering`)
        continue
      }

      allResults.push(assembled)

      console.error(
        `      done question_id=${q.questionId} in ${((performance.now() - tQuestion) / 1000).toFixed(2)}s — ${assembled.height} rows (m=${qp.m === null ? 'null' : qp.m})`,
      )
    }

    console.error(
      `  Time group ${groupIdx + 1}/${nGroups} [${groupLabel}] complete in ${((performance.now() - tGroup) / 1000).toFixed(2)}s`,
    )
  }

  if (allResults.length === 0) {
    console.error('compute_metrics: no results')
    return emptyResult()
  }

  const out = pl.concat(allResults).sort(['section_id', 'question_id'])
  console.error(
    `compute_metrics: DONE in ${((performance.now() - tTotal) / 1000).toFixed(2)}s — ${out.height} total output rows`,
  )
  return out
}
