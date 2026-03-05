import { createDb, type Kysely } from '@courses/db/db-postgres-js'

import type { DB } from '@courses/db/db-postgres-js'

interface GlobalWithDb {
  __db?: Kysely<DB>
}

export function getServerDb(): Kysely<DB> {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined) throw new Error('Missing DATABASE_URL')

  const globalDb = globalThis as unknown as GlobalWithDb
  const existing = globalDb.__db
  if (existing) return existing

  const db = createDb(connectionString)

  globalDb.__db = db
  return db
}

void getServerDb()
