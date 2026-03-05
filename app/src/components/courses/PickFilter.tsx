import { useRef } from 'react'
import { Check, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'

type PickFilterProps<T extends string> = {
  label: string
  options: { label: string; value: T }[]
  onClear?: () => void
} & (
  | { mode: 'single'; value: T | undefined; onChange: (v: T | undefined) => void }
  | { mode: 'multi'; value: T[]; onChange: (v: T[]) => void }
)

function toggleButtonClass(selected: boolean, mode: 'single' | 'multi') {
  return cn(
    "relative flex h-4.5 w-4.5 items-center justify-center border transition outline-none before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
    mode === 'single' ? 'rounded-full' : 'rounded',
    // active vs inactive base
    selected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white',
    // row hover (fires on label OR button col) — no React state needed
    'group-hover/row:ring-2 group-hover/row:ring-emerald-300 group-hover/row:ring-offset-1',
    !selected && 'group-hover/row:border-emerald-400',
    // focus
    'focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1',
  )
}

export function PickFilter<T extends string>({
  label,
  options,
  onClear,
  mode,
  value,
  onChange,
}: PickFilterProps<T>) {
  const gridRef = useRef<HTMLDivElement>(null)

  const isSelected = (v: T) => (mode === 'single' ? value === v : (value as T[]).includes(v))

  const toggle = (v: T) => {
    if (mode === 'single') {
      ;(onChange as (v: T | undefined) => void)(value === v ? undefined : v)
    } else {
      const arr = value as T[]
      ;(onChange as (v: T[]) => void)(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
    }
  }

  const hasActive = mode === 'single' ? value !== undefined : (value as T[]).length > 0

  const focusRow = (idx: number) => {
    gridRef.current?.querySelector<HTMLElement>(`[data-pick-idx="${idx}"]`)?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent, v: T, idx: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < options.length - 1) focusRow(idx + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) focusRow(idx - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(v)
    }
  }

  return (
    <div ref={gridRef} className="grid grid-cols-[1fr_auto] items-center gap-y-[1.5px]">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">{label}</span>
        {hasActive && onClear && (
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
      <div className="w-16" />

      {options.map((opt, idx) => {
        const selected = isSelected(opt.value)
        return (
          <div
            key={opt.value}
            className="group/row col-span-2 grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors focus-within:bg-slate-100 focus-within:ring-1 focus-within:ring-slate-200 hover:bg-slate-50"
          >
            <span
              tabIndex={0}
              data-pick-idx={idx}
              onClick={() => toggle(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, opt.value, idx)}
              className="min-w-0 cursor-pointer truncate py-1 pl-1 text-sm text-slate-700 outline-none group-hover/row:[-webkit-text-stroke:0.2px_currentColor]"
            >
              {opt.label}
            </span>
            <div
              className="group/toggle-col flex w-16 cursor-pointer items-center justify-center py-1"
              onClick={() => toggle(opt.value)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(opt.value)
                }}
                onKeyDown={(e) => handleKeyDown(e, opt.value, idx)}
                aria-label={opt.label}
                className={toggleButtonClass(selected, mode)}
              >
                {selected && <Check className="h-2.5 w-2.5" />}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
