import { Data, Effect, HashMap, HashSet, MutableHashMap, Option } from 'effect'

import { DbService } from '@scrape/shared/db-layer.ts'
import type { sectionKey } from '../fetch-parse/parse-listings.ts'
import type { Quarter } from '@scrape/shared/schemas.ts'

import type { EffectProcessedReport } from '../fetch-parse/effect-processed-report.ts'

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class EvaluationReportUpsertError extends Data.TaggedError('EvaluationReportUpsertError')<{
  message: string
  step: string
  reportMetadata: Array<{
    quarter: string
    year: number
    sectionCodes: Array<string>
  }>
  cause?: unknown
}> {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ReportMetadata = EvaluationReportUpsertError['reportMetadata']

const buildReportMetadata = (
  reportSectionsMap: HashMap.HashMap<EffectProcessedReport, HashSet.HashSet<ReturnType<typeof sectionKey>>>,
): ReportMetadata =>
  Array.from(HashMap.entries(reportSectionsMap)).map(([report]) => ({
    quarter: report.info.quarter,
    year: report.info.year,
    sectionCodes: HashSet.toValues(report.info.sectionCourseCodes).map(
      (sc) => `${sc.subject}${sc.codeNumber.number}${Option.getOrElse(sc.codeNumber.suffix, () => '')}`,
    ),
  }))

/**
 * Wraps a single database call in `Effect.tryPromise`, attaching structured
 * error metadata so every failure surfaces the step name.
 */
const dbStep = <T>(
  step: string,
  fn: (db: Effect.Effect.Success<typeof DbService>) => Promise<T>,
  metadata: ReportMetadata,
) =>
  Effect.gen(function* () {
    const db = yield* DbService
    return yield* Effect.tryPromise({
      try: () => fn(db),
      catch: (error) => {
        const msg = error instanceof Error ? error.message : String(error)
        return new EvaluationReportUpsertError({
          message: `Failed at [${step}]: ${msg}`,
          step,
          reportMetadata: metadata,
          cause: error,
        })
      },
    })
  })

// ---------------------------------------------------------------------------
// Step 1: Resolve section keys to lookup structs (pure)
// ---------------------------------------------------------------------------

const resolveSectionLookups = (
  reportSectionsMap: HashMap.HashMap<EffectProcessedReport, HashSet.HashSet<ReturnType<typeof sectionKey>>>,
  subjectCodeToId: Map<string, number>,
) =>
  Effect.gen(function* () {
    const allSectionKeys = new Set<ReturnType<typeof sectionKey>>()
    for (const [, keys] of HashMap.entries(reportSectionsMap)) {
      for (const key of keys) {
        allSectionKeys.add(key)
      }
    }

    const sectionKeyToLookup = new Map<
      ReturnType<typeof sectionKey>,
      { subject_id: number; code_number: number; code_suffix: string | null; section_number: string }
    >()

    for (const key of allSectionKeys) {
      const subjectId = subjectCodeToId.get(key.subject)
      if (subjectId === undefined) {
        yield* Effect.logWarning(`Subject not found: ${key.subject}`)
        continue
      }

      sectionKeyToLookup.set(key, {
        subject_id: subjectId,
        code_number: key.code.number,
        code_suffix: key.code.suffix ?? null,
        section_number: key.sectionNumber,
      })
    }

    return sectionKeyToLookup
  })

// ---------------------------------------------------------------------------
// Step 2: Query all sections in one batch
// ---------------------------------------------------------------------------

const querySections = (
  lookups: Array<{
    subject_id: number
    code_number: number
    code_suffix: string | null
    section_number: string
  }>,
  academicYear: string,
  quarter: Quarter,
  metadata: ReportMetadata,
) =>
  Effect.gen(function* () {
    const sectionIdMap = MutableHashMap.empty<
      { subject_id: number; code_number: number; code_suffix: string | null; section_number: string },
      number
    >()

    if (lookups.length === 0) return sectionIdMap

    const sectionRecords = yield* dbStep(
      'query_sections',
      (db) =>
        db
          .selectFrom('sections')
          .innerJoin('course_offerings', 'sections.course_offering_id', 'course_offerings.id')
          .select([
            'sections.id',
            'course_offerings.subject_id',
            'course_offerings.code_number',
            'course_offerings.code_suffix',
            'sections.section_number',
          ])
          .where('course_offerings.year', '=', academicYear)
          .where('sections.term_quarter', '=', quarter)
          .where((eb) =>
            eb.or(
              lookups.map((lookup) =>
                eb.and([
                  eb('course_offerings.subject_id', '=', lookup.subject_id),
                  eb('course_offerings.code_number', '=', lookup.code_number),
                  eb(
                    'course_offerings.code_suffix',
                    lookup.code_suffix !== null ? '=' : 'is',
                    lookup.code_suffix,
                  ),
                  eb('sections.section_number', '=', lookup.section_number),
                ]),
              ),
            ),
          )
          .execute(),
      metadata,
    )

    for (const s of sectionRecords) {
      MutableHashMap.set(
        sectionIdMap,
        Data.struct({
          subject_id: s.subject_id,
          code_number: s.code_number,
          code_suffix: s.code_suffix,
          section_number: s.section_number,
        }),
        s.id,
      )
    }

    return sectionIdMap
  })

// ---------------------------------------------------------------------------
// Step 3: Group section IDs by report (pure, with warnings)
// ---------------------------------------------------------------------------

const groupSectionIdsByReport = (
  reportSectionsMap: HashMap.HashMap<EffectProcessedReport, HashSet.HashSet<ReturnType<typeof sectionKey>>>,
  sectionKeyToLookup: Map<
    ReturnType<typeof sectionKey>,
    { subject_id: number; code_number: number; code_suffix: string | null; section_number: string }
  >,
  sectionIdMap: MutableHashMap.MutableHashMap<
    { subject_id: number; code_number: number; code_suffix: string | null; section_number: string },
    number
  >,
  quarter: Quarter,
  academicYear: string,
) =>
  Effect.gen(function* () {
    const reportToSectionIds = new Map<EffectProcessedReport, Array<number>>()

    for (const [report, keys] of HashMap.entries(reportSectionsMap)) {
      for (const key of keys) {
        const lookup = sectionKeyToLookup.get(key)
        if (!lookup) continue

        const sectionId = MutableHashMap.get(sectionIdMap, Data.struct(lookup))

        if (Option.isSome(sectionId)) {
          if (!reportToSectionIds.has(report)) {
            reportToSectionIds.set(report, [])
          }
          reportToSectionIds.get(report)!.push(sectionId.value)
        } else {
          yield* Effect.logWarning(
            `Section not found: ${key.subject} ${key.code.number}${key.code.suffix ?? ''}-${key.sectionNumber} (${quarter} ${academicYear})`,
          )
        }
      }
    }

    return reportToSectionIds
  })

// ---------------------------------------------------------------------------
// Step 4: Delete existing reports linked to resolved sections
// ---------------------------------------------------------------------------

const deleteExistingReports = (allResolvedSectionIds: Array<number>, metadata: ReportMetadata) =>
  Effect.gen(function* () {
    if (allResolvedSectionIds.length === 0) return

    const existingReportLinks = yield* dbStep(
      'query_existing_report_links',
      (db) =>
        db
          .selectFrom('evaluation_report_sections')
          .select('report_id')
          .where('section_id', 'in', allResolvedSectionIds)
          .execute(),
      metadata,
    )

    const existingReportIds = [...new Set(existingReportLinks.map((link) => link.report_id))]

    if (existingReportIds.length > 0) {
      yield* dbStep(
        'delete_existing_reports',
        (db) => db.deleteFrom('evaluation_reports').where('id', 'in', existingReportIds).execute(),
        metadata,
      )
    }
  })

// ---------------------------------------------------------------------------
// Step 5: Insert a single report (in its own transaction)
// ---------------------------------------------------------------------------

const insertReport = (
  report: EffectProcessedReport,
  sectionIds: Array<number>,
  numericQuestionMap: Map<string, number>,
  textQuestionMap: Map<string, number>,
  quarter: Quarter,
  academicYear: string,
  metadata: ReportMetadata,
) =>
  Effect.gen(function* () {
    const db = yield* DbService

    return yield* Effect.tryPromise({
      try: () =>
        db.transaction().execute(async (trx) => {
          // Insert report
          const [insertedReport] = await trx
            .insertInto('evaluation_reports')
            .values({
              responded: report.info.responded,
              total: report.info.total,
            })
            .returning(['id'])
            .execute()

          const reportId = insertedReport.id

          // Insert numeric responses
          const numericResponseRecords: Array<{
            report_id: number
            question_id: number
            option_text: string
            weight: number
            frequency: number
          }> = []

          for (const [questionText, question] of report.questions) {
            if (question._tag === 'numeric') {
              const questionId = numericQuestionMap.get(questionText)
              if (questionId === undefined) {
                throw new Error(`Numeric question ID not found for: "${questionText}"`)
              }

              for (const response of question.responses) {
                numericResponseRecords.push({
                  report_id: reportId,
                  question_id: questionId,
                  option_text: response.option,
                  weight: response.weight,
                  frequency: response.frequency,
                })
              }
            }
          }

          if (numericResponseRecords.length > 0) {
            await trx.insertInto('evaluation_numeric_responses').values(numericResponseRecords).execute()
          }

          // Insert text responses
          const textResponseRecords: Array<{
            report_id: number
            question_id: number
            response_text: string
          }> = []

          for (const [questionText, question] of report.questions) {
            if (question._tag === 'text') {
              const questionId = textQuestionMap.get(questionText)
              if (questionId === undefined) {
                throw new Error(`Text question ID not found for: "${questionText}"`)
              }

              for (const responseText of question.responses) {
                textResponseRecords.push({
                  report_id: reportId,
                  question_id: questionId,
                  response_text: responseText,
                })
              }
            }
          }

          if (textResponseRecords.length > 0) {
            await trx.insertInto('evaluation_text_responses').values(textResponseRecords).execute()
          }

          // Link to sections
          if (sectionIds.length > 0) {
            await trx
              .insertInto('evaluation_report_sections')
              .values(sectionIds.map((sectionId) => ({ report_id: reportId, section_id: sectionId })))
              .execute()
          }

          return {
            report_id: reportId,
            quarter,
            year: academicYear,
            responded: report.info.responded,
            total: report.info.total,
            sections_linked: sectionIds.length,
            numeric_responses: numericResponseRecords.length,
            text_responses: textResponseRecords.length,
          }
        }),
      catch: (error) => {
        const msg = error instanceof Error ? error.message : String(error)
        return new EvaluationReportUpsertError({
          message: `Failed at [insert_report]: ${msg}`,
          step: 'insert_report',
          reportMetadata: metadata,
          cause: error,
        })
      },
    })
  })

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const upsertEvaluationReports = (
  reportSectionsMap: HashMap.HashMap<EffectProcessedReport, HashSet.HashSet<ReturnType<typeof sectionKey>>>,
  subjectCodeToId: Map<string, number>,
  academicYear: string,
  quarter: Quarter,
  numericQuestionMap: Map<string, number>,
  textQuestionMap: Map<string, number>,
) =>
  Effect.gen(function* () {
    const metadata = buildReportMetadata(reportSectionsMap)

    // Step 1: Resolve section keys to lookup structs
    const sectionKeyToLookup = yield* resolveSectionLookups(reportSectionsMap, subjectCodeToId)

    // Step 2: Query all sections in one batch
    const lookups = Array.from(sectionKeyToLookup.values())
    const sectionIdMap = yield* querySections(lookups, academicYear, quarter, metadata)

    // Step 3: Group section IDs by report
    const reportToSectionIds = yield* groupSectionIdsByReport(
      reportSectionsMap,
      sectionKeyToLookup,
      sectionIdMap,
      quarter,
      academicYear,
    )

    // Step 4: Delete existing reports linked to resolved sections
    const allResolvedSectionIds = Array.from(reportToSectionIds.values()).flat()
    yield* deleteExistingReports(allResolvedSectionIds, metadata)

    // Step 5: Insert each report (each in its own transaction, in parallel)
    const entries = Array.from(reportToSectionIds.entries()).filter(([, sectionIds]) => sectionIds.length > 0)

    // Warn about reports with no resolved sections
    const skippedCount = reportToSectionIds.size - entries.length
    if (skippedCount > 0) {
      yield* Effect.logWarning(
        `Skipping ${skippedCount} evaluation report(s) with no resolved sections for ${quarter} ${academicYear}`,
      )
    }

    const results = yield* Effect.forEach(
      entries,
      ([report, sectionIds]) =>
        insertReport(
          report,
          sectionIds,
          numericQuestionMap,
          textQuestionMap,
          quarter,
          academicYear,
          metadata,
        ),
      { concurrency: 'unbounded' },
    )

    return { evaluation_reports: results }
  })
