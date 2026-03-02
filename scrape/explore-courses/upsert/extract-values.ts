import { query } from 'jsonpathly'

import type { ParsedInstructor } from '../fetch-parse/parse-courses.ts'
import type { ParsedSubjectData } from '../fetch-parse-flow.ts'

import type { LookupTable } from './upsert-codes.ts'

export function extractLookupValues(
  parsedCourses: Array<ParsedSubjectData>,
): Record<LookupTable, Set<string>> {
  return {
    academic_careers: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.academicCareer', {
        returnArray: true,
      }) as Array<string>,
    ),
    academic_groups: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.academicGroup', {
        returnArray: true,
      }) as Array<string>,
    ),
    academic_organizations: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.academicOrganization', {
        returnArray: true,
      }) as Array<string>,
    ),
    final_exam_options: new Set(
      query(parsedCourses, '$[*].courses[*].administrativeInformation.finalExamFlag', {
        returnArray: true,
      }) as Array<string>,
    ),
    grading_options: new Set(
      query(parsedCourses, '$[*].courses[*].grading', {
        returnArray: true,
      }) as Array<string>,
    ),
    gers: new Set(
      query(parsedCourses, '$[*].courses[*].gers[*]', {
        returnArray: true,
      }) as Array<string>,
    ),
    consent_options: new Set([
      ...(query(parsedCourses, '$[*].courses[*].sections[*].addConsent', {
        returnArray: true,
      }) as Array<string>),
      ...(query(parsedCourses, '$[*].courses[*].sections[*].dropConsent', {
        returnArray: true,
      }) as Array<string>),
    ]),
    enroll_statuses: new Set(
      query(parsedCourses, '$[*].courses[*].sections[*].enrollStatus', {
        returnArray: true,
      }) as Array<string>,
    ),
    component_types: new Set(
      query(parsedCourses, '$[*].courses[*].sections[*].component', {
        returnArray: true,
      }) as Array<string>,
    ),
    instructor_roles: new Set(
      query(parsedCourses, '$[*].courses[*].sections[*].schedules[*].instructors[*].role', {
        returnArray: true,
      }) as Array<string>,
    ),
  }
}

export function extractInstructors(parsedCourses: Array<ParsedSubjectData>) {
  return query(parsedCourses, '$[*].courses[*].sections[*].schedules[*].instructors[*]', {
    returnArray: true,
  }) as Array<ParsedInstructor>
}
