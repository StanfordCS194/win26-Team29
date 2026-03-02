import type { DB } from '@courses/db/db.types'
import type { Selectable } from 'kysely'

type KnownDefaultedColumns = 'id' | 'created_at' | 'updated_at'
type OmitColumnsAndDefaults<T, TForeignKey extends keyof T = never> = Omit<
  T,
  TForeignKey | KnownDefaultedColumns
>
export type InsertScheduleInstructor = Selectable<DB['schedule_instructors']>
export type InsertSchedule = Selectable<DB['schedules']>
export type InsertSectionAttribute = Selectable<DB['section_attributes']>
export type InsertSection = Selectable<DB['sections']>
export type InsertLearningObjective = Selectable<DB['learning_objectives']>
export type InsertCourseOfferingAttribute = Selectable<DB['course_offering_attributes']>
export type InsertCourseOfferingGER = Selectable<DB['course_offering_gers']>
export type InsertCourseOfferingTag = Selectable<DB['course_offering_tags']>
export type InsertCourseOffering = Selectable<DB['course_offerings']>

// Nested Insert Types

// Level 4
export type UploadScheduleInstructor = OmitColumnsAndDefaults<InsertScheduleInstructor, 'schedule_id'>

// Level 3
export type UploadSchedule = OmitColumnsAndDefaults<InsertSchedule, 'section_id'> & {
  instructors: Array<UploadScheduleInstructor>
}
export type UploadSectionAttribute = OmitColumnsAndDefaults<InsertSectionAttribute, 'section_id'>

// Level 2
export type UploadSection = OmitColumnsAndDefaults<InsertSection, 'course_offering_id' | 'cancelled'> & {
  attributes: Array<UploadSectionAttribute>
  schedules: Array<UploadSchedule>
}
export type UploadLearningObjective = OmitColumnsAndDefaults<InsertLearningObjective, 'course_offering_id'>
export type UploadCourseOfferingAttribute = OmitColumnsAndDefaults<
  InsertCourseOfferingAttribute,
  'course_offering_id'
>
export type UploadCourseOfferingGER = OmitColumnsAndDefaults<InsertCourseOfferingGER, 'course_offering_id'>
export type UploadCourseOfferingTag = OmitColumnsAndDefaults<InsertCourseOfferingTag, 'course_offering_id'>

// Level 1 - Top level (root entity)
export type UploadCourseOffering = OmitColumnsAndDefaults<InsertCourseOffering> & {
  sections: Array<UploadSection>
  learningObjectives: Array<UploadLearningObjective>
  attributes: Array<UploadCourseOfferingAttribute>
  gers: Array<UploadCourseOfferingGER>
  tags: Array<UploadCourseOfferingTag>
}
