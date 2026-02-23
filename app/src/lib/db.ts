import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { DB } from '@courses/db/db.types'

/**
 * Create a Kysely database instance for server-side use.
 * Each call creates a new connection pool - call db.destroy() when done.
 */
export function createDb(connectionString: string) {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  })
}
