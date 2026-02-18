import { createDb, type Kysely } from '@courses/db/db-bun'

import type { DB } from '@courses/db/db-bun'

interface GlobalWithDb {
  __db?: Kysely<DB>
}

export function getServerDb(): Kysely<DB> {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined) throw new Error('Missing DATABASE_URL')

  const globalDb = globalThis as unknown as GlobalWithDb
  const existing = globalDb.__db
  if (existing) return existing

  console.log('Creating server db with connection string:', connectionString)

  const db = createDb(connectionString)

  globalDb.__db = db
  return db
}

void getServerDb()
