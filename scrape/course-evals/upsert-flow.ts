import { Effect, Console, HashMap, HashSet, MutableHashMap, Ref, Chunk, Stream, pipe } from 'effect'
import { FileSystem, Path } from '@effect/platform'
import * as cliProgress from 'cli-progress'
import { appendFile } from 'node:fs/promises'
import { lookupSubjectIds } from './upsert/lookup-subjects.ts'
import { upsertEvaluationReports, EvaluationReportUpsertError } from './upsert/upsert-evals.ts'
import { preupsertAllQuestions } from './upsert/preupsert-questions.ts'
import type { EffectProcessedReport } from './fetch-parse/effect-processed-report.ts'
import type { sectionKey } from './fetch-parse/parse-listings.ts'
import type { Quarter } from '@scrape/shared/schemas.ts'

/**
 * Derive the academic year string (e.g. "2023-2024") from year + quarter.
 *   Autumn 2023 -> "2023-2024"
 *   Winter/Spring/Summer 2024 -> "2023-2024"
 */
const deriveAcademicYear = (year: number, quarter: Quarter): string => {
  if (quarter === 'Autumn') {
    return `${year}-${year + 1}`
  }
  return `${year - 1}-${year}`
}

function formatUpsertError(error: EvaluationReportUpsertError) {
  return {
    type: 'EvaluationReportUpsertError' as const,
    step: error.step,
    message: error.message,
    recordCount: error.recordCount,
    reportMetadata: error.reportMetadata.map((r) => ({
      quarter: r.quarter,
      year: r.year,
      sectionCodes: r.sectionCodes,
    })),
    ...(error.cause !== undefined && { cause: String(error.cause) }),
  }
}

export const databaseUpsertFlow = ({
  reportSectionsMap,
  year,
  quarter,
  batchSize,
  concurrency,
  outputsDir,
}: {
  reportSectionsMap: MutableHashMap.MutableHashMap<
    EffectProcessedReport,
    HashSet.HashSet<ReturnType<typeof sectionKey>>
  >
  year: number
  quarter: Quarter
  batchSize: number
  concurrency: number
  outputsDir: string
}) =>
  Effect.gen(function* (_) {
    const path = yield* _(Path.Path)
    const fs = yield* _(FileSystem.FileSystem)

    // Initialize failure file - delete if exists to start fresh
    const failuresPath = path.join(outputsDir, 'upsert-failures.jsonl')
    if (yield* _(fs.exists(failuresPath))) {
      yield* _(fs.remove(failuresPath))
    }

    // Step 1: Extract unique subject codes from section keys and convert to immutable HashMap
    const subjectCodes = new Set<string>()
    const entries: [EffectProcessedReport, HashSet.HashSet<ReturnType<typeof sectionKey>>][] = []

    MutableHashMap.forEach(reportSectionsMap, (keys, report) => {
      entries.push([report, keys])
      for (const key of keys) {
        subjectCodes.add(key.subject)
      }
    })

    // Step 2: Look up subject IDs
    yield* _(Console.log(`\nLooking up subject IDs for ${subjectCodes.size} subjects...`))
    const subjectCodeToId = yield* _(lookupSubjectIds(subjectCodes))
    yield* _(Console.log(`Resolved ${subjectCodeToId.size} subject IDs`))

    const missingSubjects = [...subjectCodes].filter((s) => !subjectCodeToId.has(s))
    if (missingSubjects.length > 0) {
      yield* _(
        Console.log(
          `Warning: ${missingSubjects.length} subjects not found in database: ${missingSubjects.join(', ')}`,
        ),
      )
    }

    // Step 3: Collect all unique questions from all reports
    const allNumericQuestions = new Set<string>()
    const allTextQuestions = new Set<string>()

    for (const [report] of entries) {
      for (const [questionText, question] of report.questions) {
        if (question._tag === 'numeric') {
          allNumericQuestions.add(questionText)
        } else {
          allTextQuestions.add(questionText)
        }
      }
    }

    yield* _(
      Console.log(
        `\nPre-upserting ${allNumericQuestions.size} numeric and ${allTextQuestions.size} text questions...`,
      ),
    )
    const { numericQuestionMap, textQuestionMap } = yield* _(
      preupsertAllQuestions(allNumericQuestions, allTextQuestions),
    )
    yield* _(Console.log('Questions pre-upserted successfully'))

    // Step 4: Upsert evaluation reports in batches
    const academicYear = deriveAcademicYear(year, quarter)
    yield* _(
      Console.log(`\nUpserting ${entries.length} evaluation reports for ${academicYear} ${quarter}...`),
    )
    yield* _(Console.log(`Configuration: batchSize=${batchSize}, concurrency=${concurrency}`))

    const totalBatches = Math.ceil(entries.length / batchSize)

    const progressBar = new cliProgress.SingleBar({
      format: 'Upserting |{bar}| {percentage}% | {value}/{total} batches | Reports: {reports}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 1000,
    })

    const batchProgressRef = yield* _(Ref.make(0))
    const reportsProcessedRef = yield* _(Ref.make(0))
    const failedBatchesRef = yield* _(Ref.make<EvaluationReportUpsertError[]>([]))

    progressBar.start(totalBatches, 0, { reports: 0 })

    yield* _(
      pipe(
        Stream.fromIterable(entries),
        Stream.grouped(batchSize),
        Stream.mapEffect(
          (chunk) =>
            Effect.gen(function* (_) {
              const chunkArray = Chunk.toArray(chunk)
              const batchMap = HashMap.fromIterable(chunkArray)

              yield* _(
                upsertEvaluationReports(
                  batchMap,
                  subjectCodeToId,
                  academicYear,
                  quarter,
                  numericQuestionMap,
                  textQuestionMap,
                ).pipe(
                  Effect.catchTag('EvaluationReportUpsertError', (error) =>
                    Effect.gen(function* (_) {
                      // Write failure to JSONL as it happens
                      const errorReport = formatUpsertError(error)
                      const jsonLine = JSON.stringify(errorReport) + '\n'
                      yield* _(Effect.promise(() => appendFile(failuresPath, jsonLine, 'utf-8')))
                      // Also update the failures ref for counting
                      yield* _(Ref.update(failedBatchesRef, (failures) => [...failures, error]))
                    }),
                  ),
                ),
              )

              const batchCount = yield* _(Ref.updateAndGet(batchProgressRef, (n) => n + 1))
              const reportsCount = yield* _(
                Ref.updateAndGet(reportsProcessedRef, (n) => n + chunkArray.length),
              )
              progressBar.update(batchCount, { reports: reportsCount })
            }),
          { concurrency },
        ),
        Stream.runDrain,
      ).pipe(Effect.ensuring(Effect.sync(() => progressBar.stop()))),
    )

    const totalReportsProcessed = yield* _(Ref.get(reportsProcessedRef))
    const failures = yield* _(Ref.get(failedBatchesRef))

    // Clean up failures file if no failures occurred
    if (failures.length === 0) {
      if (yield* _(fs.exists(failuresPath))) {
        yield* _(fs.remove(failuresPath))
      }
    } else {
      yield* _(Console.log(`\nErrors: ${failures.length} batch(es) failed. See ${failuresPath}`))
    }

    yield* _(
      Console.log(
        `${totalReportsProcessed} evaluation reports processed (${failures.length} batch failures)`,
      ),
    )
    yield* _(Console.log('Database upsert complete'))
  })
