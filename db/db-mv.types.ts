/**
 * Materialized view types for course_offerings_full_mv.
 * Derived from the JSONB structure in scrape/sql/course_offerings_full_mv.sql
 */

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

export interface MvEvaluationSmartAverage {
  question: string
  smartAverage: number
  isCourseInformed: boolean
  isInstructorInformed: boolean
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
  smartEvaluations: MvEvaluationSmartAverage[]
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
