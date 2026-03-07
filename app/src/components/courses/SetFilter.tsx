import { useRef, useCallback, useState } from 'react'
import { Check, Eraser, X } from 'lucide-react'
import type { IncludeMode } from '@/data/search/search.params'
import { cn } from '@/lib/utils'

interface SetFilterItem {
  value: string
  label: string
}

interface SetFilterProps {
  label: string
  items: SetFilterItem[]
  include: string[]
  exclude: string[]
  includeMode?: IncludeMode
  onIncludeChange: (include: string[]) => void
  onExcludeChange: (exclude: string[]) => void
  onIncludeModeChange?: (mode: IncludeMode) => void
  onClear?: () => void
}

const COLS = ['row', 'include', 'exclude'] as const

function modeButtonClass(active: boolean) {
  return cn(
    'w-6 rounded py-0.5 text-center text-[10px] font-medium transition',
    active ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600',
  )
}

function includeButtonClass(isIncluded: boolean, isExcluded: boolean, isLabelHovered: boolean) {
  return cn(
    "relative flex h-4.5 w-4.5 items-center justify-center rounded border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
    // active vs inactive base
    isIncluded
      ? 'border-emerald-500 bg-emerald-500 text-white'
      : 'border-slate-300 bg-white hover:border-emerald-400',
    // label-hover preview ring (and border when not yet active)
    !isExcluded && isLabelHovered && 'ring-2 ring-emerald-300 ring-offset-1',
    !isExcluded && isLabelHovered && !isIncluded && 'border-emerald-400',
    // group-hover ring (always shown; border change only when not already active)
    'group-hover/include-col:ring-2 group-hover/include-col:ring-emerald-300 group-hover/include-col:ring-offset-1',
    !isIncluded && 'group-hover/include-col:border-emerald-400',
    // focus
    'focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1',
  )
}

function excludeButtonClass(isExcluded: boolean, isLabelHovered: boolean) {
  return cn(
    "relative flex h-4.5 w-4.5 items-center justify-center rounded border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
    // active vs inactive base
    isExcluded ? 'border-rose-400 bg-rose-400 text-white' : 'border-slate-300 bg-white hover:border-rose-300',
    // group-hover ring (different colors for active vs inactive)
    isExcluded
      ? 'group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-300 group-hover/exclude-col:ring-offset-1'
      : 'group-hover/exclude-col:border-rose-300 group-hover/exclude-col:ring-2 group-hover/exclude-col:ring-rose-200 group-hover/exclude-col:ring-offset-1',
    // label-hover ring (only when active)
    isLabelHovered && isExcluded && 'ring-2 ring-rose-300 ring-offset-1',
    // focus
    'focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1',
  )
}

export function SetFilter({
  label,
  items,
  include,
  exclude,
  includeMode,
  onIncludeChange,
  onExcludeChange,
  onIncludeModeChange,
  onClear,
}: SetFilterProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [labelHoveredIdx, setLabelHoveredIdx] = useState<number | null>(null)

  const toggleInclude = useCallback(
    (value: string) => {
      if (include.includes(value)) {
        onIncludeChange(include.filter((v) => v !== value))
      } else {
        onIncludeChange([...include, value])
        onExcludeChange(exclude.filter((v) => v !== value))
      }
    },
    [include, exclude, onIncludeChange, onExcludeChange],
  )

  const toggleExclude = useCallback(
    (value: string) => {
      if (exclude.includes(value)) {
        onExcludeChange(exclude.filter((v) => v !== value))
      } else {
        onExcludeChange([...exclude, value])
        onIncludeChange(include.filter((v) => v !== value))
      }
    },
    [include, exclude, onIncludeChange, onExcludeChange],
  )

  const toggleDefault = useCallback(
    (value: string) => {
      const isIncluded = include.includes(value)
      const isExcluded = exclude.includes(value)
      if (isIncluded) toggleInclude(value)
      else if (isExcluded) toggleExclude(value)
      else toggleInclude(value)
    },
    [include, exclude, toggleInclude, toggleExclude],
  )

  const focusCell = (idx: number, col: string) => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-flat-idx="${idx}"][data-col="${col}"]`)
    el?.focus()
  }

  const handleRowKeyDown = (e: React.KeyboardEvent, value: string, flatIdx: number) => {
    const target = e.target as HTMLElement
    const col = target.getAttribute('data-col') ?? 'row'
    const colIdx = COLS.indexOf(col as (typeof COLS)[number])

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextCol = COLS[(colIdx + 1) % COLS.length]
      focusCell(flatIdx, nextCol)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const nextCol = COLS[(colIdx - 1 + COLS.length) % COLS.length]
      focusCell(flatIdx, nextCol)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (flatIdx < items.length - 1) focusCell(flatIdx + 1, col)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (flatIdx > 0) focusCell(flatIdx - 1, col)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (col === 'include') toggleInclude(value)
      else if (col === 'exclude') toggleExclude(value)
      else toggleDefault(value)
    } else if (e.key === ' ') {
      e.preventDefault()
      if (col === 'include') toggleInclude(value)
      else if (col === 'exclude') toggleExclude(value)
      else toggleDefault(value)
    }
  }

  return (
    <div ref={gridRef} className="grid grid-cols-[1fr_auto_auto] items-center gap-y-[1.5px]">
      {/* Header row */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">{label}</span>
        {(include.length > 0 || exclude.length > 0) && onClear && (
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
      <div className="flex w-12 items-center justify-center">
        {includeMode !== undefined ? (
          <div className="flex items-center gap-0.25 rounded border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => onIncludeModeChange?.('or')}
              className={modeButtonClass(includeMode === 'or')}
            >
              Or
            </button>
            <button
              type="button"
              onClick={() => onIncludeModeChange?.('and')}
              className={modeButtonClass(includeMode === 'and')}
            >
              And
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-medium text-slate-400">Include</span>
        )}
      </div>
      <div className="flex w-12 justify-center">
        <span className="text-[10px] font-medium text-slate-400">Exclude</span>
      </div>

      {/* Item rows */}
      {items.map((item, idx) => {
        const isIncluded = include.includes(item.value)
        const isExcluded = exclude.includes(item.value)
        const isLabelHovered = labelHoveredIdx === idx

        return (
          <div
            key={item.value}
            className="group/row col-span-3 grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors focus-within:bg-slate-100 focus-within:ring-1 focus-within:ring-slate-200 hover:bg-slate-50"
          >
            <span
              tabIndex={0}
              data-flat-idx={idx}
              data-col="row"
              onClick={() => toggleDefault(item.value)}
              onKeyDown={(e) => handleRowKeyDown(e, item.value, idx)}
              onMouseEnter={() => setLabelHoveredIdx(idx)}
              onMouseLeave={() => setLabelHoveredIdx(null)}
              className="min-w-0 cursor-pointer truncate py-1 pl-1 text-sm text-slate-700 outline-none group-hover/row:[-webkit-text-stroke:0.2px_currentColor]"
            >
              {item.label}
            </span>
            <div
              className="group/include-col flex w-12 cursor-pointer items-center justify-center py-1"
              onClick={() => toggleInclude(item.value)}
            >
              <button
                type="button"
                data-flat-idx={idx}
                data-col="include"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleInclude(item.value)
                }}
                onKeyDown={(e) => handleRowKeyDown(e, item.value, idx)}
                aria-label={`Include ${item.label}`}
                className={includeButtonClass(isIncluded, isExcluded, isLabelHovered)}
              >
                {isIncluded && <Check className="h-2.5 w-2.5" />}
              </button>
            </div>
            <div
              className="group/exclude-col flex w-12 cursor-pointer items-center justify-center py-1"
              onClick={() => toggleExclude(item.value)}
            >
              <button
                type="button"
                data-flat-idx={idx}
                data-col="exclude"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExclude(item.value)
                }}
                onKeyDown={(e) => handleRowKeyDown(e, item.value, idx)}
                aria-label={`Exclude ${item.label}`}
                className={excludeButtonClass(isExcluded, isLabelHovered)}
              >
                {isExcluded && <X className="h-2.5 w-2.5" />}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
