import { SQL } from 'bun'
import { Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'

import type { DB as GeneratedDB } from './db.types.ts'
import type { QuarterType } from './db.types.ts'

export type { Kysely } from 'kysely'
export type { QuarterType } from './db.types.ts'

// --- Materialized view JSON types ---
// Derived from the JSONB structure in course_offerings_full_mv (see scrape/sql/course_offerings_full_mv.sql)

export interface MvInstructor {
  instructorId: number
  name: string
  firstName: string
  middleName: string | null
  lastName: string
  sunet: string
  role: string
}

export interface MvSchedule {
  scheduleId: number
  startDate: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
  days: string[] | null
  instructors: MvInstructor[]
}

export interface MvSectionAttribute {
  name: string
  value: string
  description: string
  schedulePrint: boolean
}

export interface MvSection {
  sectionId: number
  classId: number
  sectionNumber: string
  termQuarter: string
  termId: number
  componentType: string
  unitsMin: number
  unitsMax: number
  numEnrolled: number
  maxEnrolled: number
  numWaitlist: number
  maxWaitlist: number
  enrollStatus: string
  addConsent: string
  dropConsent: string
  currentClassSize: number
  maxClassSize: number
  currentWaitlistSize: number
  maxWaitlistSize: number
  notes: string | null
  cancelled: boolean
  attributes: MvSectionAttribute[]
  schedules: MvSchedule[]
}

export interface MvOfferingTag {
  organization: string
  name: string
}

export interface MvOfferingAttribute {
  name: string
  value: string
  description: string
  schedulePrint: boolean
}

export interface MvLearningObjective {
  requirementCode: string
  description: string
}

// --- Materialized view table types ---

export interface CourseOfferingsFullMv {
  offering_id: number
  course_id: number
  year: string
  offer_number: number
  subject_code: string
  subject_longname: string | null
  code_number: number
  code_suffix: string | null
  title: string
  description: string
  repeatable: boolean
  units_min: number
  units_max: number
  max_units_repeat: number
  max_times_repeat: number
  schedule_print: boolean
  created_at: Date | null
  grading_option: string
  final_exam_flag: string
  academic_group: string
  academic_career: string
  academic_organization: string
  gers: string[]
  tags: MvOfferingTag[]
  attributes: MvOfferingAttribute[]
  learning_objectives: MvLearningObjective[]
  sections: MvSection[]
}

export interface EligibleOfferingsMv {
  offering_id: number
  year: string
  subject_id: number
  term_quarter: QuarterType
  units_min: number
  units_max: number
  gers: string[]
}

export interface CourseContentSearch {
  offering_id: number
  search_vector: string
}

export type DB = GeneratedDB & {
  course_offerings_full_mv: CourseOfferingsFullMv
  eligible_offerings_mv: EligibleOfferingsMv
  course_content_search: CourseContentSearch
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
