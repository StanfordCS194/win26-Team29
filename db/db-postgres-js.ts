import { Temporal } from '@js-temporal/polyfill'
import { Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres, { type Options } from 'postgres'

import type { DB as GeneratedDB } from './db.types.ts'
import type { QuarterType } from './db.types.ts'
import type { CourseOfferingsFullMv } from './db-mv.types.ts'

export type { Kysely } from 'kysely'
export type { QuarterType } from './db.types.ts'
export type {
  CourseOfferingsFullMv,
  MvEvaluationSmartAverage,
  MvInstructor,
  MvLearningObjective,
  MvOfferingAttribute,
  MvOfferingTag,
  MvSchedule,
  MvSection,
  MvSectionAttribute,
} from './db-mv.types.ts'

export interface EligibleOfferingsMv {
  offering_id: number
  year: string
  subject_id: number
  term_quarter: QuarterType
}

export interface CourseContentSearch {
  offering_id: number
  search_vector: string
}

export type DB = GeneratedDB & {
  course_offerings_full_mv: CourseOfferingsFullMv
  offering_quarters_mv: EligibleOfferingsMv
  course_content_search: CourseContentSearch
}

// --- Temporal serialization for postgres.js ---

export { Temporal as PGTemporal } from '@js-temporal/polyfill'

const parseEnumArray = (value: string) => {
  return value
    .slice(1, -1)
    .split(',')
    .filter((s) => s.length > 0)
}

export interface TemporalOverrides {
  parseDate?: (v: string) => unknown
  parseTimestamp?: (v: string) => unknown
  parseTimestamptz?: (v: string) => unknown
  parseTime?: (v: string) => unknown
}

export function createDb(
  connectionString: string,
  config?: Options<{}>,
  temporalOverrides?: TemporalOverrides,
) {
  const pg = postgres(connectionString, {
    prepare: false,
    ...config,
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: bigint) => v.toString(),
        parse: (v: string) => BigInt(v),
      },
      date: {
        to: 1082,
        from: [1082],
        serialize: (v: Temporal.PlainDate) => v.toString(),
        parse: temporalOverrides?.parseDate ?? ((v: string) => Temporal.PlainDate.from(v)),
      },
      timestamp: {
        to: 1114,
        from: [1114],
        serialize: (v: Temporal.PlainDateTime) => v.toString(),
        parse:
          temporalOverrides?.parseTimestamp ??
          ((v: string) => Temporal.PlainDateTime.from(v.replace(' ', 'T'))),
      },
      timestamptz: {
        to: 1184,
        from: [1184],
        serialize: (v: Temporal.Instant) => v.toString(),
        parse: temporalOverrides?.parseTimestamptz ?? ((v: string) => Temporal.Instant.from(v)),
      },
      time: {
        to: 1083,
        from: [1083],
        serialize: (v: Temporal.PlainTime) => v.toString(),
        parse: temporalOverrides?.parseTime ?? ((v: string) => Temporal.PlainTime.from(v)),
      },
      // Custom enum arrays (oids 18378, 18387)
      enum_array_1: {
        to: 18378,
        from: [18378],
        serialize: (v: string[]) => `{${v.join(',')}}`,
        parse: parseEnumArray,
      },
      enum_array_2: {
        to: 18387,
        from: [18387],
        serialize: (v: string[]) => `{${v.join(',')}}`,
        parse: parseEnumArray,
      },
    },
  })

  return new Kysely<DB>({
    dialect: new PostgresJSDialect({ postgres: pg }),
  })
}
