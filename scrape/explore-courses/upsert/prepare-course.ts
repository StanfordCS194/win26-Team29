import { ParsedCourse } from '../fetch-parse/parse-courses.ts'
import type { UploadCourseOffering } from './upsert-course.types.ts'
import type { LookupTable } from './upsert-codes.ts'

export type EntityLookupIdMap = Record<LookupTable, Map<string, number>> & {
  subjects: Map<string, number>
  instructors: Map<string, bigint>
}

export function parsedCourseToIncCourseOffering(
  parsed: ParsedCourse,
  lookup: EntityLookupIdMap,
): UploadCourseOffering {
  return {
    academic_career_id: lookup.academic_careers.get(parsed.administrativeInformation.academicCareer)!,
    academic_group_id: lookup.academic_groups.get(parsed.administrativeInformation.academicGroup)!,
    academic_organization_id: lookup.academic_organizations.get(
      parsed.administrativeInformation.academicOrganization,
    )!,
    catalog_print: parsed.administrativeInformation.catalogPrint,
    code_number: parsed.code.number,
    code_suffix: parsed.code.suffix || null,
    course_id: parsed.administrativeInformation.courseId,
    description: parsed.description,
    effective_status_id: lookup.effective_statuses.get(parsed.administrativeInformation.effectiveStatus)!,
    final_exam_flag_id: lookup.final_exam_options.get(parsed.administrativeInformation.finalExamFlag)!,
    grading_option_id: lookup.grading_options.get(parsed.grading)!,
    max_times_repeat: parsed.administrativeInformation.maxTimesRepeat,
    max_units_repeat: parsed.administrativeInformation.maxUnitsRepeat,
    offer_number: parsed.administrativeInformation.offerNumber,
    repeatable: parsed.repeatable,
    schedule_print: parsed.administrativeInformation.schedulePrint,
    subject_id: lookup.subjects.get(parsed.subject)!,
    title: parsed.title,
    units_max: parsed.unitsMax,
    units_min: parsed.unitsMin,
    year: parsed.year,
    sections: parsed.sections.map((section) => ({
      units_max: section.units.max ?? null,
      units_min: section.units.min ?? null,
      add_consent_id: lookup.consent_options.get(section.addConsent)!,
      class_id: section.classId,
      component_type_id: lookup.component_types.get(section.component)!,
      current_class_size: section.currentClassSize,
      current_waitlist_size: section.currentWaitlistSize,
      drop_consent_id: lookup.consent_options.get(section.dropConsent)!,
      enroll_status_id: lookup.enroll_statuses.get(section.enrollStatus)!,
      max_class_size: section.maxClassSize,
      max_enrolled: section.maxEnrolled,
      max_waitlist: section.maxWaitlist,
      max_waitlist_size: section.maxWaitlistSize,
      notes: section.notes || null,
      num_enrolled: section.numEnrolled,
      num_waitlist: section.numWaitlist,
      section_number: section.sectionNumber,
      term_id: section.termId,
      term_quarter: section.term.quarter,
      term_year: section.term.year,
      attributes: section.attributes.map((attr) => ({
        catalog_print: attr.catalogPrint,
        description: attr.description,
        schedule_print: attr.schedulePrint,
        name: attr.name,
        value: attr.value,
      })),
      schedules: section.schedules.map((schedule) => ({
        days: schedule.days.length > 0 ? schedule.days : null,
        end_date: schedule.endDate || null,
        end_time: schedule.endTime || null,
        location: schedule.location || null,
        start_date: schedule.startDate || null,
        start_time: schedule.startTime || null,
        instructors: schedule.instructors.map((instructor) => ({
          instructor_id: lookup.instructors.get(instructor.sunet)!,
          instructor_role_id: lookup.instructor_roles.get(instructor.role)!,
        })),
      })),
    })),
    learningObjectives: parsed.learningObjectives.map((objective) => ({
      requirement_code: objective.requirementCode,
      description: objective.description,
    })),
    attributes: parsed.attributes.map((attr) => ({
      catalog_print: attr.catalogPrint,
      description: attr.description,
      schedule_print: attr.schedulePrint,
      name: attr.name,
      value: attr.value,
    })),
    gers: parsed.gers.map((ger) => ({
      ger_id: lookup.gers.get(ger)!,
    })),
    tags: parsed.tags,
  }
}
