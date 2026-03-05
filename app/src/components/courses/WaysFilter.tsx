import { Route } from '@/routes/courses'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { availableGersQueryOptions, searchQueryOptions } from './courses-query-options'
import { usePrefetchOnHover } from './usePrefetchOnHover'

import type { SearchParams } from '@/data/search/search.params'

function GersCheckbox({
  ger,
  checked,
  onToggle,
  search,
}: {
  ger: string
  checked: boolean
  onToggle: () => void
  search: SearchParams
}) {
  const nextGers = checked ? search.gers?.filter((w) => w !== ger) : [...(search.gers ?? []), ger]
  const hoverProps = usePrefetchOnHover(() => searchQueryOptions({ ...search, gers: nextGers, page: 1 }))

  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
      {...hoverProps}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4.5 w-4.5 rounded border-slate-300 text-primary focus:ring-primary/30"
      />
      {ger}
    </label>
  )
}

export function GersFilter() {
  const [open, setOpen] = useState(false)
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: gerCodes = [] } = useQuery(availableGersQueryOptions)

  const toggle = (ger: string) => {
    const next = search.gers.includes(ger) ? search.gers.filter((w) => w !== ger) : [...search.gers, ger]
    void navigate({
      search: (prev) => ({ ...prev, gers: next, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded text-xs font-medium tracking-wide text-slate-500 uppercase transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Gers
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-0.5">
          {gerCodes.map((ger) => (
            <GersCheckbox
              key={ger}
              ger={ger}
              checked={search.gers.includes(ger)}
              onToggle={() => toggle(ger)}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  )
}
