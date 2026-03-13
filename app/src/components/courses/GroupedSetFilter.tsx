import { Fragment, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Eraser, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const COL_W = 'w-12'

// ── Types ─────────────────────────────────────────────────────────────────────

type HighlightedCol = null | 'include' | 'exclude'

type FlatCode = { kind: 'code'; code: string }
type FlatHeader = { kind: 'header'; groupName: string; codes: string[] }
type FlatItem = FlatCode | FlatHeader

export interface GroupedSetFilterGroup {
  name: string
  topLevel?: boolean
  codes: string[]
}

export interface GroupedSetFilterProps {
  label: string
  groups: GroupedSetFilterGroup[]
  getLabel: (code: string) => string
  include: string[]
  exclude: string[]
  onIncludeChange: (codes: string[]) => void
  onExcludeChange: (codes: string[]) => void
  onClear: () => void
  advancedMode?: boolean
}

// ── Button styling ─────────────────────────────────────────────────────────────

function includeButtonClass(
  isIncluded: boolean,
  isExcluded: boolean,
  isLabelHovered: boolean,
  colHighlight: HighlightedCol,
) {
  return cn(
    "relative flex h-4.5 w-4.5 items-center justify-center rounded border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
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
    "relative flex h-4.5 w-4.5 items-center justify-center rounded border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
    isExcluded ? 'border-rose-400 bg-rose-400 text-white' : 'border-slate-300 bg-white hover:border-rose-300',
    isExcluded
      ? 'group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-300 group-hover/exclude-col:ring-offset-1'
      : 'group-hover/exclude-col:border-rose-300 group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-200 group-hover/exclude-col:ring-offset-1',
    isLabelHovered && isExcluded && 'ring-2 ring-rose-300 ring-offset-1',
    colHighlight === 'exclude' && 'ring-2 ring-rose-400 ring-offset-1',
    'focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1',
  )
}

// ── Component ───────────────────────────────────────────────────────────────────

export function GroupedSetFilter({
  label,
  groups,
  getLabel,
  include,
  exclude,
  onIncludeChange,
  onExcludeChange,
  onClear,
  advancedMode = false,
}: GroupedSetFilterProps) {
  const colCycle: HighlightedCol[] = advancedMode ? [null, 'include', 'exclude'] : [null, 'include']

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [highlightedCol, setHighlightedCol] = useState<HighlightedCol>(null)
  const [labelHoveredIdx, setLabelHoveredIdx] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // ── Flat item list for keyboard navigation ───────────────────────────────────

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
          if (open) {
            items.push({ kind: 'code', code })
          }
        }
      }
    }
    return items
  }, [groups, openGroups])

  // ── Toggle handlers ───────────────────────────────────────────────────────────

  const toggleInclude = (code: string) => {
    if (include.includes(code)) {
      onIncludeChange(include.filter((v) => v !== code))
    } else {
      onIncludeChange([...include, code])
      onExcludeChange(exclude.filter((v) => v !== code))
    }
  }

  const toggleExclude = (code: string) => {
    if (exclude.includes(code)) {
      onExcludeChange(exclude.filter((v) => v !== code))
    } else {
      onExcludeChange([...exclude, code])
      onIncludeChange(include.filter((v) => v !== code))
    }
  }

  const toggleBulkInclude = (codes: string[]) => {
    const codeSet = new Set(codes)
    const allIncluded = codes.length > 0 && codes.every((c) => include.includes(c))
    const someIncluded = codes.some((c) => include.includes(c))
    if (allIncluded || someIncluded) {
      onIncludeChange(include.filter((c) => !codeSet.has(c)))
    } else {
      onIncludeChange([...include.filter((c) => !codeSet.has(c)), ...codes])
      onExcludeChange(exclude.filter((c) => !codeSet.has(c)))
    }
  }

  const toggleBulkExclude = (codes: string[]) => {
    const codeSet = new Set(codes)
    const allExcluded = codes.length > 0 && codes.every((c) => exclude.includes(c))
    const someExcluded = codes.some((c) => exclude.includes(c))
    if (allExcluded || someExcluded) {
      onExcludeChange(exclude.filter((c) => !codeSet.has(c)))
    } else {
      onExcludeChange([...exclude.filter((c) => !codeSet.has(c)), ...codes])
      onIncludeChange(include.filter((c) => !codeSet.has(c)))
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

  // ── Focus management ─────────────────────────────────────────────────────────

  const focusElement = (idx: number, col: HighlightedCol) => {
    if (idx < 0) return
    const colAttr = col ?? 'row'
    const selector = `[data-flat-idx="${idx}"][data-col="${colAttr}"]`
    containerRef.current?.querySelector<HTMLElement>(selector)?.focus()
  }

  // ── Container-level keyboard handling ───────────────────────────────────────

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
      const idx = colCycle.indexOf(highlightedCol)
      const newCol = colCycle[(idx + 1) % colCycle.length]
      setHighlightedCol(newCol)
      focusElement(highlightedIndex, newCol)
    } else if (e.key === 'ArrowLeft' && highlightedIndex >= 0) {
      e.preventDefault()
      const idx = colCycle.indexOf(highlightedCol)
      const newCol = colCycle[(idx - 1 + colCycle.length) % colCycle.length]
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

  // ── Rendering ─────────────────────────────────────────────────────────────────

  let flatIdx = 0
  const takeFlatIdx = () => flatIdx++

  const renderBulkButtons = (codes: string[], groupName: string, headerFlatIdx: number) => {
    const allIncluded = codes.length > 0 && codes.every((c) => include.includes(c))
    const allExcluded = codes.length > 0 && codes.every((c) => exclude.includes(c))
    const someIncluded = !allIncluded && codes.some((c) => include.includes(c))
    const someExcluded = !allExcluded && codes.some((c) => exclude.includes(c))
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
                : someIncluded
                  ? 'border-emerald-500 text-white'
                  : 'border-slate-300 bg-white hover:border-emerald-400',
              'group-hover/include-col:ring-2 group-hover/include-col:ring-emerald-300 group-hover/include-col:ring-offset-1',
              !allIncluded && !someIncluded && 'group-hover/include-col:border-emerald-400',
              colHighlight === 'include' && 'ring-2 ring-emerald-400 ring-offset-1',
              'focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1',
            )}
            style={
              someIncluded
                ? { background: 'linear-gradient(225deg, rgba(16,185,129,0.2) 50%, #10b981 50%)' }
                : undefined
            }
          >
            {(allIncluded || someIncluded) && <Check className="h-2.5 w-2.5" />}
          </button>
        </div>
        {advancedMode && (
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
                  : someExcluded
                    ? 'border-rose-400 text-white'
                    : 'border-slate-300 bg-white hover:border-rose-300',
                allExcluded
                  ? 'group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-300 group-hover/exclude-col:ring-offset-1'
                  : 'group-hover/exclude-col:border-rose-300 group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-200 group-hover/exclude-col:ring-offset-1',
                colHighlight === 'exclude' && 'ring-2 ring-rose-400 ring-offset-1',
                'focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1',
              )}
              style={
                someExcluded
                  ? { background: 'linear-gradient(225deg, rgba(248,113,113,0.2) 50%, #f87171 50%)' }
                  : undefined
              }
            >
              {(allExcluded || someExcluded) && <X className="h-2.5 w-2.5" />}
            </button>
          </div>
        )}
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
          'group/row grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors',
          advancedMode ? 'col-span-3' : 'col-span-2',
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
          {getLabel(code)}
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
            aria-label={`Include ${getLabel(code)}`}
            className={includeButtonClass(isIncluded, isExcluded, isLabelHovered, colHighlight)}
          >
            {isIncluded && <Check className="h-2.5 w-2.5" />}
          </button>
        </div>
        {advancedMode && (
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
              aria-label={`Exclude ${getLabel(code)}`}
              className={excludeButtonClass(isExcluded, isLabelHovered, colHighlight)}
            >
              {isExcluded && <X className="h-2.5 w-2.5" />}
            </button>
          </div>
        )}
      </div>
    )
  }

  flatIdx = 0

  return (
    <div
      ref={containerRef}
      onKeyDown={handleContainerKeyDown}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
    >
      <div
        className={cn(
          'grid items-center gap-y-[1.5px]',
          advancedMode ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]',
        )}
      >
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-slate-500 uppercase">{label}</span>
          {(include.length > 0 || exclude.length > 0) && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear ${label} filter`}
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Eraser className="h-3 w-3" />
            </button>
          )}
        </div>
        {advancedMode && (
          <div className={`flex ${COL_W} items-center justify-center py-1`}>
            <span className="text-[10.5px] font-medium text-slate-400">Include</span>
          </div>
        )}
        {advancedMode && (
          <div className={`flex ${COL_W} items-center justify-center py-1`}>
            <span className="text-[10.5px] font-medium text-slate-400">Exclude</span>
          </div>
        )}

        {groups.map((group) => {
          if (group.topLevel === true) {
            return (
              <Fragment key={group.name}>{group.codes.map((code) => renderCodeRow(code, 'pl-1.5'))}</Fragment>
            )
          }

          const groupOpen = openGroups.has(group.name)
          const headerFlatIdx = takeFlatIdx()

          return (
            <Fragment key={group.name}>
              <div
                className={cn(
                  'grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors',
                  advancedMode ? 'col-span-3' : 'col-span-2',
                  headerFlatIdx === highlightedIndex
                    ? 'bg-slate-100 ring-1 ring-slate-200'
                    : 'hover:bg-slate-50',
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
              {groupOpen && group.codes.map((code) => renderCodeRow(code))}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
