import { appendFile } from 'node:fs/promises'
import { FileSystem, HttpClient, Path } from '@effect/platform'
import { Effect, Either, Ref, pipe, Stream, Data } from 'effect'
import { EvalInfoSchema, formatCourseCodes, type EvalInfo } from './parse-listings.ts'
import type { ListingsParseError } from './parse-listings.ts'
import {
  fetchReportHtml,
  buildReportUrl,
  ReportFetchError,
  type ListingsFetchError,
  type HtmlReportItem,
} from './fetch-evals.ts'
import { CodeNumberSchema, type Quarter } from '@scrape/shared/schemas.ts'
import z from 'zod'
import { PlatformError } from '@effect/platform/Error'
import { streamEvalInfosForSubject } from './fetch-evals.ts'
import { parseReport, ReportParseError, type ProcessedReport } from './parse-report.ts'

export class ManifestWriteError extends Data.TaggedError('ManifestWriteError')<{
  message: string
  manifestPath: string
  cause?: unknown
}> {}

export type Progress = { discovered: number; fetched: number; success: number; failed: number }

export const MANIFEST_FILENAME = 'manifest.jsonl'

/** Filename from a section's encoded code number and section number (e.g. 106A-01.html). */
const htmlFilenameFromSection = (
  codeNumber: { number: number; suffix?: string },
  sectionNumber: string,
): string => {
  const encoded = CodeNumberSchema.encode(codeNumber)
  const safe = `${encoded}-${sectionNumber}`.replace(/[/\\]/g, '-')
  return `${safe}.html`
}

const appendManifestLine = (manifestPath: string, data: unknown) =>
  Effect.tryPromise({
    try: () => appendFile(manifestPath, JSON.stringify(data) + '\n', { flag: 'a' }),
    catch: (e) =>
      new ManifestWriteError({
        message: `Failed to append to manifest: ${e instanceof Error ? e.message : String(e)}`,
        manifestPath,
        cause: e,
      }),
  })

/** Write manifest entry for a fetch error (no HTML, no path) */
const writeManifestFetchError = (manifestPath: string, evalInfo: EvalInfo, error: ReportFetchError) =>
  appendManifestLine(manifestPath, {
    evalInfo: EvalInfoSchema.encode(evalInfo),
    error: {
      type: 'fetch',
      message: error.message,
    },
  })

/** Write manifest entry for a parse error (HTML written, has path) */
const writeManifestParseError = (
  manifestPath: string,
  filename: string,
  evalInfo: EvalInfo,
  error: ReportParseError,
) =>
  appendManifestLine(manifestPath, {
    path: filename,
    evalInfo: EvalInfoSchema.encode(evalInfo),
    error: {
      type: 'parse',
      message: error.message,
    },
  })

const processHtmlReportItem = (
  data: HtmlReportItem,
  subject: string,
  subjectOutputsDir: string,
  options: {
    writeHtml: boolean
    path: Path.Path
    fs: FileSystem.FileSystem
  },
) =>
  Effect.gen(function* (_) {
    const { writeHtml, path, fs } = options

    // Write HTML files first
    if (writeHtml) {
      for (const scc of data.evalInfo.sectionCourseCodes) {
        if (scc.subject !== subject) continue

        yield* _(fs.makeDirectory(subjectOutputsDir, { recursive: true }))

        const filename = htmlFilenameFromSection(scc.codeNumber, scc.sectionNumber)
        const htmlPath = path.join(subjectOutputsDir, filename)

        yield* _(fs.writeFileString(htmlPath, data.html))
      }
    }

    // Parse the report
    const parseResult = yield* _(parseReport(data.html, data.evalInfo).pipe(Effect.either))

    // Write manifest entries based on parse result
    if (writeHtml) {
      for (const scc of data.evalInfo.sectionCourseCodes) {
        if (scc.subject !== subject) continue

        const filename = htmlFilenameFromSection(scc.codeNumber, scc.sectionNumber)
        const manifestPath = path.join(subjectOutputsDir, MANIFEST_FILENAME)

        if (Either.isRight(parseResult)) {
          // Success: write manifest entry without error
          yield* _(
            appendManifestLine(manifestPath, {
              path: filename,
              evalInfo: EvalInfoSchema.encode(data.evalInfo),
            }),
          )
        } else {
          // Parse error: write manifest entry with error marker
          yield* _(writeManifestParseError(manifestPath, filename, data.evalInfo, parseResult.left))
        }
      }
    }

    // Return the parse result (or fail if it was an error)
    if (Either.isLeft(parseResult)) {
      return yield* _(Effect.fail(parseResult.left))
    }

    return parseResult.right
  })

const ManifestEntrySchema = z.object({
  path: z.string().min(1).optional(), // Optional: not present for fetch errors
  evalInfo: EvalInfoSchema,
  error: z
    .object({
      type: z.enum(['fetch', 'parse']),
      message: z.string(),
    })
    .optional(),
})
type ManifestEntry = z.infer<typeof ManifestEntrySchema>

const parseManifestLines = (content: string): Array<ManifestEntry> => {
  const lines = content
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const entries: Array<ManifestEntry> = []
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      // Skip completion markers
      if (parsed._complete) continue

      const result = ManifestEntrySchema.safeParse(parsed)
      if (result.success) {
        entries.push(result.data)
      }
    } catch (e) {
      // Skip invalid lines
    }
  }
  return entries
}

const checkCacheValid = (cacheDir: string) =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const path = yield* _(Path.Path)

    const manifestPath = path.join(cacheDir, MANIFEST_FILENAME)
    const manifestExists = yield* _(
      fs.exists(manifestPath).pipe(Effect.catchAll(() => Effect.succeed(false))),
    )

    if (!manifestExists) {
      return false
    }

    const content = yield* _(fs.readFileString(manifestPath).pipe(Effect.catchAll(() => Effect.succeed(''))))
    const lines = content
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      return false
    }

    // Check for completion marker in last line
    try {
      const lastLine = JSON.parse(lines[lines.length - 1])
      if (!lastLine._complete) {
        return false
      }
    } catch {
      return false
    }

    const entries = parseManifestLines(content)

    // Check that ALL entries are valid
    for (const entry of entries) {
      // If entry has an error marker, cache is invalid
      if (entry.error) {
        return false
      }

      // Only check file existence if path is present (fetch errors won't have paths)
      if (entry.path) {
        const filePath = path.join(cacheDir, entry.path)
        const exists = yield* _(fs.exists(filePath).pipe(Effect.catchAll(() => Effect.succeed(false))))
        if (!exists) {
          return false
        }
      }
    }

    return true
  })

const streamCachedEntries = (cacheDir: string) =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const path = yield* _(Path.Path)

    const manifestPath = path.join(cacheDir, MANIFEST_FILENAME)
    const content = yield* _(fs.readFileString(manifestPath))
    const entries = parseManifestLines(content)

    return Stream.fromIterable(entries)
  })

const readCachedHtml = (
  cacheDir: string,
  entry: ManifestEntry,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<HtmlReportItem, ReportFetchError> =>
  Effect.gen(function* (_) {
    if (!entry.path) {
      return yield* _(
        Effect.fail(
          new ReportFetchError({
            message: 'Cached entry has no path (likely a fetch error entry)',
            url: `cache://${cacheDir}`,
            courseCodes: formatCourseCodes(entry.evalInfo),
            year: entry.evalInfo.year,
            quarter: entry.evalInfo.quarter,
            evalInfo: entry.evalInfo,
          }),
        ),
      )
    }

    const filePath = path.join(cacheDir, entry.path)
    const html = yield* _(fs.readFileString(filePath))
    return { html, evalInfo: entry.evalInfo, source: 'cache' } as HtmlReportItem
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ReportFetchError({
          message: `Failed to read cached HTML: ${cause instanceof Error ? cause.message : String(cause)}`,
          url: `cache://${path.join(cacheDir, entry.path ?? 'unknown')}`,
          courseCodes: formatCourseCodes(entry.evalInfo),
          year: entry.evalInfo.year,
          quarter: entry.evalInfo.quarter,
          evalInfo: entry.evalInfo,
          cause,
        }),
    ),
  )

const buildCachedStreamForSubject = (
  subjectOutputsDir: string,
  incrementDiscovered: Effect.Effect<void>,
  incrementFetched: Effect.Effect<void>,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) =>
  Effect.gen(function* (_) {
    const entries = yield* _(streamCachedEntries(subjectOutputsDir))
    return pipe(
      entries,
      Stream.tap(() => incrementDiscovered),
      Stream.mapEffect((entry) => pipe(readCachedHtml(subjectOutputsDir, entry, fs, path), Effect.either), {
        concurrency: 'unbounded',
      }),
      Stream.tap(() => incrementFetched),
    )
  })

const buildHttpStreamForSubject = (
  subject: string,
  year: number,
  quarter: Quarter,
  incrementDiscovered: Effect.Effect<void>,
  incrementFetched: Effect.Effect<void>,
) =>
  pipe(
    streamEvalInfosForSubject(subject, year, quarter),
    Stream.tap(() => incrementDiscovered),
    Stream.mapEffect(
      (info) =>
        pipe(
          Effect.gen(function* (_) {
            const url = buildReportUrl(info.dataIds)
            const html = yield* _(fetchReportHtml(url))
            yield* _(incrementFetched)
            return { html, evalInfo: info, source: 'http' } as HtmlReportItem
          }),
          Effect.mapError((cause) => {
            const url = buildReportUrl(info.dataIds)
            return new ReportFetchError({
              message: cause instanceof Error ? cause.message : String(cause),
              url,
              courseCodes: formatCourseCodes(info),
              year: info.year,
              quarter: info.quarter,
              evalInfo: info,
              cause,
            })
          }),
          Effect.either,
        ),
      { concurrency: 'unbounded' },
    ),
  )

const buildSubjectStream = (
  subject: string,
  year: number,
  quarter: Quarter,
  source: 'http' | 'cache',
  outputsDir: string,
  writeHtml: boolean,
  progressRef: Ref.Ref<Progress> | undefined,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) =>
  Effect.gen(function* (_) {
    const subjectOutputsDir = path.join(outputsDir, subject, 'html')

    const incrementDiscovered = progressRef
      ? Ref.update(progressRef, (prev) => ({ ...prev, discovered: prev.discovered + 1 }))
      : Effect.void
    const incrementFetched = progressRef
      ? Ref.update(progressRef, (prev) => ({ ...prev, fetched: prev.fetched + 1 }))
      : Effect.void

    // Clear subject directory for HTTP subjects when starting
    if (source === 'http' && writeHtml) {
      // Remove directory if it exists
      const exists = yield* _(fs.exists(subjectOutputsDir).pipe(Effect.catchAll(() => Effect.succeed(false))))
      if (exists) {
        yield* _(fs.remove(subjectOutputsDir, { recursive: true }))
      }
      // Recreate clean directory
      yield* _(fs.makeDirectory(subjectOutputsDir, { recursive: true }))
    }

    const itemStream =
      source === 'cache'
        ? yield* _(
            buildCachedStreamForSubject(subjectOutputsDir, incrementDiscovered, incrementFetched, fs, path),
          )
        : buildHttpStreamForSubject(subject, year, quarter, incrementDiscovered, incrementFetched)

    const processedStream = pipe(
      itemStream,
      Stream.mapEffect(
        (either) =>
          pipe(
            Effect.gen(function* (_) {
              if (Either.isLeft(either)) {
                // Fetch error: write manifest entry with error marker (no HTML, no path)
                if (source === 'http' && writeHtml) {
                  const fetchError = either.left
                  const manifestPath = path.join(subjectOutputsDir, MANIFEST_FILENAME)
                  yield* _(
                    writeManifestFetchError(manifestPath, fetchError.evalInfo, fetchError).pipe(
                      Effect.catchAll(() => Effect.void),
                    ),
                  )
                }
                return Either.left(either.left)
              }

              // Directly process the HTML report item
              const processed = yield* _(
                processHtmlReportItem(either.right, subject, subjectOutputsDir, {
                  writeHtml: writeHtml && either.right.source === 'http',
                  path,
                  fs,
                }).pipe(Effect.either),
              )

              return processed
            }),
          ),
        { concurrency: 'unbounded' },
      ),
      Stream.onDone(() =>
        Effect.gen(function* (_) {
          // Write completion marker for HTTP subjects
          if (source === 'http' && writeHtml) {
            const manifestPath = path.join(subjectOutputsDir, MANIFEST_FILENAME)
            const marker = { _complete: true, timestamp: new Date().toISOString() }
            yield* _(appendManifestLine(manifestPath, marker).pipe(Effect.orDie))
          }
        }),
      ),
    )

    return { stream: processedStream, subject, source }
  })

export const streamHtmlReportsWithCache = (
  year: number,
  quarter: Quarter,
  subjects: Array<string>,
  options: {
    outputsDir: string
    writeHtml: boolean
    useCache: boolean
    progressRef?: Ref.Ref<Progress>
  },
): Effect.Effect<
  Stream.Stream<
    Either.Either<ProcessedReport, ReportFetchError | ReportParseError | PlatformError | ManifestWriteError>,
    ListingsParseError | ListingsFetchError,
    HttpClient.HttpClient
  >,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* (_) {
    const { outputsDir, writeHtml, useCache, progressRef } = options
    const path = yield* _(Path.Path)
    const fs = yield* _(FileSystem.FileSystem)

    // Determine which subjects use cache vs HTTP
    const subjectSources = new Map<string, 'http' | 'cache'>()

    if (useCache) {
      const cacheDirs = subjects.map((subject) => path.join(outputsDir, subject, 'html'))
      const validDirs = yield* _(Effect.all(cacheDirs.map((dir) => checkCacheValid(dir))))

      for (let i = 0; i < subjects.length; i++) {
        subjectSources.set(subjects[i], validDirs[i] ? 'cache' : 'http')
      }
    } else {
      // No cache, all subjects use HTTP
      for (const subject of subjects) {
        subjectSources.set(subject, 'http')
      }
    }

    // Build streams for each subject
    const subjectStreamEffects = subjects.map((subject) => {
      const source = subjectSources.get(subject)!
      return pipe(
        buildSubjectStream(subject, year, quarter, source, outputsDir, writeHtml, progressRef, fs, path),
        Effect.map(({ stream }) => stream),
      )
    })

    // Execute all stream effects and merge the resulting streams
    const streams = yield* _(Effect.all(subjectStreamEffects))
    const mergedStream = Stream.mergeAll(streams, { concurrency: 'unbounded' })

    return mergedStream
  })
