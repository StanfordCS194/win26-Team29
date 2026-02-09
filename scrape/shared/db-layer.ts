import { Effect, Context, Layer, Config, Equal, Hash } from 'effect'
import { types, Pool } from 'pg'
import { Kysely } from 'kysely'
import { EffectTemporal } from './effect-temporal.ts'
import { createDb } from '@db/db.ts'
import { DB } from '@db/db.types.ts'

// Set up type parsers for EffectTemporal (with Effect Equal/Hash support)
const setupEffectTemporalParsers = () => {
  // DATE - 1082
  types.setTypeParser(1082, (value) => {
    return value === null ? null : EffectTemporal.PlainDate.from(value)
  })

  // TIMESTAMP - 1114
  types.setTypeParser(1114, (value) => {
    return value === null ? null : EffectTemporal.PlainDateTime.from(value.replace(' ', 'T'))
  })

  // TIMESTAMPTZ - 1184
  types.setTypeParser(1184, (value) => {
    return value === null ? null : EffectTemporal.Instant.from(value)
  })

  // TIME - 1083
  types.setTypeParser(1083, (value) => {
    return value === null ? null : EffectTemporal.PlainTime.from(value)
  })
}

export class DbService extends Context.Tag('DbService')<DbService, Kysely<DB>>() {}

export const DbLive = Layer.scoped(
  DbService,
  Effect.gen(function* () {
    const connectionString = yield* Config.string('DATABASE_URL')

    setupEffectTemporalParsers()

    const db = createDb(connectionString)

    yield* Effect.addFinalizer(() => Effect.promise(() => db.destroy()))

    return db
  }),
)
