import { Kysely, PostgresDialect, PostgresPool } from 'kysely'
import { types, Pool } from 'pg'
import type { DB } from './db.types.ts'
import { Temporal } from '@js-temporal/polyfill'

declare module '@js-temporal/polyfill' {
  namespace Temporal {
    interface PlainDate {
      toPostgres(prepareValue?: (value: any) => any): string
    }

    interface PlainDateTime {
      toPostgres(prepareValue?: (value: any) => any): string
    }

    interface Instant {
      toPostgres(prepareValue?: (value: any) => any): string
    }

    interface PlainTime {
      toPostgres(prepareValue?: (value: any) => any): string
    }

    interface ZonedDateTime {
      toPostgres(prepareValue?: (value: any) => any): string
    }
  }
}

// Postgres serialization
Temporal.PlainDate.prototype.toPostgres = function (prepareValue) {
  return this.toString()
}

Temporal.PlainDateTime.prototype.toPostgres = function (prepareValue) {
  return this.toString()
}

Temporal.Instant.prototype.toPostgres = function (prepareValue) {
  return this.toString()
}

Temporal.PlainTime.prototype.toPostgres = function (prepareValue) {
  return this.toString()
}

Temporal.ZonedDateTime.prototype.toPostgres = function (prepareValue) {
  return this.toString()
}

export { Temporal as PGTemporal } from '@js-temporal/polyfill'

types.setTypeParser(20, (v) => (v === null ? null : BigInt(v)))

types.setTypeParser(1082, (value) => {
  return value === null ? null : Temporal.PlainDate.from(value)
})

types.setTypeParser(1114, (value) => {
  return value === null ? null : Temporal.PlainDateTime.from(value.replace(' ', 'T'))
})

types.setTypeParser(1184, (value) => {
  return value === null ? null : Temporal.Instant.from(value)
})

types.setTypeParser(1083, (value) => {
  return value === null ? null : Temporal.PlainTime.from(value)
})

export function createDb(connectionString: string) {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  })
}
