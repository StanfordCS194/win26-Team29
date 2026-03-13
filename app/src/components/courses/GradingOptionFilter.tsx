import { useCallback, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Route } from '@/routes/courses'
import { availableGradingOptionsQueryOptions } from './courses-query-options'
import { GroupedSetFilter } from './GroupedSetFilter'
import type { SearchParams } from '@/data/search/search.params'
import { GRADING_GROUPS, compressGradingCodes, expandGradingTokens } from './grading-groups'

export function GradingOptionFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true
  const { data: availableCodes = [] } = useQuery(availableGradingOptionsQueryOptions(search.year))

  const include = search.gradingOptions ?? []
  const exclude = search.gradingOptionsExclude ?? []

  const expandedInclude = useMemo(() => expandGradingTokens(include), [include])
  const expandedExclude = useMemo(() => expandGradingTokens(exclude), [exclude])

  const groups = useMemo(() => {
    const availableSet = new Set(availableCodes)
    const mapped = GRADING_GROUPS.map((g) => ({
      ...g,
      codes: g.codes.filter((c) => availableSet.has(c)),
    })).filter((g) => g.codes.length > 0)

    const allMapped = new Set(GRADING_GROUPS.flatMap((g) => g.codes))
    const unmapped = availableCodes.filter((c) => !allMapped.has(c))
    if (unmapped.length > 0) {
      const existingIdx = mapped.findIndex((g) => g.name === 'Other')
      if (existingIdx >= 0) {
        mapped[existingIdx] = { ...mapped[existingIdx]!, codes: [...mapped[existingIdx]!.codes, ...unmapped] }
      } else {
        mapped.push({ name: 'Other', codes: unmapped })
      }
    }

    return mapped
  }, [availableCodes])

  const navigate_ = useCallback(
    (patch: Partial<SearchParams>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
      })
    },
    [navigate],
  )

  const pendingRef = useRef<{ include?: string[]; exclude?: string[] } | null>(null)

  const flushPending = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending == null) return
    const { include: inc, exclude: exc } = pending
    if (inc == null || exc == null) return
    navigate_({
      gradingOptions: compressGradingCodes(inc, availableCodes),
      gradingOptionsExclude: compressGradingCodes(exc, availableCodes),
    })
  }, [availableCodes, navigate_])

  const onIncludeChange = useCallback(
    (codes: string[]) => {
      pendingRef.current = {
        ...pendingRef.current,
        include: codes,
        exclude: expandedExclude.filter((c) => !codes.includes(c)),
      }
      queueMicrotask(flushPending)
    },
    [expandedExclude, flushPending],
  )

  const onExcludeChange = useCallback(
    (codes: string[]) => {
      const next = { ...pendingRef.current, exclude: codes }
      if (next.include === undefined) {
        next.include = expandedInclude.filter((c) => !codes.includes(c))
      }
      pendingRef.current = next
      queueMicrotask(flushPending)
    },
    [expandedInclude, flushPending],
  )

  return (
    <GroupedSetFilter
      label="Grading"
      groups={groups}
      getLabel={(code) => code}
      include={expandedInclude}
      exclude={expandedExclude}
      onIncludeChange={onIncludeChange}
      onExcludeChange={onExcludeChange}
      onClear={() => navigate_({ gradingOptions: [], gradingOptionsExclude: [] })}
      advancedMode={advancedMode}
    />
  )
}
