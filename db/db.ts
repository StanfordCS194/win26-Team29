import { Temporal } from '@js-temporal/polyfill'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool, types } from 'pg'

import type { DB } from './db.types.ts'

declare module '@js-temporal/polyfill' {
  // eslint-disable-next-line @typescript-eslint/no-namespace, no-shadow
  namespace Temporal {
    interface PlainDate {
      toPostgres: (prepareValue?: (value: unknown) => unknown) => string
    }

    interface PlainDateTime {
      toPostgres: (prepareValue?: (value: unknown) => unknown) => string
    }

    interface Instant {
      toPostgres: (prepareValue?: (value: unknown) => unknown) => string
    }

    interface PlainTime {
      toPostgres: (prepareValue?: (value: unknown) => unknown) => string
    }

    interface ZonedDateTime {
      toPostgres: (prepareValue?: (value: unknown) => unknown) => string
    }
  }
}

// Postgres serialization
Temporal.PlainDate.prototype.toPostgres = function () {
  return this.toString()
}

Temporal.PlainDateTime.prototype.toPostgres = function () {
  return this.toString()
}

Temporal.Instant.prototype.toPostgres = function () {
  return this.toString()
}

Temporal.PlainTime.prototype.toPostgres = function () {
  return this.toString()
}

Temporal.ZonedDateTime.prototype.toPostgres = function () {
  return this.toString()
}

export { Temporal as PGTemporal } from '@js-temporal/polyfill'

types.setTypeParser(20, (v) => BigInt(v))

types.setTypeParser(1082, (value) => {
  return Temporal.PlainDate.from(value)
})

types.setTypeParser(1114, (value) => {
  return Temporal.PlainDateTime.from(value.replace(' ', 'T'))
})

types.setTypeParser(1184, (value) => {
  return Temporal.Instant.from(value)
})

types.setTypeParser(1083, (value) => {
  return Temporal.PlainTime.from(value)
})

const parseEnumArray = (value: string) => {
  return value
    .slice(1, -1)
    .split(',')
    .filter((s) => s.length > 0)
}

types.setTypeParser(18378 as number, parseEnumArray)
types.setTypeParser(18387 as number, parseEnumArray)

export function createDb(connectionString: string) {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  })
}
