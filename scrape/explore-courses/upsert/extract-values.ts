import { query } from 'jsonpathly'
import { ParsedSubjectData } from '../fetch-parse-flow.ts'
import { LookupTable } from './upsert-codes.ts'
import { ParsedInstructor } from '../fetch-parse/parse-courses.ts'

export function extractLookupValues(parsedCourses: ParsedSubjectData[]): Record<LookupTable, Set<string>> {
    return {
      academic_careers: new Set(
        query(parsedCourses, '$[*].courses[*].administrativeInformation.academicCareer', {
          returnArray: true,
        }) as string[],
      ),
      academic_groups: new Set(
        query(parsedCourses, '$[*].courses[*].administrativeInformation.academicGroup', {
          returnArray: true,
        }) as string[],
      ),
      academic_organizations: new Set(
        query(parsedCourses, '$[*].courses[*].administrativeInformation.academicOrganization', {
          returnArray: true,
        }) as string[],
      ),
      final_exam_options: new Set(
        query(parsedCourses, '$[*].courses[*].administrativeInformation.finalExamFlag', {
          returnArray: true,
        }) as string[],
      ),
      grading_options: new Set(
        query(parsedCourses, '$[*].courses[*].grading', {
          returnArray: true,
        }) as string[],
      ),
      gers: new Set(
        query(parsedCourses, '$[*].courses[*].gers[*]', {
          returnArray: true,
        }) as string[],
      ),
      consent_options: new Set([
        ...(query(parsedCourses, '$[*].courses[*].sections[*].addConsent', {
          returnArray: true,
        }) as string[]),
        ...(query(parsedCourses, '$[*].courses[*].sections[*].dropConsent', {
          returnArray: true,
        }) as string[]),
      ]),
      enroll_statuses: new Set(
        query(parsedCourses, '$[*].courses[*].sections[*].enrollStatus', {
          returnArray: true,
        }) as string[],
      ),
      component_types: new Set(
        query(parsedCourses, '$[*].courses[*].sections[*].component', {
          returnArray: true,
        }) as string[],
      ),
      instructor_roles: new Set(
        query(parsedCourses, '$[*].courses[*].sections[*].schedules[*].instructors[*].role', {
          returnArray: true,
        }) as string[],
      ),
    }
  }
  
  export function extractInstructors(parsedCourses: ParsedSubjectData[]) {
    return query(parsedCourses, '$[*].courses[*].sections[*].schedules[*].instructors[*]', {
      returnArray: true,
    }) as ParsedInstructor[]
  }