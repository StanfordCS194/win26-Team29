import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  Chunk,
  Config,
  Effect,
  Console,
  Duration,
  Either,
  Option,
  RateLimiter,
  Ref,
  Schedule,
  Stream,
  pipe,
} from 'effect'
import { sql, type SqlBool } from 'kysely'
import OpenAI from 'openai'

import { values } from '@courses/db/helpers'
import { DbService } from '@scrape/shared/db-layer.ts'
import {
  GptCallError,
  ParseError,
  DatabaseUpdateError,
  formatErrorCause,
  formatSearchTagError,
} from './errors.ts'
import { TagsResponseSchema } from './schema.ts'

import type { ConfigError } from 'effect/ConfigError'
import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db-postgres-js'
import type { SingleBar } from 'cli-progress'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT_TEMPLATE = readFileSync(join(__dirname, 'tags-prompt.txt'), 'utf-8')

// Split at "INPUT\n" so system message (static) can be cached; user message (variable) stays at the end.
// See https://developers.openai.com/api/docs/guides/prompt-caching
const PROMPT_PARTS = PROMPT_TEMPLATE.split(/INPUT\s*\n/, 2)
const SYSTEM_PROMPT = PROMPT_PARTS[0] ?? ''
const USER_TEMPLATE =
  PROMPT_PARTS[1] ??
  'Subject: {{SUBJECT_LONGNAME}}\nCourse Title: {{COURSE_TITLE}}\nCourse Description: {{COURSE_DESCRIPTION}}'

const MODEL = 'gpt-5-mini'

interface OfferingRow {
  id: number
  title: string
  description: string
  subjectLongname: string | null
}

interface GenerateOptions {
  batchSize: number
  concurrency: number
  writeBatchSize: number
  rateLimit: number
  retries: number
  backoff: number
  year?: string
  subject?: string
  force: boolean
  dryRunCount?: number
  outputFile?: string
  failuresPath?: string
  /** Offering IDs to skip (e.g. from existing tags.jsonl). */
  excludeOfferingIds?: number[]
}

interface TagResult {
  offeringId: number
  terms: { term: string; variants: string[] }[]
}

interface GenerateResult {
  total: number
  success: number
  failed: number
}

function appendJsonlResult(outputFile: string, result: TagResult): void {
  appendFileSync(outputFile, JSON.stringify(result) + '\n', 'utf-8')
}

function loadExistingTags(outputFile: string): TagResult[] {
  if (!existsSync(outputFile)) return []
  const content = readFileSync(outputFile, 'utf-8')
  const lines = content.split('\n').filter((line) => line.trim() !== '')
  const results: TagResult[] = []
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { offeringId?: number; terms?: unknown }
      if (typeof parsed?.offeringId === 'number' && Array.isArray(parsed?.terms)) {
        results.push({ offeringId: parsed.offeringId, terms: parsed.terms as TagResult['terms'] })
      }
    } catch {
      // skip malformed lines
    }
  }
  return results
}

function buildMessages(subjectLongname: string | null, title: string, description: string) {
  const userContent = USER_TEMPLATE.replace('{{SUBJECT_LONGNAME}}', subjectLongname ?? '')
    .replace('{{COURSE_TITLE}}', title)
    .replace('{{COURSE_DESCRIPTION}}', description ?? '')
  return { system: SYSTEM_PROMPT.trim(), user: userContent.trim() }
}

function buildBaseQuery(
  db: Kysely<DB>,
  options: Pick<GenerateOptions, 'force' | 'year' | 'subject' | 'excludeOfferingIds'>,
) {
  let query = db.selectFrom('course_offerings as co').innerJoin('subjects as s', 's.id', 'co.subject_id')

  if (!options.force) {
    query = query.where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('offering_search_tags as ost')
            .whereRef('ost.course_offering_id', '=', 'co.id')
            .select(eb.val(1).as('one')),
        ),
      ),
    )
  }

  if (options.year != null && options.year !== '') {
    query = query.where('co.year', '=', options.year)
  }

  if (options.subject != null && options.subject !== '') {
    query = query.where('s.code', '=', options.subject)
  }

  const excludeIds = options.excludeOfferingIds
  if (excludeIds != null && excludeIds.length > 0) {
    query = query.where('co.id', 'not in', excludeIds)
  }

  return query.where(
    sql<SqlBool>`array_length(regexp_split_to_array(trim(coalesce(co.description, '')), E'\\s+'), 1) > 12`,
  )
}

function fetchOfferings(
  db: Kysely<DB>,
  offset: number,
  options: GenerateOptions,
): Effect.Effect<OfferingRow[], DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      const rows = await buildBaseQuery(db, options)
        .select(['co.id', 'co.title', 'co.description', 's.longname'])
        .orderBy('co.id', 'asc')
        .limit(options.batchSize)
        .offset(offset)
        .execute()
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        subjectLongname: r.longname,
      }))
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: 'Failed to fetch offerings',
        courseOfferingIds: [],
        cause: error,
      }),
  })
}

function countOfferings(
  db: Kysely<DB>,
  options: GenerateOptions,
): Effect.Effect<number, DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      const result = await buildBaseQuery(db, options)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow()
      return Number(result.count)
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: 'Failed to count offerings',
        courseOfferingIds: [],
        cause: error,
      }),
  })
}

const makeRetrySchedule = (retries: number, backoff: number) =>
  Schedule.exponential(Duration.millis(backoff)).pipe(Schedule.compose(Schedule.recurs(retries)))

function callGpt(
  client: OpenAI,
  messages: { system: string; user: string },
  offeringId: number,
): Effect.Effect<string, GptCallError> {
  return Effect.tryPromise({
    try: async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 1024,
        reasoning_effort: 'minimal',
        prompt_cache_key: 'search-tags-v1',
        prompt_cache_retention: '24h',
      } as unknown as Parameters<typeof client.chat.completions.create>[0]) // SDK types lag API: reasoning_effort "minimal", prompt_cache_* supported at runtime
      const content = (completion as { choices: Array<{ message?: { content?: string } }> }).choices[0]
        ?.message?.content
      if (content == null || content.trim() === '') {
        throw new Error('Empty response from GPT')
      }
      return content
    },
    catch: (error) =>
      new GptCallError({
        message: 'Failed to call GPT',
        courseOfferingId: offeringId,
        cause: error,
      }),
  })
}

function parseTagsResponse(
  content: string,
  offeringId: number,
): Effect.Effect<{ term: string; variants: string[] }[], ParseError> {
  return Effect.try({
    try: () => {
      const parsed = JSON.parse(content) as unknown
      const result = TagsResponseSchema.safeParse(parsed)
      if (!result.success) {
        throw new Error(result.error.message)
      }
      return result.data.terms
    },
    catch: (error) =>
      new ParseError({
        message: 'Failed to parse tags response',
        courseOfferingId: offeringId,
        cause: error,
        gptResponse: content,
      }),
  })
}

function batchUpsertTags(
  db: Kysely<DB>,
  batch: Array<{ offeringId: number; terms: { term: string; variants: string[] }[] }>,
): Effect.Effect<void, DatabaseUpdateError> {
  return Effect.tryPromise({
    try: async () => {
      const offeringIds = batch.map((b) => b.offeringId)
      const records = batch.flatMap(({ offeringId, terms }) =>
        terms.map((t) => ({
          course_offering_id: offeringId,
          term: t.term,
          variants: t.variants,
        })),
      )

      if (records.length === 0) {
        await db.deleteFrom('offering_search_tags').where('course_offering_id', 'in', offeringIds).execute()
        return
      }

      await db
        .mergeInto('offering_search_tags as trg')
        .using(values(records, 'src', { variants: 'text[]' }), (join) =>
          join.on(({ eb, and, ref }) =>
            and([
              eb(ref('trg.course_offering_id'), '=', ref('src.course_offering_id')),
              eb(ref('trg.term'), '=', ref('src.term')),
            ]),
          ),
        )
        .whenMatched()
        .thenUpdateSet(({ ref }) => ({ variants: ref('src.variants') }))
        .whenNotMatched()
        .thenInsertValues(({ ref }) => ({
          course_offering_id: ref('src.course_offering_id'),
          term: ref('src.term'),
          variants: ref('src.variants'),
        }))
        .whenNotMatchedBySourceAnd((eb) => eb('trg.course_offering_id', 'in', offeringIds))
        .thenDelete()
        .execute()
    },
    catch: (error) =>
      new DatabaseUpdateError({
        message: `Failed to upsert tags for offerings ${batch.map((b) => b.offeringId).join(', ')}`,
        courseOfferingIds: batch.map((b) => b.offeringId),
        cause: error,
      }),
  })
}

export function generateSearchTags(
  options: GenerateOptions,
  progressBar?: SingleBar,
): Effect.Effect<GenerateResult, GptCallError | ParseError | DatabaseUpdateError | ConfigError, DbService> {
  return Effect.scoped(
    Effect.gen(function* () {
      let effectiveOptions = { ...options }
      if (options.outputFile != null && options.outputFile !== '') {
        const outputFile = options.outputFile
        yield* Effect.sync(() => mkdirSync(dirname(outputFile), { recursive: true }))
        const existingTags = options.force ? [] : loadExistingTags(options.outputFile)
        if (existingTags.length > 0) {
          const existingIds = existingTags.map((t) => t.offeringId)
          effectiveOptions = { ...effectiveOptions, excludeOfferingIds: existingIds }
          yield* Console.log(
            `Reusing ${existingTags.length.toLocaleString()} offerings from ${options.outputFile} (skipping GPT).`,
          )
          const dbForReuse = yield* DbService
          yield* batchUpsertTags(dbForReuse, existingTags).pipe(
            Effect.catchAll((err) =>
              Console.error(
                `Failed to upsert reused tags to DB: ${err.message}. Continuing with GPT run.`,
              ).pipe(Effect.as(void 0)),
            ),
          )
        }
        if (existingTags.length === 0) {
          yield* Effect.sync(() => writeFileSync(options.outputFile!, '', 'utf-8'))
        }
      }
      if (options.failuresPath != null && options.failuresPath !== '') {
        const failuresPath = options.failuresPath
        yield* Effect.sync(() => mkdirSync(dirname(failuresPath), { recursive: true }))
        if (existsSync(failuresPath)) {
          yield* Effect.sync(() => unlinkSync(failuresPath))
        }
      }
      const db = yield* DbService

      const apiKey = yield* Config.string('OPENAI_API_KEY')
      const client = new OpenAI({ apiKey })

      const rateLimiter = yield* RateLimiter.make({
        limit: options.rateLimit,
        interval: Duration.seconds(1),
      })
      const retrySchedule = makeRetrySchedule(options.retries, options.backoff)

      const callGptWithRateLimitAndRetry = (messages: { system: string; user: string }, offeringId: number) =>
        rateLimiter(
          callGpt(client, messages, offeringId).pipe(
            Effect.timeoutFail({
              duration: Duration.seconds(30),
              onTimeout: () =>
                new GptCallError({
                  message: 'GPT call timed out after 30s',
                  courseOfferingId: offeringId,
                }),
            }),
            Effect.retry(retrySchedule),
          ),
        )

      if (effectiveOptions.dryRunCount != null && effectiveOptions.dryRunCount > 0) {
        const offerings = yield* fetchOfferings(db, 0, {
          ...effectiveOptions,
          batchSize: effectiveOptions.dryRunCount,
        })
        yield* Console.log(`Dry run: fetching tags for ${offerings.length} offering(s) (no DB writes).\n`)
        yield* Effect.forEach(
          offerings,
          (o) =>
            Effect.gen(function* () {
              yield* Console.log(`  [${o.id}] ${o.title}`)
              const callResult = yield* Effect.either(
                callGptWithRateLimitAndRetry(buildMessages(o.subjectLongname, o.title, o.description), o.id),
              )
              if (callResult._tag === 'Left') {
                if (options.failuresPath != null && options.failuresPath !== '') {
                  const errorReport = formatSearchTagError(callResult.left)
                  const jsonLine = `${JSON.stringify(errorReport)}\n`
                  yield* Effect.promise(() => appendFile(options.failuresPath!, jsonLine, 'utf-8'))
                }
                const detail =
                  callResult.left.cause != null
                    ? formatErrorCause(callResult.left.cause)
                    : callResult.left.message
                yield* Console.error(`\n    GPT error: ${detail}\n`)
              } else {
                const parseResult = yield* Effect.either(parseTagsResponse(callResult.right, o.id))
                if (parseResult._tag === 'Left') {
                  if (options.failuresPath != null && options.failuresPath !== '') {
                    const errorReport = formatSearchTagError(parseResult.left)
                    const jsonLine = `${JSON.stringify(errorReport)}\n`
                    yield* Effect.promise(() => appendFile(options.failuresPath!, jsonLine, 'utf-8'))
                  }
                  const detail =
                    parseResult.left.cause != null
                      ? formatErrorCause(parseResult.left.cause)
                      : parseResult.left.message
                  yield* Console.error(`\n    Parse error: ${detail}\n`)
                } else {
                  if (options.outputFile != null && options.outputFile !== '') {
                    appendJsonlResult(options.outputFile, { offeringId: o.id, terms: parseResult.right })
                  }
                  yield* Console.log(`    Terms: ${JSON.stringify(parseResult.right, null, 4)}\n`)
                }
              }
            }),
          { concurrency: options.concurrency },
        )
        return { total: offerings.length, success: 0, failed: 0 }
      }

      const total = yield* countOfferings(db, effectiveOptions)
      if (total === 0) {
        yield* Console.log('No offerings found to process.')
        return { total: 0, success: 0, failed: 0 }
      }

      yield* Console.log(
        `Generating search tags for ${total.toLocaleString()} offerings (concurrency=${options.concurrency}, writeBatchSize=${options.writeBatchSize})...`,
      )

      if (progressBar) {
        progressBar.start(total, 0)
      }

      const successRef = yield* Ref.make(0)
      const failedRef = yield* Ref.make(0)

      const offeringStream = Stream.paginateChunkEffect(0, (offset) =>
        fetchOfferings(db, offset, effectiveOptions).pipe(
          Effect.map((batch) =>
            batch.length > 0
              ? ([Chunk.unsafeFromArray(batch), Option.some(offset + batch.length)] as const)
              : ([Chunk.empty<OfferingRow>(), Option.none<number>()] as const),
          ),
        ),
      )

      const makeDbWrite = (batch: TagResult[]) =>
        batchUpsertTags(db, batch).pipe(
          Effect.timeoutFail({
            duration: Duration.seconds(30),
            onTimeout: () =>
              new DatabaseUpdateError({
                message: 'DB write timed out',
                courseOfferingIds: batch.map((b) => b.offeringId),
              }),
          }),
          Effect.retry(retrySchedule),
        )

      yield* pipe(
        offeringStream,
        Stream.mapEffect(
          (offering) =>
            Effect.gen(function* () {
              const messages = buildMessages(offering.subjectLongname, offering.title, offering.description)
              const content = yield* callGptWithRateLimitAndRetry(messages, offering.id)
              const terms = yield* parseTagsResponse(content, offering.id)
              return { offeringId: offering.id, terms }
            }).pipe(Effect.either),
          { concurrency: options.concurrency },
        ),
        Stream.tap((either) =>
          Either.match(either, {
            onLeft: (err: GptCallError | ParseError) =>
              Effect.gen(function* () {
                yield* Ref.update(failedRef, (n) => n + 1)
                if (options.failuresPath != null && options.failuresPath !== '') {
                  const errorReport = formatSearchTagError(err)
                  const jsonLine = `${JSON.stringify(errorReport)}\n`
                  yield* Effect.promise(() => appendFile(options.failuresPath!, jsonLine, 'utf-8'))
                }
                const kind = err._tag === 'GptCallError' ? 'GPT' : 'Parse'
                const detail = err.cause != null ? formatErrorCause(err.cause) : err.message
                const offeringId = err.courseOfferingId
                yield* Console.error(`\n  Failed offering ${offeringId} (${kind}): ${detail}\n`)
                if (progressBar) progressBar.increment()
              }),
            onRight: (result: TagResult) =>
              Effect.sync(() => {
                if (options.outputFile != null && options.outputFile !== '')
                  appendJsonlResult(options.outputFile, result)
                if (progressBar) progressBar.increment()
              }),
          }),
        ),
        Stream.filterMap((either) => (Either.isRight(either) ? Option.some(either.right) : Option.none())),
        Stream.grouped(options.writeBatchSize),
        Stream.mapEffect((chunk) =>
          Effect.gen(function* () {
            const batch: TagResult[] = Chunk.toArray(chunk) as TagResult[]
            const upsertResult = yield* Effect.either(makeDbWrite(batch))

            if (upsertResult._tag === 'Left') {
              const batchDetail =
                upsertResult.left.cause != null
                  ? formatErrorCause(upsertResult.left.cause)
                  : upsertResult.left.message
              yield* Console.error(
                `\n  Batch DB write failed (${batch.length} offerings), retrying individually:\n  ${batchDetail}\n`,
              )
              yield* Effect.forEach(
                batch,
                (item) =>
                  Effect.gen(function* () {
                    const singleResult = yield* Effect.either(makeDbWrite([item]))
                    if (singleResult._tag === 'Left') {
                      yield* Ref.update(failedRef, (n) => n + 1)
                      if (options.failuresPath != null && options.failuresPath !== '') {
                        const errorReport = formatSearchTagError(singleResult.left)
                        const jsonLine = `${JSON.stringify(errorReport)}\n`
                        yield* Effect.promise(() => appendFile(options.failuresPath!, jsonLine, 'utf-8'))
                      }
                      const detail =
                        singleResult.left.cause != null
                          ? formatErrorCause(singleResult.left.cause)
                          : singleResult.left.message
                      yield* Console.error(`\n  Failed offering ${item.offeringId} (DB): ${detail}\n`)
                    } else {
                      yield* Ref.update(successRef, (n) => n + 1)
                    }
                  }),
                { concurrency: options.concurrency },
              )
            } else {
              yield* Ref.update(successRef, (n) => n + batch.length)
            }
          }),
        ),
        Stream.runDrain,
      ).pipe(Effect.ensuring(progressBar ? Effect.sync(() => progressBar.stop()) : Effect.void))

      const success = yield* Ref.get(successRef)
      const failed = yield* Ref.get(failedRef)

      if (options.failuresPath != null && options.failuresPath !== '') {
        const failuresPath = options.failuresPath
        if (failed === 0) {
          if (existsSync(failuresPath)) {
            yield* Effect.sync(() => unlinkSync(failuresPath))
          }
        } else {
          yield* Console.log(`\nErrors: ${failed} offering(s) failed. See ${failuresPath}`)
        }
      }

      yield* Console.log(`\nDone! Processed ${(success + failed).toLocaleString()} offerings.`)
      yield* Console.log(`  Success: ${success.toLocaleString()}`)
      if (failed > 0) {
        yield* Console.log(`  Failed: ${failed.toLocaleString()}`)
      }

      return { total, success, failed }
    }),
  )
}
