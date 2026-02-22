import { generate } from 'mutano'
import dotenv from 'dotenv'

dotenv.config()

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

await generate({
  origin: {
    type: 'postgres',
    host: required('DB_HOST'),
    port: Number(required('DB_PORT')),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_DATABASE'),
  },
  destinations: [
    {
      type: 'kysely',
      outFile: './db_test.types.ts',
      header: `import type { Temporal } from '@js-temporal/polyfill';
import { ColumnType, Insertable, Selectable, Updateable } from 'kysely';`,
    },
  ],
  includeViews: true,
  overrideTypes: {
    kysely: {
      bigint: 'bigint',
      int8: 'bigint',
      timestamp: 'Temporal.Instant',
      timestamptz: 'Temporal.Instant',
      date: 'Temporal.PlainDate',
      time: 'Temporal.PlainTime',
      timetz: 'Temporal.PlainTime',
      interval: 'Temporal.Duration',
    },
  },
})
