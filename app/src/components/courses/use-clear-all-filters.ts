import { Route } from '@/routes/courses'
import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import type { SearchParams } from '@/data/search/search.params'

export function hasActiveFilters(search: SearchParams): boolean {
  return (
    search.quarters.length > 0 ||
    search.quartersExclude.length > 0 ||
    search.subjects.length > 0 ||
    search.subjectsExclude.length > 0 ||
    search.gers.length > 0 ||
    search.gersExclude.length > 0 ||
    (search.days != null && search.days.length > 0) ||
    (search.daysExclude != null && search.daysExclude.length > 0) ||
    search.instructorSunets.length > 0 ||
    search.instructorSunetsExclude.length > 0 ||
    search.unitsMin != null ||
    search.unitsMax != null ||
    search.codeNumberMin != null ||
    search.codeNumberMax != null ||
    search.repeatable != null ||
    search.gradingOptions.length > 0 ||
    search.gradingOptionsExclude.length > 0 ||
    search.careers.length > 0 ||
    search.careersExclude.length > 0 ||
    search.finalExamFlags.length > 0 ||
    search.finalExamFlagsExclude.length > 0 ||
    search.numGersMin != null ||
    search.numGersMax != null ||
    search.numSubjectsMin != null ||
    search.numSubjectsMax != null ||
    search.numQuartersMin != null ||
    search.numQuartersMax != null ||
    search.numMeetingDaysMin != null ||
    search.numMeetingDaysMax != null ||
    search.componentTypes.length > 0 ||
    search.componentTypesExclude.length > 0 ||
    search.numEnrolledMin != null ||
    search.numEnrolledMax != null ||
    search.maxEnrolledMin != null ||
    search.maxEnrolledMax != null ||
    (search.enrollmentStatus != null && search.enrollmentStatus.length > 0) ||
    search.classDurationMin != null ||
    search.classDurationMax != null ||
    search.startTimeMin != null ||
    search.startTimeMax != null ||
    EVAL_QUESTION_SLUGS.some(
      (slug) => search[`min_eval_${slug}`] != null || search[`max_eval_${slug}`] != null,
    ) ||
    search.dedupeCrosslistings != null
  )
}

export function useClearAllFilters() {
  const navigate = Route.useNavigate()
  return () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          subjects: [],
          subjectsExclude: [],
          quarters: [],
          quartersExclude: [],
          days: undefined,
          daysExclude: undefined,
          codeNumberMin: undefined,
          codeNumberMax: undefined,
          unitsMin: undefined,
          unitsMax: undefined,
          classDurationMin: undefined,
          classDurationMax: undefined,
          startTimeMin: undefined,
          startTimeMax: undefined,
          gers: [],
          gersExclude: [],
          numGersMin: undefined,
          numGersMax: undefined,
          careers: [],
          careersExclude: [],
          gradingOptions: [],
          gradingOptionsExclude: [],
          finalExamFlags: [],
          finalExamFlagsExclude: [],
          componentTypes: [],
          componentTypesExclude: [],
          numSubjectsMin: undefined,
          numSubjectsMax: undefined,
          numQuartersMin: undefined,
          numQuartersMax: undefined,
          numMeetingDaysMin: undefined,
          numMeetingDaysMax: undefined,
          repeatable: undefined,
          ...Object.fromEntries(
            EVAL_QUESTION_SLUGS.flatMap((slug) => [
              [`min_eval_${slug}`, undefined],
              [`max_eval_${slug}`, undefined],
            ]),
          ),
          numEnrolledMin: undefined,
          numEnrolledMax: undefined,
          maxEnrolledMin: undefined,
          maxEnrolledMax: undefined,
          enrollmentStatus: undefined,
          instructorSunets: [],
          instructorSunetsExclude: [],
          page: 1,
        }) as unknown as Required<SearchParams>,
    })
  }
}
