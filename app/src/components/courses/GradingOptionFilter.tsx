import { Fragment, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Eraser, X } from 'lucide-react'
import { Route } from '@/routes/courses'
import { availableGradingOptionsQueryOptions } from './courses-query-options'
import type { SearchParams } from '@/data/search/search.params'
import { cn } from '@/lib/utils'

// ── Hardcoded group mapping ───────────────────────────────────────────────────

const GRADING_GROUPS: { name: string; topLevel?: boolean; codes: string[] }[] = [
  {
    name: 'Standard',
    topLevel: true,
    codes: [
      'Letter (ABCD/NP)',
      'Letter or Credit/No Credit',
      'Credit / No Credit',
      'Credit/No Credit',
      'Satisfactory/No Credit',
    ],
  },
  {
    name: 'GSB',
    codes: ['GSB Letter Graded', 'GSB Pass/Fail', 'GSB Student Option LTR/PF'],
  },
  {
    name: 'Law',
    codes: [
      'Law Honors/Pass/Restrd Cr/Fail',
      'Law Mandatory Credit 3K',
      'Law Mandatory P/R/F',
      'Law Mixed H/P/R/F or MP/R/F',
      'Law Student Option NM/KE',
      'Law Student Option NM/KM',
    ],
  },
  {
    name: 'Medical',
    codes: [
      'MED Letter Graded',
      'Medical Option (Med-Ltr-CR/NC)',
      'Medical Satisfactory/No Credit',
      'Medical School MD Grades',
    ],
  },
  {
    name: 'Other',
    codes: ['NQF Scale', 'RO Satisfactory/Unsatisfactory', 'TGR'],
  },
]

const COL_W = 'w-12'

// ── Keyboard column cycling ───────────────────────────────────────────────────

type HighlightedCol = null | 'include' | 'exclude'
const COL_CYCLE: HighlightedCol[] = [null, 'include', 'exclude']

function includeButtonClass(
  isIncluded: boolean,
  isExcluded: boolean,
  isLabelHovered: boolean,
  colHighlight: HighlightedCol,
) {
  return cn(
    "relative flex h-4.5 w-4.5 items-center justify-center rounded-full border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
    isIncluded
      ? 'border-emerald-500 bg-emerald-500 text-white'
      : 'border-slate-300 bg-white hover:border-emerald-400',
    !isExcluded && isLabelHovered && 'ring-2 ring-emerald-300 ring-offset-1',
    !isExcluded && isLabelHovered && !isIncluded && 'border-emerald-400',
    'group-hover/include-col:ring-2 group-hover/include-col:ring-emerald-300 group-hover/include-col:ring-offset-1',
    !isIncluded && 'group-hover/include-col:border-emerald-400',
    colHighlight === 'include' && 'ring-2 ring-emerald-400 ring-offset-1',
    'focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1',
  )
}

function excludeButtonClass(isExcluded: boolean, isLabelHovered: boolean, colHighlight: HighlightedCol) {
  return cn(
    "relative flex h-4.5 w-4.5 items-center justify-center rounded-full border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
    isExcluded ? 'border-rose-400 bg-rose-400 text-white' : 'border-slate-300 bg-white hover:border-rose-300',
    isExcluded
      ? 'group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-300 group-hover/exclude-col:ring-offset-1'
      : 'group-hover/exclude-col:border-rose-300 group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-200 group-hover/exclude-col:ring-offset-1',
    isLabelHovered && isExcluded && 'ring-2 ring-rose-300 ring-offset-1',
    colHighlight === 'exclude' && 'ring-2 ring-rose-400 ring-offset-1',
    'focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1',
  )
}

// ── Flat item types for keyboard navigation ───────────────────────────────────

type FlatCode = { kind: 'code'; code: string }
type FlatHeader = { kind: 'header'; groupName: string; codes: string[] }
type FlatItem = FlatCode | FlatHeader

// ── Component ─────────────────────────────────────────────────────────────────

export function GradingOptionFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: availableCodes = [] } = useQuery(availableGradingOptionsQueryOptions(search.year))

  const include = search.gradingOptions ?? []
  const exclude = search.gradingOptionsExclude ?? []

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [highlightedCol, setHighlightedCol] = useState<HighlightedCol>(null)
  const [labelHoveredIdx, setLabelHoveredIdx] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // ── Build groups filtered to available codes ─────────────────────────────

  const availableSet = useMemo(() => new Set(availableCodes), [availableCodes])

  const groups = useMemo(() => {
    const mapped = GRADING_GROUPS.map((g) => ({
      ...g,
      codes: g.codes.filter((c) => availableSet.has(c)),
    })).filter((g) => g.codes.length > 0)

    // Catch-all: codes returned by the query not in any group
    const allMapped = new Set(GRADING_GROUPS.flatMap((g) => g.codes))
    const unmapped = availableCodes.filter((c) => !allMapped.has(c))
    if (unmapped.length > 0) {
      const existing = mapped.find((g) => g.name === 'Other')
      if (existing) existing.codes = [...existing.codes, ...unmapped]
      else mapped.push({ name: 'Other', codes: unmapped })
    }

    return mapped
  }, [availableCodes, availableSet])

  // ── Visibility helper ────────────────────────────────────────────────────

  const isCodeVisible = (code: string, groupOpen: boolean, groupCodes: string[]) => {
    if (groupOpen) return true
    const groupAllIncluded = groupCodes.length > 0 && groupCodes.every((c) => include.includes(c))
    const groupAllExcluded = groupCodes.length > 0 && groupCodes.every((c) => exclude.includes(c))
    const isIncluded = include.includes(code)
    const isExcluded = exclude.includes(code)
    return (isIncluded && !groupAllIncluded) || (isExcluded && !groupAllExcluded)
  }

  // ── Flat item list for keyboard navigation ───────────────────────────────

  const flatItems = useMemo(() => {
    const items: FlatItem[] = []
    for (const group of groups) {
      if (group.topLevel === true) {
        for (const code of group.codes) {
          items.push({ kind: 'code', code })
        }
      } else {
        items.push({ kind: 'header', groupName: group.name, codes: group.codes })
        const open = openGroups.has(group.name)
        for (const code of group.codes) {
          if (isCodeVisible(code, open, group.codes)) {
            items.push({ kind: 'code', code })
          }
        }
      }
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, openGroups, include, exclude])

  // ── Navigate helper ──────────────────────────────────────────────────────

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  // ── Toggle handlers ──────────────────────────────────────────────────────

  const toggleInclude = (code: string) => {
    if (include.includes(code)) {
      navigate_({ gradingOptions: include.filter((v) => v !== code) })
    } else {
      navigate_({
        gradingOptions: [...include, code],
        gradingOptionsExclude: exclude.filter((v) => v !== code),
      })
    }
  }

  const toggleExclude = (code: string) => {
    if (exclude.includes(code)) {
      navigate_({ gradingOptionsExclude: exclude.filter((v) => v !== code) })
    } else {
      navigate_({
        gradingOptionsExclude: [...exclude, code],
        gradingOptions: include.filter((v) => v !== code),
      })
    }
  }

  const toggleBulkInclude = (codes: string[]) => {
    const codeSet = new Set(codes)
    const allIncluded = codes.every((c) => include.includes(c))
    if (allIncluded) {
      navigate_({ gradingOptions: include.filter((c) => !codeSet.has(c)) })
    } else {
      navigate_({
        gradingOptions: [...include.filter((c) => !codeSet.has(c)), ...codes],
        gradingOptionsExclude: exclude.filter((c) => !codeSet.has(c)),
      })
    }
  }

  const toggleBulkExclude = (codes: string[]) => {
    const codeSet = new Set(codes)
    const allExcluded = codes.every((c) => exclude.includes(c))
    if (allExcluded) {
      navigate_({ gradingOptionsExclude: exclude.filter((c) => !codeSet.has(c)) })
    } else {
      navigate_({
        gradingOptionsExclude: [...exclude.filter((c) => !codeSet.has(c)), ...codes],
        gradingOptions: include.filter((c) => !codeSet.has(c)),
      })
    }
  }

  const toggleOpen = (groupName: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }

  // ── Focus management ─────────────────────────────────────────────────────

  const focusElement = (idx: number, col: HighlightedCol) => {
    if (idx < 0) return
    const colAttr = col ?? 'row'
    const selector = `[data-flat-idx="${idx}"][data-col="${colAttr}"]`
    containerRef.current?.querySelector<HTMLElement>(selector)?.focus()
  }

  // ── Container-level keyboard handling ────────────────────────────────────

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = flatItems.length
    if (!n) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = highlightedIndex >= n - 1 ? 0 : highlightedIndex + 1
      setHighlightedIndex(newIdx)
      focusElement(newIdx, highlightedCol)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = highlightedIndex <= 0 ? n - 1 : highlightedIndex - 1
      setHighlightedIndex(newIdx)
      focusElement(newIdx, highlightedCol)
    } else if (e.key === 'ArrowRight' && highlightedIndex >= 0) {
      e.preventDefault()
      const idx = COL_CYCLE.indexOf(highlightedCol)
      const newCol = COL_CYCLE[(idx + 1) % COL_CYCLE.length]
      setHighlightedCol(newCol)
      focusElement(highlightedIndex, newCol)
    } else if (e.key === 'ArrowLeft' && highlightedIndex >= 0) {
      e.preventDefault()
      const idx = COL_CYCLE.indexOf(highlightedCol)
      const newCol = COL_CYCLE[(idx - 1 + COL_CYCLE.length) % COL_CYCLE.length]
      setHighlightedCol(newCol)
      focusElement(highlightedIndex, newCol)
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      const item: FlatItem | undefined = flatItems[highlightedIndex]
      if (item == null) return
      if (item.kind === 'header') {
        if (highlightedCol === 'exclude') toggleBulkExclude(item.codes)
        else toggleBulkInclude(item.codes)
      } else {
        if (highlightedCol === 'include') toggleInclude(item.code)
        else if (highlightedCol === 'exclude') toggleExclude(item.code)
        else {
          if (include.includes(item.code)) toggleInclude(item.code)
          else if (exclude.includes(item.code)) toggleExclude(item.code)
          else toggleInclude(item.code)
        }
      }
    } else if (e.key === ' ' && highlightedIndex >= 0) {
      e.preventDefault()
      const item: FlatItem | undefined = flatItems[highlightedIndex]
      if (item == null) return
      if (item.kind === 'header') {
        toggleOpen(item.groupName)
      } else {
        if (highlightedCol === 'include') toggleInclude(item.code)
        else if (highlightedCol === 'exclude') toggleExclude(item.code)
        else {
          if (include.includes(item.code)) toggleInclude(item.code)
          else if (exclude.includes(item.code)) toggleExclude(item.code)
          else toggleInclude(item.code)
        }
      }
    }
  }

  const handleContainerFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const flatIdxAttr = target.closest('[data-flat-idx]')?.getAttribute('data-flat-idx')
    const colAttr = target.closest('[data-col]')?.getAttribute('data-col')
    if (flatIdxAttr != null) {
      setHighlightedIndex(Number(flatIdxAttr))
      if (colAttr === 'include') setHighlightedCol('include')
      else if (colAttr === 'exclude') setHighlightedCol('exclude')
      else setHighlightedCol(null)
    } else {
      setHighlightedIndex(-1)
      setHighlightedCol(null)
    }
  }

  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!(e.currentTarget as HTMLDivElement).contains(e.relatedTarget as Node)) {
      setHighlightedIndex(-1)
      setHighlightedCol(null)
    }
  }

  // ── Rendering helpers ────────────────────────────────────────────────────

  let flatIdx = 0
  const takeFlatIdx = () => flatIdx++

  const renderBulkButtons = (codes: string[], groupName: string, headerFlatIdx: number) => {
    const allIncluded = codes.length > 0 && codes.every((c) => include.includes(c))
    const allExcluded = codes.length > 0 && codes.every((c) => exclude.includes(c))
    const isRowHighlighted = headerFlatIdx === highlightedIndex
    const colHighlight = isRowHighlighted ? highlightedCol : null

    return (
      <>
        <div
          className={`group/include-col flex ${COL_W} cursor-pointer items-center justify-center self-stretch py-1`}
          onClick={() => toggleBulkInclude(codes)}
        >
          <button
            type="button"
            data-flat-idx={headerFlatIdx}
            data-col="include"
            onClick={(e) => {
              e.stopPropagation()
              toggleBulkInclude(codes)
            }}
            aria-label={`Include all ${groupName}`}
            className={cn(
              "relative flex h-4.5 w-4.5 items-center justify-center rounded border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
              allIncluded
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-300 bg-white hover:border-emerald-400',
              'group-hover/include-col:ring-2 group-hover/include-col:ring-emerald-300 group-hover/include-col:ring-offset-1',
              !allIncluded && 'group-hover/include-col:border-emerald-400',
              colHighlight === 'include' && 'ring-2 ring-emerald-400 ring-offset-1',
              'focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1',
            )}
          >
            {allIncluded && <Check className="h-2.5 w-2.5" />}
          </button>
        </div>
        <div
          className={`group/exclude-col flex ${COL_W} cursor-pointer items-center justify-center self-stretch py-1`}
          onClick={() => toggleBulkExclude(codes)}
        >
          <button
            type="button"
            data-flat-idx={headerFlatIdx}
            data-col="exclude"
            onClick={(e) => {
              e.stopPropagation()
              toggleBulkExclude(codes)
            }}
            aria-label={`Exclude all ${groupName}`}
            className={cn(
              "relative flex h-4.5 w-4.5 items-center justify-center rounded border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
              allExcluded
                ? 'border-rose-400 bg-rose-400 text-white'
                : 'border-slate-300 bg-white hover:border-rose-300',
              allExcluded
                ? 'group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-300 group-hover/exclude-col:ring-offset-1'
                : 'group-hover/exclude-col:border-rose-300 group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-200 group-hover/exclude-col:ring-offset-1',
              colHighlight === 'exclude' && 'ring-2 ring-rose-400 ring-offset-1',
              'focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1',
            )}
          >
            {allExcluded && <X className="h-2.5 w-2.5" />}
          </button>
        </div>
      </>
    )
  }

  const renderCodeRow = (code: string, indent = 'pl-4') => {
    const isIncluded = include.includes(code)
    const isExcluded = exclude.includes(code)
    const currentFlatIdx = takeFlatIdx()
    const isRowHighlighted = currentFlatIdx === highlightedIndex
    const colHighlight = isRowHighlighted ? highlightedCol : null
    const isLabelHovered = labelHoveredIdx === currentFlatIdx

    return (
      <div
        key={code}
        className={cn(
          'group/row col-span-3 grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors',
          isRowHighlighted
            ? 'bg-slate-100 ring-1 ring-slate-200'
            : 'focus-within:bg-slate-100 focus-within:ring-1 focus-within:ring-slate-200 hover:bg-slate-50',
        )}
      >
        <span
          tabIndex={0}
          data-flat-idx={currentFlatIdx}
          data-col="row"
          onClick={() => toggleInclude(code)}
          onMouseEnter={() => setLabelHoveredIdx(currentFlatIdx)}
          onMouseLeave={() => setLabelHoveredIdx(null)}
          className={`min-w-0 cursor-pointer truncate py-1 ${indent} text-sm text-slate-700 outline-none group-hover/row:[-webkit-text-stroke:0.2px_currentColor]`}
        >
          {code}
        </span>
        <div
          className={`group/include-col flex ${COL_W} cursor-pointer items-center justify-center self-stretch py-1`}
          onClick={() => toggleInclude(code)}
        >
          <button
            type="button"
            data-flat-idx={currentFlatIdx}
            data-col="include"
            onClick={(e) => {
              e.stopPropagation()
              toggleInclude(code)
            }}
            aria-label={`Include ${code}`}
            className={includeButtonClass(isIncluded, isExcluded, isLabelHovered, colHighlight)}
          >
            {isIncluded && <Check className="h-2.5 w-2.5" />}
          </button>
        </div>
        <div
          className={`group/exclude-col flex ${COL_W} cursor-pointer items-center justify-center self-stretch py-1`}
          onClick={() => toggleExclude(code)}
        >
          <button
            type="button"
            data-flat-idx={currentFlatIdx}
            data-col="exclude"
            onClick={(e) => {
              e.stopPropagation()
              toggleExclude(code)
            }}
            aria-label={`Exclude ${code}`}
            className={excludeButtonClass(isExcluded, isLabelHovered, colHighlight)}
          >
            {isExcluded && <X className="h-2.5 w-2.5" />}
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────

  flatIdx = 0

  return (
    <div
      ref={containerRef}
      onKeyDown={handleContainerKeyDown}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-y-[1.5px]">
        {/* Header row */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-slate-500 uppercase">Grading</span>
          {(include.length > 0 || exclude.length > 0) && (
            <button
              type="button"
              onClick={() => navigate_({ gradingOptions: [], gradingOptionsExclude: [] })}
              aria-label="Clear Grading filter"
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Eraser className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className={`flex ${COL_W} items-center justify-center py-1`}>
          <span className="text-[10.5px] font-medium text-slate-400">Include</span>
        </div>
        <div className={`flex ${COL_W} items-center justify-center py-1`}>
          <span className="text-[10.5px] font-medium text-slate-400">Exclude</span>
        </div>

        {/* Group rows */}
        {groups.map((group) => {
          if (group.topLevel === true) {
            return (
              <Fragment key={group.name}>{group.codes.map((code) => renderCodeRow(code, 'pl-1.5'))}</Fragment>
            )
          }

          const groupOpen = openGroups.has(group.name)
          const headerFlatIdx = takeFlatIdx()
          const isHeaderHighlighted = headerFlatIdx === highlightedIndex

          return (
            <Fragment key={group.name}>
              <div
                className={cn(
                  'col-span-3 grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors',
                  isHeaderHighlighted ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50',
                )}
              >
                <button
                  type="button"
                  tabIndex={0}
                  data-flat-idx={headerFlatIdx}
                  data-col="row"
                  onClick={() => toggleOpen(group.name)}
                  className="flex min-w-0 items-center gap-0.5 overflow-hidden py-1 pl-1 text-left text-[13px] font-semibold text-slate-600 transition outline-none hover:text-slate-800"
                >
                  {groupOpen ? (
                    <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                  )}
                  <span className="truncate">{group.name}</span>
                </button>
                {renderBulkButtons(group.codes, group.name, headerFlatIdx)}
              </div>
              {group.codes.map((code) => {
                if (!isCodeVisible(code, groupOpen, group.codes)) return null
                return renderCodeRow(code)
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
