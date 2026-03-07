import type { RangeMode } from '@/data/search/search.params'

interface RangeModeToggleProps {
  value: RangeMode
  onChange: (mode: RangeMode) => void
}

export function RangeModeToggle({ value, onChange }: RangeModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 self-start rounded border border-slate-200 bg-slate-50 p-0.5">
      <button
        type="button"
        onClick={() => onChange('overlaps_with')}
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
          value === 'overlaps_with'
            ? 'bg-white text-slate-700 shadow-sm'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        Overlaps
      </button>
      <button
        type="button"
        onClick={() => onChange('contained_in')}
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
          value === 'contained_in'
            ? 'bg-white text-slate-700 shadow-sm'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        Within
      </button>
    </div>
  )
}
