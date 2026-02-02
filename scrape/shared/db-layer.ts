import { Effect, Context, Layer, Config } from 'effect'
import { createDb } from '@db/db.ts'
import type { DB } from '@db/db.types.ts'
import { Kysely } from 'kysely'

export class DbService extends Context.Tag("DbService")<
  DbService,
  Kysely<DB>
>() {}

export const DbLive = Layer.scoped(
  DbService,
  Effect.gen(function* () {
    const connectionString = yield* Config.string('DATABASE_URL')
    const db = createDb(connectionString)
    
    yield* Effect.addFinalizer(() => 
      Effect.promise(() => db.destroy())
    )
    
    return db
  })
)