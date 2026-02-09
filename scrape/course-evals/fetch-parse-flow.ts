import { appendFile } from 'node:fs/promises'
import {
  Effect,
  Console,
  Chunk,
  Stream,
  pipe,
  Ref,
  SubscriptionRef,
  Fiber,
  Either,
  MutableHashMap,
  Option,
  HashSet,
} from 'effect'
import { FileSystem, Path } from '@effect/platform'
import { streamHtmlReportsWithCache, ManifestWriteError, type Progress } from './fetch-parse/evals-cached.ts'
import { ReportParseError, type ProcessedReport } from './fetch-parse/parse-report.ts'
import { resolveSubjects, ReportFetchError } from './fetch-parse/fetch-evals.ts'
import { type Quarter } from '@scrape/shared/schemas.ts'
import { sectionKey } from './fetch-parse/parse-listings.ts'
import { EffectProcessedReport, toEffectProcessedReport } from './fetch-parse/effect-processed-report.ts'
import { PlatformError } from '@effect/platform/Error'

function formatError(error: ReportParseError | ReportFetchError | ManifestWriteError | PlatformError) {
  if (error instanceof ReportParseError) {
    return {
      type: 'ReportParseError',
      courseCodes: error.courseCodes,
      year: error.year,
      quarter: error.quarter,
      reportUrl: error.reportUrl,
      message: error.message,
      ...(error.validationIssues && { validationIssues: error.validationIssues }),
    }
  }
  if (error instanceof ReportFetchError) {
    return {
      type: 'ReportFetchError',
      url: error.url,
      courseCodes: error.courseCodes,
      year: error.year,
      quarter: error.quarter,
      message: error.message,
    }
  }
  if (error instanceof ManifestWriteError) {
    return {
      type: 'ManifestWriteError',
      manifestPath: error.manifestPath,
      message: error.message,
    }
  }
  if (error instanceof PlatformError) {
    return {
      type: 'PlatformError',
      error: String(error),
    }
  }
  if (error && typeof error === 'object' && '_tag' in error) {
    return {
      type: (error as any)._tag,
      error: String(error),
    }
  }
  return {
    type: 'UnknownError',
    error: String(error),
  }
}

export const fetchAndParseFlow = ({
  year,
  quarter,
  subjects,
  outputsDir,
  writeHtml,
  writeJson,
  useCache,
  concurrency,
  rateLimit,
  retries,
  backoff,
}: {
  year: number
  quarter: Quarter
  subjects: Array<string>
  outputsDir: string
  writeHtml: boolean
  writeJson: boolean
  useCache: boolean
  concurrency: number
  rateLimit: number
  retries: number
  backoff: number
}) =>
  Effect.gen(function* (_) {
    const path = yield* _(Path.Path)
    const fs = yield* _(FileSystem.FileSystem)

    yield* _(Console.log(`Resolving subjects: ${subjects.join(', ')}`))
    const resolvedSubjects = yield* _(resolveSubjects(subjects, year, quarter))

    yield* _(Console.log(`Fetching course evaluation reports`))
    const subjectsSummary =
      resolvedSubjects.length > 10
        ? `${resolvedSubjects.slice(0, 10).join(', ')} ... and ${resolvedSubjects.length - 10} more (${resolvedSubjects.length} total)`
        : resolvedSubjects.join(', ')
    yield* _(Console.log(`Subjects: ${subjectsSummary}`))
    yield* _(Console.log(`Year-Quarter: ${year}-${quarter}`))
    yield* _(Console.log(`Outputs directory: ${outputsDir}`))

    yield* _(fs.makeDirectory(outputsDir, { recursive: true }))

    // Initialize failure file - delete if exists to start fresh
    const failuresPath = path.join(outputsDir, 'fetch-parse-failures.jsonl')
    if (yield* _(fs.exists(failuresPath))) {
      yield* _(fs.remove(failuresPath))
    }

    const progressRef = yield* _(
      SubscriptionRef.make<Progress>({ discovered: 0, fetched: 0, success: 0, failed: 0 }),
    )

    const writeProgress = Effect.gen(function* (_) {
      const { discovered, fetched, success, failed } = yield* _(Ref.get(progressRef))
      yield* _(
        Effect.sync(() =>
          process.stdout.write(
            `\rProgress: ${discovered} eval infos discovered, ${fetched} HTML reports fetched, ${success} processed, ${failed} failed`,
          ),
        ),
      )
    })

    yield* _(
      Console.log(
        `HTTP client configuration: concurrency=${concurrency}, ratelimit=${rateLimit} req/s, retries=${retries}, backoff=${backoff}ms`,
      ),
    )

    const stream = yield* _(
      streamHtmlReportsWithCache(year, quarter, resolvedSubjects, {
        outputsDir,
        writeHtml,
        useCache,
        progressRef,
      }),
    )

    // Fork a fiber that writes progress whenever the ref changes
    const progressFiber = yield* _(
      pipe(
        progressRef.changes,
        Stream.tap(() => writeProgress),
        Stream.runDrain,
      ),
      Effect.fork,
    )

    const results = yield* _(
      pipe(
        stream,
        Stream.tap((result) =>
          Effect.gen(function* (_) {
            // Write failures to JSONL as they happen
            if (Either.isLeft(result)) {
              const errorReport = formatError(result.left)
              const jsonLine = JSON.stringify(errorReport) + '\n'
              yield* _(Effect.promise(() => appendFile(failuresPath, jsonLine, 'utf-8')))
            }

            yield* _(
              Ref.update(progressRef, (prev) =>
                Either.isRight(result)
                  ? { ...prev, success: prev.success + 1 }
                  : { ...prev, failed: prev.failed + 1 },
              ),
            )
          }),
        ),
        Stream.runCollect,
      ),
    )

    yield* _(Fiber.interrupt(progressFiber))
    // Final write to ensure the last state is displayed
    yield* _(writeProgress)

    const resultArray = Chunk.toReadonlyArray(results)
    const failures = resultArray.filter((r) => Either.isLeft(r)).map((r) => r.left)
    const processedReports = resultArray.filter((r) => Either.isRight(r)).map((r) => r.right)

    const { fetched, success, failed } = yield* _(Ref.get(progressRef))

    // Build MutableHashMap keyed by EffectProcessedReport -> set of section keys
    const reportSectionsMap = MutableHashMap.empty<
      EffectProcessedReport,
      HashSet.HashSet<ReturnType<typeof sectionKey>>
    >()

    for (const report of processedReports) {
      const effectReport = toEffectProcessedReport(report)
      const keys = HashSet.fromIterable(
        report.info.sectionCourseCodes.map((scc) =>
          sectionKey(scc.subject, scc.codeNumber, scc.sectionNumber),
        ),
      )
      const existing = MutableHashMap.get(reportSectionsMap, effectReport)
      if (Option.isSome(existing)) {
        MutableHashMap.set(reportSectionsMap, effectReport, HashSet.union(existing.value, keys))
      } else {
        MutableHashMap.set(reportSectionsMap, effectReport, keys)
      }
    }

    // Compute stats from the deduplicated report map
    const distinctReports = MutableHashMap.size(reportSectionsMap)
    let totalSections = 0
    const subjectsWithEvals = new Set<string>()
    MutableHashMap.forEach(reportSectionsMap, (sections) => {
      totalSections += HashSet.size(sections)
      HashSet.forEach(sections, (sk) => {
        subjectsWithEvals.add(sk.subject)
      })
    })
    yield* _(
      Console.log(
        `\nEval stats: ${distinctReports} distinct reports, ${totalSections} sections with evals, ${subjectsWithEvals.size} subjects with evals`,
      ),
    )

    if (writeJson) {
      // Group by subject, filtering to only subjects in resolvedSubjects
      const subjectsSet = new Set(resolvedSubjects)
      const bySubject = new Map<string, ProcessedReport[]>()
      for (const report of processedReports) {
        const seenSubjects = new Set<string>()
        for (const scc of report.info.sectionCourseCodes) {
          if (!subjectsSet.has(scc.subject)) continue
          if (seenSubjects.has(scc.subject)) continue
          seenSubjects.add(scc.subject)
          const list = bySubject.get(scc.subject) ?? []
          list.push(report)
          bySubject.set(scc.subject, list)
        }
      }
      for (const [subject, reports] of bySubject) {
        const reportPath = path.join(outputsDir, subject, 'reports.json')
        yield* _(fs.makeDirectory(path.dirname(reportPath), { recursive: true }))
        yield* _(fs.writeFileString(reportPath, JSON.stringify(reports, null, 2)))
      }
    }

    // Clean up failures file if no failures occurred
    if (failed === 0) {
      if (yield* _(fs.exists(failuresPath))) {
        yield* _(fs.remove(failuresPath))
      }
    } else {
      yield* _(Console.log(`\nErrors: ${failed} reports failed to process. See ${failuresPath}`))
    }

    yield* _(
      Console.log(
        `\nProcessing complete: ${success} succeeded, ${failed} failed out of ${success + failed} total`,
      ),
    )

    return {
      success,
      failed,
      failures,
      outputsDir,
      reportSectionsMap,
    }
  })
