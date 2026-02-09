import { Effect } from 'effect'
import { DbService } from '@scrape/shared/db-layer.ts'
import { ParsedInstructor } from '../fetch-parse/parse-courses.ts'

const BATCH_SIZE = 1000

/**
 * Upserts instructors into the instructors table (conflict on sunet).
 * Returns a map of sunet -> id (bigint).
 */
export const upsertInstructors = (instructors: ParsedInstructor[]) =>
  Effect.gen(function* () {
    if (instructors.length === 0) {
      return new Map<string, bigint>()
    }

    const db = yield* DbService

    const bySunet = new Map<string, ParsedInstructor>()
    for (const i of instructors) {
      bySunet.set(i.sunet, i)
    }
    const unique = Array.from(bySunet.values())
    const records = unique.map((parsed) => ({
      name: parsed.name,
      first_name: parsed.firstName,
      middle_name: parsed.middleName ?? null,
      last_name: parsed.lastName,
      sunet: parsed.sunet,
    }))

    const result = yield* Effect.promise(() =>
      db.transaction().execute(async (trx) => {
        const sunetToId = new Map<string, bigint>()
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, i + BATCH_SIZE)
          const query = trx
            .insertInto('instructors')
            .values(batch)
            .onConflict((oc) =>
              oc.column('sunet').doUpdateSet((eb) => ({
                name: eb.ref('excluded.name'),
                first_name: eb.ref('excluded.first_name'),
                middle_name: eb.ref('excluded.middle_name'),
                last_name: eb.ref('excluded.last_name'),
              })),
            )
            .returning(['id', 'sunet'])

          const upserted = await query.execute()
          for (const row of upserted) {
            sunetToId.set(row.sunet, row.id)
          }
        }
        return sunetToId
      }),
    )

    return result
  })
