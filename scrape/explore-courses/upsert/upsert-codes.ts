import { Effect } from 'effect'

import { DbService } from '@scrape/shared/db-layer.ts'
import type { DB } from '@db/db.types.ts'

export type LookupTable = Extract<
  keyof DB,
  | 'academic_careers'
  | 'academic_groups'
  | 'academic_organizations'
  | 'effective_statuses'
  | 'final_exam_options'
  | 'grading_options'
  | 'gers'
  | 'consent_options'
  | 'enroll_statuses'
  | 'component_types'
  | 'instructor_roles'
>

/**
 * Upserts codes into a lookup table and returns a mapping of codes to their IDs.
 */
export const upsertLookupCodes = (tableName: LookupTable, codes: Set<string>) =>
  Effect.gen(function* () {
    if (codes.size === 0) {
      return new Map() as Map<string, number>
    }

    const db = yield* DbService

    const uniqueCodes = Array.from(codes)
    const records = uniqueCodes.map((code) => ({ code }))

    const upsertedRecords = yield* Effect.promise(() =>
      db
        .insertInto(tableName)
        .values(records)
        .onConflict((oc) => oc.column('code').doUpdateSet({ code: (eb) => eb.ref('excluded.code') }))
        .returning(['id', 'code'])
        .execute(),
    )

    const codeToIdMap = new Map<string, number>(upsertedRecords.map((record) => [record.code, record.id]))

    return codeToIdMap
  })

/**
 * Upserts subjects. Map keys are codes, values are longnames (null when absent).
 * When longname is provided it is upserted; when absent, existing longname is preserved.
 */
export const upsertSubjects = (codeToLongname: Map<string, string | null>) =>
  Effect.gen(function* () {
    if (codeToLongname.size === 0) {
      return new Map() as Map<string, number>
    }

    const db = yield* DbService

    const records = Array.from(codeToLongname.entries(), ([code, longname]) => ({
      code,
      longname,
    }))

    const upsertedRecords = yield* Effect.promise(() =>
      db
        .insertInto('subjects')
        .values(records)
        .onConflict((oc) =>
          oc.column('code').doUpdateSet((eb) => ({
            code: eb.ref('excluded.code'),
            longname: eb.fn.coalesce('excluded.longname', 'subjects.longname'),
          })),
        )
        .returning(['id', 'code'])
        .execute(),
    )

    return new Map<string, number>(upsertedRecords.map((record) => [record.code, record.id]))
  })

export const upsertLookupCodesBatch = (lookupData: Record<LookupTable, Set<string>>) =>
  Effect.gen(function* () {
    const effects = Object.entries(lookupData).map(([tableName, codes]) => {
      if (codes.size === 0) {
        return Effect.succeed([tableName as LookupTable, new Map() as Map<string, number>] as const)
      }

      return upsertLookupCodes(tableName as LookupTable, codes).pipe(
        Effect.map((map) => [tableName as LookupTable, map] as const),
      )
    })

    const results = yield* Effect.all(effects, { concurrency: 'unbounded' })

    return Object.fromEntries(results) as Record<LookupTable, Map<string, number>>
  })
