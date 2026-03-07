import { useQuery } from '@tanstack/react-query'
import { Route } from '@/routes/courses'
import { availableFinalExamOptionsQueryOptions } from './courses-query-options'
import { SetFilter } from './SetFilter'
import { PickFilter } from './PickFilter'
import type { SearchParams } from '@/data/search/search.params'

import { FINAL_EXAM_LABELS } from './final-exam-labels'

export function FinalExamFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true
  const { data: codes = [] } = useQuery(availableFinalExamOptionsQueryOptions(search.year))

  const items = codes.map((c) => ({ value: c, label: FINAL_EXAM_LABELS[c] ?? c }))

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  if (!advancedMode) {
    return (
      <PickFilter
        label="Final Exam"
        mode="multi"
        options={items}
        value={search.finalExamFlags}
        onChange={(v) => navigate_({ finalExamFlags: v })}
        onClear={search.finalExamFlags.length > 0 ? () => navigate_({ finalExamFlags: [] }) : undefined}
      />
    )
  }

  return (
    <SetFilter
      label="Final Exam"
      items={items}
      include={search.finalExamFlags}
      exclude={search.finalExamFlagsExclude}
      onIncludeChange={(v) => navigate_({ finalExamFlags: v })}
      onExcludeChange={(v) => navigate_({ finalExamFlagsExclude: v })}
      onClear={() => navigate_({ finalExamFlags: [], finalExamFlagsExclude: [] })}
    />
  )
}
