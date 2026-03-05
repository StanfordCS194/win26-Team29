import { SQL } from 'bun'
import { Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'

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

export interface OfferingQuartersMv {
  offering_id: number
  year: string
  subject_id: number
  term_quarter: QuarterType
  units_min: number
  units_max: number
  gers: string[]
}

export interface OfferingAggregatesMv {
  offering_id: number
  quarters: QuarterType[] // term_quarter[]
  ger_codes: string[] // string[]
}

export interface SectionInstructorSunetsMv {
  section_id: number
  instructor_sunets: string[]
}

export interface CourseContentSearch {
  offering_id: number
  search_vector: string
}

export type DB = GeneratedDB & {
  course_offerings_full_mv: CourseOfferingsFullMv
  offering_quarters_mv: OfferingQuartersMv
  course_content_search: CourseContentSearch
  offering_aggregates_mv: OfferingAggregatesMv
  section_instructor_sunets_mv: SectionInstructorSunetsMv
}

// --- Temporal serialization for postgres.js ---

export { Temporal as PGTemporal } from '@js-temporal/polyfill'

const _parseEnumArray = (value: string) => {
  return value
    .slice(1, -1)
    .split(',')
    .filter((s) => s.length > 0)
}

export function createDb(connectionString: string) {
  const pg = new SQL(connectionString, {
    max: 20,
    bigint: true,
    prepare: false,
  })

  return new Kysely<DB>({
    dialect: new PostgresJSDialect({ postgres: pg }),
  })
}
