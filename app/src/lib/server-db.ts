import { createDb, type Kysely } from '@courses/db/db'

import type { DB } from '@courses/db/db'

export function getServerDb(): Kysely<DB> {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined) throw new Error('Missing DATABASE_URL')

  const g = globalThis as unknown as { __db?: Kysely<DB> }
  const existing = g.__db
  if (existing) return existing

  console.log('Creating server db with connection string:', connectionString)

  const db = createDb(connectionString, { max: 4 })
  // Warm the pool — fire and forget

  ;(globalThis as unknown as { __db: Kysely<DB> }).__db = db
  return db
}

void getServerDb()
