import { Effect } from 'effect'

import { DbService } from '@scrape/shared/db-layer.ts'
import type { DB } from '@courses/db/db.types'

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
 * Upserts schools by name. Returns a mapping of school names to their IDs.
 * Requires a UNIQUE constraint on `schools.name`.
 */
export const upsertSchools = (names: Set<string>) =>
  Effect.gen(function* () {
    if (names.size === 0) {
      return new Map() as Map<string, number>
    }

    const db = yield* DbService
    const records = Array.from(names, (name) => ({ name }))

    const upsertedRecords = yield* Effect.promise(() =>
      db
        .insertInto('schools')
        .values(records)
        .onConflict((oc) => oc.column('name').doUpdateSet((eb) => ({ name: eb.ref('excluded.name') })))
        .returning(['id', 'name'])
        .execute(),
    )

    return new Map<string, number>(
      upsertedRecords
        .filter((r): r is { id: number; name: string } => r.name !== null)
        .map((r) => [r.name, r.id]),
    )
  })

/**
 * Upserts subjects. Map keys are codes, values are `{ longname, school_id }`.
 * When longname or school_id is provided it is upserted; when absent, existing values are preserved.
 */
export const upsertSubjects = (
  subjects: Map<string, { longname: string | null; school_id: number | null }>,
) =>
  Effect.gen(function* () {
    if (subjects.size === 0) {
      return new Map() as Map<string, number>
    }

    const db = yield* DbService

    const records = Array.from(subjects.entries(), ([code, { longname, school_id }]) => ({
      code,
      longname,
      school_id,
    }))

    const upsertedRecords = yield* Effect.promise(() =>
      db
        .insertInto('subjects')
        .values(records)
        .onConflict((oc) =>
          oc.column('code').doUpdateSet((eb) => ({
            code: eb.ref('excluded.code'),
            longname: eb.fn.coalesce('excluded.longname', 'subjects.longname'),
            school_id: eb.fn.coalesce('excluded.school_id', 'subjects.school_id'),
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
