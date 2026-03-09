import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Search, CheckSquare } from 'lucide-react'
import { DEFAULT_YEAR, SearchParams, MAX_QUERY_LENGTH, ALL_QUARTERS } from '@/data/search/search.params'
import { generateCandidate, getPrevalidatedSuggestions, type Suggestion } from '@/lib/suggestions'
import { searchQueryOptions } from '@/components/courses/courses-query-options'

const PLACEHOLDER_EXAMPLES = [
  'classes with field trips',
  'robotics in biology',
  'poetry workshop',
  'machine learning',
  'psychology of decision making',
  'climate and society',
  'creative writing workshop',
  'entrepreneurship',
  'music history',
  'game design',
  'sleep science',
  'urban planning',
]
const PLACEHOLDER_ROTATE_MS = 3000
const PLACEHOLDER_FADE_MS = 400

type FilterChip = { kind: 'check'; label: string } | { kind: 'sort'; label: string }

function getSuggestionChips(params: SearchParams): FilterChip[] {
  const chips: FilterChip[] = []

  if (params.subjects != null && params.subjects.length > 0) {
    chips.push({ kind: 'check', label: params.subjects.join(', ') })
  }
  if (params.gers != null && params.gers.length > 0) {
    chips.push({ kind: 'check', label: params.gers.join(', ') })
  }
  if (params.unitsMin != null && params.unitsMax != null) {
    chips.push({ kind: 'check', label: `${params.unitsMin}–${params.unitsMax} units` })
  } else if (params.unitsMin != null) {
    chips.push({ kind: 'check', label: `≥${params.unitsMin} units` })
  } else if (params.unitsMax != null) {
    chips.push({ kind: 'check', label: `≤${params.unitsMax} units` })
  }
  if (params.finalExamFlags != null && params.finalExamFlags.includes('N')) {
    chips.push({ kind: 'check', label: 'No final' })
  }

  const SORT_LABELS: Partial<Record<string, string>> = {
    quality: 'Rating',
    hours: 'Time commitment',
    relevance: 'Relevance',
  }
  if (params.sort && params.sort !== 'relevance') {
    const sortLabel = SORT_LABELS[params.sort] ?? params.sort
    const dir = params.order === 'asc' ? '↑' : '↓'
    chips.push({ kind: 'sort', label: `Sort: ${sortLabel} ${dir}` })
  }

  return chips
}

export const Route = createFileRoute('/')({ component: App })

const ROTATE_INTERVAL_MS = 4000
const FIRST_ROTATE_MS = 1500
const SCROLL_DURATION_MS = 400
const MAX_VALIDATION_ATTEMPTS = 8
const PREFETCH_AHEAD = 3

function App() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')

  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderVisible(false)
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length)
        setPlaceholderVisible(true)
      }, PLACEHOLDER_FADE_MS)
    }, PLACEHOLDER_ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  const prevalidated = useRef<Suggestion[]>(null)
  if (prevalidated.current === null) {
    const list = getPrevalidatedSuggestions()
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j]!, list[i]!]
    }
    prevalidated.current = list
  }
  // Queue of pre-validated suggestions ready to display
  const queueRef = useRef<Suggestion[]>(prevalidated.current.slice(1))
  const fetchingRef = useRef(false)

  // Current and next suggestion for the scroll animation
  const [current, setCurrent] = useState<Suggestion | null>(prevalidated.current[0] ?? null)
  const [next, setNext] = useState<Suggestion | null>(null)
  // 'idle' → 'ready' (next mounted at start pos) → 'scrolling' (animate)
  const [phase, setPhase] = useState<'idle' | 'ready' | 'scrolling'>('idle')

  const validateOne = useRef(async (): Promise<Suggestion | null> => {
    for (let i = 0; i < MAX_VALIDATION_ATTEMPTS; i++) {
      const candidate = generateCandidate()
      const params: SearchParams = { ...candidate.searchParams, year: DEFAULT_YEAR, page: 1 }
      try {
        const result = await queryClient.fetchQuery({
          ...searchQueryOptions(params),
          staleTime: 1000 * 60 * 60,
        })
        if (result.totalCount > 0) return candidate
      } catch {
        // treat as 0 results
      }
    }
    return null
  })

  // Keep the queue topped up with newly validated suggestions
  const fillQueue = useRef(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    while (queueRef.current.length < PREFETCH_AHEAD) {
      const s = await validateOne.current()
      if (s) queueRef.current.push(s)
    }
    fetchingRef.current = false
  })

  const dequeue = useRef((): Suggestion | null => {
    const s = queueRef.current.shift() ?? null
    void fillQueue.current()
    return s
  })

  // Start filling the queue with generated suggestions in the background
  useEffect(() => {
    void fillQueue.current()
  }, [])

  // When next is mounted in 'ready', kick off the animation on next frame
  useEffect(() => {
    if (phase !== 'ready' || !next) return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPhase('scrolling')
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [phase, next])

  // When scrolling finishes, promote next → current
  useEffect(() => {
    if (phase !== 'scrolling') return
    const timeout = setTimeout(() => {
      setCurrent(next)
      setNext(null)
      setPhase('idle')
    }, SCROLL_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [phase, next])

  // Rotation: first change is faster, then normal cadence
  const hasRotatedOnce = useRef(false)
  useEffect(() => {
    const rotate = () => {
      const incoming = dequeue.current()
      if (!incoming || phase !== 'idle') return
      setNext(incoming)
      setPhase('ready')
    }

    const delay = hasRotatedOnce.current ? ROTATE_INTERVAL_MS : FIRST_ROTATE_MS
    const id = setTimeout(() => {
      rotate()
      hasRotatedOnce.current = true
    }, delay)
    return () => clearTimeout(id)
  }, [phase])

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      void navigate({
        to: '/courses',
        search: { query: query.trim(), quarters: ALL_QUARTERS, page: 1 } as Required<SearchParams>,
      })
    }
  }

  const handleSuggestionClick = (suggestion: Suggestion) => {
    void navigate({
      to: '/courses',
      search: { ...suggestion.searchParams, page: 1 } as Required<SearchParams>,
    })
  }

  const anim = `transform ${SCROLL_DURATION_MS}ms ease-in-out, opacity ${SCROLL_DURATION_MS}ms ease-in-out`

  const labelStyle = (slot: 'current' | 'next'): React.CSSProperties => {
    if (slot === 'current') {
      return {
        transition: phase === 'scrolling' ? anim : 'none',
        transform: phase === 'scrolling' ? 'translateY(-28px)' : 'translateY(0)',
        opacity: phase === 'scrolling' ? 0 : 1,
      }
    }
    // 'ready': mount at start position without transition; 'scrolling': animate up
    return {
      transition: phase === 'scrolling' ? anim : 'none',
      transform: phase === 'scrolling' ? 'translateY(0)' : 'translateY(28px)',
      opacity: phase === 'scrolling' ? 1 : 0,
    }
  }

  const chipsFade = `opacity ${SCROLL_DURATION_MS}ms ease-in-out`

  const chipsStyle = (slot: 'current' | 'next'): React.CSSProperties => {
    if (slot === 'current') {
      return {
        transition: phase === 'scrolling' ? chipsFade : 'none',
        opacity: phase === 'scrolling' ? 0 : 1,
      }
    }
    return {
      transition: phase === 'scrolling' ? chipsFade : 'none',
      opacity: phase === 'scrolling' ? 1 : 0,
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <main className="relative h-full">
        <div className="absolute top-[calc(50%-2rem)] left-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 px-6">
          <form onSubmit={handleSearch}>
            <label htmlFor="course-search" className="sr-only">
              Search courses
            </label>
            <div className="relative">
              <input
                id="course-search"
                type="text"
                value={query}
                maxLength={MAX_QUERY_LENGTH}
                onChange={(e) => setQuery(e.target.value)}
                placeholder=""
                className="w-full rounded-full border border-slate-300 bg-white py-5 pr-28 pl-6 text-lg text-slate-900 shadow-[0_14px_28px_color-mix(in_srgb,var(--primary)_25%,transparent)] focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
              {query.length === 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 truncate pr-32 text-lg text-slate-400 select-none"
                  style={{
                    opacity: placeholderVisible ? 1 : 0,
                    transition: `opacity ${PLACEHOLDER_FADE_MS}ms ease-in-out`,
                  }}
                >
                  {PLACEHOLDER_EXAMPLES[placeholderIdx]}
                </span>
              )}
              <button
                type="submit"
                aria-label="Search"
                disabled={!query.trim()}
                className="absolute top-1/2 right-2 flex h-12 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-5 text-base font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
              >
                Search
              </button>
            </div>
          </form>

          {/* Filtered suggestions */}
          <div className="mt-12 flex flex-col items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
              Try filtered suggestions
            </p>

            {/* Animated suggestion label */}
            <div className="relative h-7 w-[52ch] overflow-hidden text-[1.2rem]">
              {current && (
                <button
                  type="button"
                  onClick={() => handleSuggestionClick(current)}
                  style={labelStyle('current')}
                  className="absolute inset-0 flex w-full items-center justify-center gap-2 font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {current.label}
                  <Search className="size-[1em] shrink-0" aria-hidden />
                </button>
              )}
              {next && (
                <button
                  type="button"
                  onClick={() => handleSuggestionClick(next)}
                  style={labelStyle('next')}
                  className="absolute inset-0 flex w-full items-center justify-center gap-2 font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {next.label}
                  <Search className="size-[1em] shrink-0" aria-hidden />
                </button>
              )}
            </div>

            {/* Filter chips — current fades out, next fades in */}
            <div className="relative h-6 w-full">
              {current && (
                <div
                  style={chipsStyle('current')}
                  className="absolute inset-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-slate-500"
                >
                  {getSuggestionChips(current.searchParams).map((chip, i) =>
                    chip.kind === 'check' ? (
                      <span key={i} className="flex items-center gap-1">
                        <CheckSquare className="size-3.5 text-primary/70" aria-hidden />
                        {chip.label}
                      </span>
                    ) : (
                      <span key={i}>
                        <span className="text-primary/70">Sort:</span>
                        {chip.label.slice('Sort:'.length)}
                      </span>
                    ),
                  )}
                </div>
              )}
              {next && (
                <div
                  style={chipsStyle('next')}
                  className="absolute inset-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-slate-500"
                >
                  {getSuggestionChips(next.searchParams).map((chip, i) =>
                    chip.kind === 'check' ? (
                      <span key={i} className="flex items-center gap-1">
                        <CheckSquare className="size-3.5 text-primary/70" aria-hidden />
                        {chip.label}
                      </span>
                    ) : (
                      <span key={i}>
                        <span className="text-primary/70">Sort:</span>
                        {chip.label.slice('Sort:'.length)}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="absolute top-[calc(50%-2rem)] left-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-[calc(100%+8rem)] px-6 text-center">
          <h1 className="text-4xl font-normal text-slate-900 sm:text-5xl">Master Your Schedule.</h1>
          <p className="mt-2 text-sm [text-wrap:balance] text-slate-500">
            Build your perfect course plan with our new AI-powered Semantic Search and enhanced Filtering and
            Sorting
          </p>
        </div>
      </main>
    </div>
  )
}
