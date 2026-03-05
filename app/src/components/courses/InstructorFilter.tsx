import { useRef, useMemo, useState, useLayoutEffect, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Eraser, Search, X } from 'lucide-react'
import { Route } from '@/routes/courses'
import { availableInstructorsQueryOptions } from './courses-query-options'
import type { SearchParams } from '@/data/search/search.params'
import { cn } from '@/lib/utils'

const COL_W = 'w-12'

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

export function InstructorFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: instructors = [] } = useQuery(availableInstructorsQueryOptions(search.year))

  const include = search.instructorSunets
  const exclude = search.instructorSunetsExclude
  const includeMode = search.instructorSunetsIncludeMode

  const includeSet = useMemo(() => new Set(include), [include])
  const excludeSet = useMemo(() => new Set(exclude), [exclude])

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [localQuery, setLocalQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [highlightedCol, setHighlightedCol] = useState<HighlightedCol>(null)
  const [labelHoveredIdx, setLabelHoveredIdx] = useState<number | null>(null)
  const pendingFocusRef = useRef<{ sunet: string; col: HighlightedCol; oldIdx: number } | null>(null)

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  const toggleInclude = (sunet: string) => {
    if (include.includes(sunet)) {
      navigate_({ instructorSunets: include.filter((v) => v !== sunet) })
    } else {
      navigate_({
        instructorSunets: [...include, sunet],
        instructorSunetsExclude: exclude.filter((v) => v !== sunet),
      })
    }
  }

  const toggleExclude = (sunet: string) => {
    if (exclude.includes(sunet)) {
      navigate_({ instructorSunetsExclude: exclude.filter((v) => v !== sunet) })
    } else {
      navigate_({
        instructorSunetsExclude: [...exclude, sunet],
        instructorSunets: include.filter((v) => v !== sunet),
      })
    }
  }

  const { filteredInstructors, selectedInstructors } = useMemo(() => {
    const q = localQuery.trim().toLowerCase()

    const instructorBySunet = new Map(instructors.map((inst) => [inst.sunet, inst]))
    const selected = [...include, ...exclude]
      .map((sunet) => instructorBySunet.get(sunet))
      .filter((inst): inst is NonNullable<typeof inst> => inst != null)

    if (!q) return { filteredInstructors: [], selectedInstructors: selected }

    const scoreInst = (inst: (typeof instructors)[number]) => {
      const name = inst.name.toLowerCase()
      const sunet = inst.sunet.toLowerCase()
      const words = name.split(' ')
      if (sunet === q || words.some((w) => w === q)) return 0
      if (sunet.startsWith(q)) return 1
      if (words.some((w) => w.startsWith(q))) return 2
      return 3
    }

    const filtered = instructors
      .filter((inst) => {
        if (includeSet.has(inst.sunet) || excludeSet.has(inst.sunet)) return false
        return inst.name.toLowerCase().includes(q) || inst.sunet.toLowerCase().includes(q)
      })
      .map((inst) => ({ inst, score: scoreInst(inst) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 15)
      .map(({ inst }) => inst)

    return { filteredInstructors: filtered, selectedInstructors: selected }
  }, [instructors, localQuery, includeSet, excludeSet])

  const flatList = useMemo(
    () => [...selectedInstructors, ...filteredInstructors],
    [selectedInstructors, filteredInstructors],
  )

  // After a toggle causes a re-render, the focused span moves in the DOM (its flat-idx changes).
  // Restore focus to the instructor that was just toggled so keyboard navigation continues.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    pendingFocusRef.current = null
    const newIdx = flatList.findIndex((inst) => inst.sunet === pending.sunet)
    if (newIdx >= 0) {
      setHighlightedIndex(newIdx)
      setHighlightedCol(pending.col)
      focusElement(newIdx, pending.col)
    } else if (flatList.length > 0) {
      // Row was removed — focus the item that was above it
      const targetIdx = Math.min(Math.max(0, pending.oldIdx - 1), flatList.length - 1)
      setHighlightedIndex(targetIdx)
      setHighlightedCol(pending.col)
      focusElement(targetIdx, pending.col)
    } else {
      setHighlightedIndex(-1)
      setHighlightedCol(null)
      inputRef.current?.focus()
    }
  }, [flatList]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateLocalQuery = (q: string) => {
    setLocalQuery(q)
    setHighlightedIndex(q.trim() ? selectedInstructors.length : -1)
    setHighlightedCol(null)
  }

  /** Move DOM focus to the element matching the given index + col */
  const focusElement = (idx: number, col: HighlightedCol) => {
    if (idx < 0) {
      inputRef.current?.focus()
      return
    }
    const colAttr = col ?? 'row'
    const selector = `[data-flat-idx="${idx}"][data-col="${colAttr}"]`
    containerRef.current?.querySelector<HTMLElement>(selector)?.focus()
  }

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = flatList.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = highlightedIndex >= n - 1 ? -1 : highlightedIndex + 1
      const newCol = newIdx < 0 ? null : highlightedCol
      setHighlightedIndex(newIdx)
      setHighlightedCol(newCol)
      focusElement(newIdx, newCol)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = highlightedIndex === -1 ? n - 1 : highlightedIndex - 1
      const newCol = newIdx < 0 ? null : highlightedCol
      setHighlightedIndex(newIdx)
      setHighlightedCol(newCol)
      focusElement(newIdx, newCol)
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
      const target: (typeof flatList)[number] | undefined = flatList[highlightedIndex]
      if (target == null) return

      pendingFocusRef.current = { sunet: target.sunet, col: highlightedCol, oldIdx: highlightedIndex }

      if (highlightedCol === 'include') {
        toggleInclude(target.sunet)
      } else if (highlightedCol === 'exclude') {
        toggleExclude(target.sunet)
      } else {
        // Row itself is focused — uncheck whichever is checked, or default to include
        const isIncluded = includeSet.has(target.sunet)
        const isExcluded = excludeSet.has(target.sunet)
        if (isIncluded) toggleInclude(target.sunet)
        else if (isExcluded) toggleExclude(target.sunet)
        else toggleInclude(target.sunet)
      }
    } else if (e.key === ' ' && highlightedIndex >= 0) {
      if (e.target === inputRef.current) return
      e.preventDefault()
      const target: (typeof flatList)[number] | undefined = flatList[highlightedIndex]
      if (target == null) return
      pendingFocusRef.current = { sunet: target.sunet, col: highlightedCol, oldIdx: highlightedIndex }
      if (highlightedCol === 'include') {
        toggleInclude(target.sunet)
      } else if (highlightedCol === 'exclude') {
        toggleExclude(target.sunet)
      } else {
        const isIncluded = includeSet.has(target.sunet)
        const isExcluded = excludeSet.has(target.sunet)
        if (isIncluded) toggleInclude(target.sunet)
        else if (isExcluded) toggleExclude(target.sunet)
        else toggleInclude(target.sunet)
      }
    } else if (e.key === 'Escape') {
      updateLocalQuery('')
      inputRef.current?.focus()
    }
  }

  const handleContainerFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement

    if (target === inputRef.current) {
      setHighlightedIndex(-1)
      setHighlightedCol(null)
      return
    }

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
    if (containerRef.current?.contains(e.relatedTarget as Node) !== true) {
      updateLocalQuery('')
      setHighlightedIndex(-1)
      setHighlightedCol(null)
    }
  }

  const toggleDefault = (sunet: string) => {
    const isIncluded = includeSet.has(sunet)
    const isExcluded = excludeSet.has(sunet)
    if (isIncluded) toggleInclude(sunet)
    else if (isExcluded) toggleExclude(sunet)
    else toggleInclude(sunet)
  }

  const renderRow = (sunet: string, name: string, flatIdx: number) => {
    const isIncluded = includeSet.has(sunet)
    const isExcluded = excludeSet.has(sunet)
    const isRowHighlighted = flatIdx === highlightedIndex
    const colHighlight = isRowHighlighted ? highlightedCol : null
    const isLabelHovered = labelHoveredIdx === flatIdx

    return (
      <div
        key={sunet}
        className={cn(
          'group/row col-span-3 grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors focus-within:bg-slate-100 focus-within:ring-1 focus-within:ring-slate-200 hover:bg-slate-50',
          isRowHighlighted && 'bg-slate-100 ring-1 ring-slate-200',
        )}
      >
        <span
          tabIndex={0}
          data-flat-idx={flatIdx}
          data-col="row"
          onClick={() => toggleDefault(sunet)}
          onMouseEnter={() => setLabelHoveredIdx(flatIdx)}
          onMouseLeave={() => setLabelHoveredIdx(null)}
          className="min-w-0 cursor-pointer truncate py-1 pl-1.5 text-sm text-slate-700 outline-none group-hover/row:[-webkit-text-stroke:0.2px_currentColor]"
        >
          {name} <span className="text-slate-400">({sunet})</span>
        </span>
        <div
          className={`group/include-col flex ${COL_W} cursor-pointer items-center justify-center py-1`}
          onClick={() => toggleInclude(sunet)}
        >
          <button
            type="button"
            data-flat-idx={flatIdx}
            data-col="include"
            onClick={(e) => {
              e.stopPropagation()
              toggleInclude(sunet)
            }}
            aria-label={`Include ${name}`}
            className={includeButtonClass(isIncluded, isExcluded, isLabelHovered, colHighlight)}
          >
            {isIncluded && <Check className="h-2.5 w-2.5" />}
          </button>
        </div>
        <div
          className={`group/exclude-col flex ${COL_W} cursor-pointer items-center justify-center py-1`}
          onClick={() => toggleExclude(sunet)}
        >
          <button
            type="button"
            data-flat-idx={flatIdx}
            data-col="exclude"
            onClick={(e) => {
              e.stopPropagation()
              toggleExclude(sunet)
            }}
            aria-label={`Exclude ${name}`}
            className={excludeButtonClass(isExcluded, isLabelHovered, colHighlight)}
          >
            {isExcluded && <X className="h-2.5 w-2.5" />}
          </button>
        </div>
      </div>
    )
  }

  const hasActive = include.length > 0 || exclude.length > 0

  return (
    <div
      ref={containerRef}
      onKeyDown={handleContainerKeyDown}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-y-[1.5px]">
        {/* Header row */}
        <div className="col-span-3 flex items-center justify-between py-0.5">
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-medium text-slate-500 uppercase">Instructor</span>
            <button
              type="button"
              onClick={() => navigate_({ instructorSunets: [], instructorSunetsExclude: [] })}
              aria-label="Clear Instructor filter"
              className={`rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none ${hasActive ? '' : 'hidden'}`}
            >
              <Eraser className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Search input + Or/And + Exclude columns */}
        <div className="py-1 pr-3.5 pl-1">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={localQuery}
              onChange={(e) => updateLocalQuery(e.target.value)}
              placeholder="Search"
              className="h-7 w-full rounded border border-slate-200 bg-slate-50 py-0 pr-6 pl-6 text-xs text-slate-700 placeholder-slate-400 transition focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-slate-200 focus:outline-none"
            />
          </div>
        </div>
        <div className={`flex ${COL_W} items-center justify-center py-1`}>
          <div className="flex items-center gap-0.25 rounded border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => navigate_({ instructorSunetsIncludeMode: 'or' })}
              className={`w-6 rounded py-0.5 text-center text-[10px] font-medium transition ${
                includeMode === 'or'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Or
            </button>
            <button
              type="button"
              onClick={() => navigate_({ instructorSunetsIncludeMode: 'and' })}
              className={`w-6 rounded py-0.5 text-center text-[10px] font-medium transition ${
                includeMode === 'and'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              And
            </button>
          </div>
        </div>
        <div className={`flex ${COL_W} items-center justify-center py-1`}>
          <span className="text-[10px] font-medium text-slate-400">Exclude</span>
        </div>

        {[...selectedInstructors, ...filteredInstructors].map((inst, idx) => {
          const showDivider =
            idx === selectedInstructors.length &&
            selectedInstructors.length > 0 &&
            filteredInstructors.length > 0
          return (
            <Fragment key={inst.sunet}>
              {showDivider && <div className="col-span-3 mb-0.5 border-t border-slate-200" />}
              {renderRow(inst.sunet, inst.name, idx)}
            </Fragment>
          )
        })}

        {/* No results */}
        {localQuery.trim() !== '' && filteredInstructors.length === 0 && (
          <p className="col-span-3 py-2 text-center text-xs text-slate-400">No instructors found</p>
        )}

        {/* Prompt to search */}
        {localQuery.trim() === '' && selectedInstructors.length === 0 && (
          <p className="col-span-3 py-1.5 pl-1.5 text-xs text-slate-400">Search to add instructors</p>
        )}
      </div>
    </div>
  )
}
