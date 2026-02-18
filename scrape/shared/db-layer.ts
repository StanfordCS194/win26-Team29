import { createDb } from '@courses/db/db'
import { Config, Context, Effect, Layer } from 'effect'
import { types } from 'pg'

import { EffectTemporal } from './effect-temporal.ts'
import type { Kysely } from 'kysely'
import type { DB } from '@courses/db/db'

// Set up type parsers for EffectTemporal (with Effect Equal/Hash support)
const setupEffectTemporalParsers = () => {
  // DATE - 1082
  types.setTypeParser(1082, (value) => {
    return EffectTemporal.PlainDate.from(value)
  })

  // TIMESTAMP - 1114
  types.setTypeParser(1114, (value) => {
    return EffectTemporal.PlainDateTime.from(value.replace(' ', 'T'))
  })

  // TIMESTAMPTZ - 1184
  types.setTypeParser(1184, (value) => {
    return EffectTemporal.Instant.from(value)
  })

  // TIME - 1083
  types.setTypeParser(1083, (value) => {
    return EffectTemporal.PlainTime.from(value)
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
