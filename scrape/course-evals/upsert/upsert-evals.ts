import { Effect, Data, HashMap, HashSet, Option, MutableHashMap } from 'effect'
import { DbService } from '@scrape/shared/db-layer.ts'
import type { EffectProcessedReport } from '../fetch-parse/effect-processed-report.ts'
import { sectionKey } from '../fetch-parse/parse-listings.ts'
import type { Quarter } from '@scrape/shared/schemas.ts'

export class EvaluationReportUpsertError extends Data.TaggedError('EvaluationReportUpsertError')<{
  message: string
  step: string
  recordCount?: number
  reportMetadata: Array<{
    quarter: string
    year: number
    sectionCodes: string[]
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

const logMissingSubject = (subjectCode: string) => {
  console.warn(`\nSubject not found: ${subjectCode}`)
}

const logMissingSection = (key: ReturnType<typeof sectionKey>, academicYear: string, quarter: string) => {
  console.warn(
    `\nSection not found: ${key.subject} ${key.code.number}${key.code.suffix || ''}-${key.sectionNumber} (${quarter} ${academicYear})`,
  )
}

export const upsertEvaluationReports = (
  reportSectionsMap: HashMap.HashMap<EffectProcessedReport, HashSet.HashSet<ReturnType<typeof sectionKey>>>,
  subjectCodeToId: Map<string, number>,
  academicYear: string,
  quarter: Quarter,
  numericQuestionMap: Map<string, number>,
  textQuestionMap: Map<string, number>,
) =>
  Effect.gen(function* () {
    const db = yield* DbService

    const result = yield* Effect.tryPromise({
      try: () =>
        db.transaction().execute(async (trx) => {
          // Step 1: Collect all section keys across all reports, resolve subject IDs
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
              logMissingSubject(key.subject)
              continue
            }

            sectionKeyToLookup.set(key, {
              subject_id: subjectId,
              code_number: key.code.number,
              code_suffix: key.code.suffix ?? null,
              section_number: key.sectionNumber,
            })
          }

          // Step 2: Query all sections in a single batch for the given (year, quarter)
          const lookups = Array.from(sectionKeyToLookup.values())

          const sectionIdMap = MutableHashMap.empty<
            { subject_id: number; code_number: number; code_suffix: string | null; section_number: string },
            bigint
          >()

          if (lookups.length > 0) {
            const sectionRecords = await traced(
              'query_sections',
              () =>
                trx
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
                            lookup.code_suffix ? '=' : 'is',
                            lookup.code_suffix,
                          ),
                          eb('sections.section_number', '=', lookup.section_number),
                        ]),
                      ),
                    ),
                  )
                  .execute(),
              { recordCount: lookups.length },
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
          }

          // Step 3: Group section IDs by report
          const reportToSectionIds = new Map<EffectProcessedReport, bigint[]>()

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
                logMissingSection(key, academicYear, quarter)
              }
            }
          }

          // Step 4: Batch-delete existing evaluation reports linked to any of our resolved sections
          const allResolvedSectionIds = Array.from(reportToSectionIds.values()).flat()

          if (allResolvedSectionIds.length > 0) {
            const existingReportLinks = await traced(
              'query_existing_report_links',
              () =>
                trx
                  .selectFrom('evaluation_report_sections')
                  .select('report_id')
                  .where('section_id', 'in', allResolvedSectionIds)
                  .execute(),
              { recordCount: allResolvedSectionIds.length },
            )

            const existingReportIds = [...new Set(existingReportLinks.map((link) => link.report_id))]

            if (existingReportIds.length > 0) {
              await traced(
                'delete_existing_reports',
                () => trx.deleteFrom('evaluation_reports').where('id', 'in', existingReportIds).execute(),
                { recordCount: existingReportIds.length },
              )
            }
          }

          // Step 5: Insert each unique report with its responses and section links
          const results = []

          for (const [report, sectionIds] of reportToSectionIds.entries()) {
            const [insertedReport] = await traced('insert_report', () =>
              trx
                .insertInto('evaluation_reports')
                .values({
                  responded: report.info.responded,
                  total: report.info.total,
                })
                .returning(['id'])
                .execute(),
            )

            const reportId = insertedReport.id

            // Insert numeric responses
            const numericResponseRecords: Array<{
              report_id: bigint
              question_id: number
              option_text: string
              weight: number
              frequency: number
            }> = []

            for (const [questionText, question] of report.questions) {
              if (question._tag === 'numeric') {
                const questionId = numericQuestionMap.get(questionText)
                if (!questionId) {
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
              await traced(
                'insert_numeric_responses',
                () => trx.insertInto('evaluation_numeric_responses').values(numericResponseRecords).execute(),
                { recordCount: numericResponseRecords.length },
              )
            }

            // Insert text responses
            const textResponseRecords: Array<{
              report_id: bigint
              question_id: number
              response_text: string
            }> = []

            for (const [questionText, question] of report.questions) {
              if (question._tag === 'text') {
                const questionId = textQuestionMap.get(questionText)
                if (!questionId) {
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
              await traced(
                'insert_text_responses',
                () => trx.insertInto('evaluation_text_responses').values(textResponseRecords).execute(),
                { recordCount: textResponseRecords.length },
              )
            }

            // Link to sections
            if (sectionIds.length > 0) {
              await traced(
                'link_report_sections',
                () =>
                  trx
                    .insertInto('evaluation_report_sections')
                    .values(sectionIds.map((sectionId) => ({ report_id: reportId, section_id: sectionId })))
                    .execute(),
                { recordCount: sectionIds.length },
              )
            } else {
              console.warn(
                `\nOrphaned evaluation report created (id: ${reportId}) - no sections found for ${quarter} ${academicYear}`,
              )
            }

            results.push({
              report_id: reportId,
              quarter,
              year: academicYear,
              responded: report.info.responded,
              total: report.info.total,
              sections_linked: sectionIds.length,
              numeric_responses: numericResponseRecords.length,
              text_responses: textResponseRecords.length,
            })
          }

          return results
        }),
      catch: (error) => {
        const step = (error as any)?.step ?? 'unknown'
        const recordCount = (error as any)?.recordCount
        const originalError = (error as any)?.originalError ?? error
        const msg = originalError instanceof Error ? originalError.message : String(originalError)

        return new EvaluationReportUpsertError({
          message: `Failed to upsert evaluation reports at [${step}]${recordCount != null ? ` (${recordCount} records)` : ''}: ${msg}`,
          step,
          recordCount,
          reportMetadata: Array.from(HashMap.entries(reportSectionsMap)).map(([report]) => ({
            quarter: report.info.quarter,
            year: report.info.year,
            sectionCodes: HashSet.toValues(report.info.sectionCourseCodes).map(
              (sc) => `${sc.subject}${sc.codeNumber.number}${sc.codeNumber.suffix ?? ''}`,
            ),
          })),
          cause: originalError,
        })
      },
    })

    return { evaluation_reports: result }
  })
