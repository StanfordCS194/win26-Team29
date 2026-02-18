import { createDb } from '@courses/db/db-postgres-js'
import { Config, Context, Effect, Layer } from 'effect'
import { EffectTemporal } from './effect-temporal.ts'
import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db-postgres-js'

export class DbService extends Context.Tag('DbService')<DbService, Kysely<DB>>() {}

export const DbLive = Layer.scoped(
  DbService,
  Effect.gen(function* () {
    const connectionString = yield* Config.string('DATABASE_URL')

    const db = createDb(connectionString, undefined, {
      parseDate: (v) => EffectTemporal.PlainDate.from(v),
      parseTimestamp: (v) => EffectTemporal.PlainDateTime.from(v.replace(' ', 'T')),
      parseTimestamptz: (v) => EffectTemporal.Instant.from(v),
      parseTime: (v) => EffectTemporal.PlainTime.from(v),
    })

    yield* Effect.addFinalizer(() => Effect.promise(() => db.destroy()))

    return db
  }),
)
