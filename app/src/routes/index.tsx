import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDebouncer } from '@tanstack/react-pacer'
import { Search, CheckSquare } from 'lucide-react'
import { DEFAULT_YEAR, SearchParams, MAX_QUERY_LENGTH, ALL_QUARTERS } from '@/data/search/search.params'
import { generateCandidate, getPrevalidatedSuggestions, type Suggestion } from '@/lib/suggestions'
import { searchQueryOptions } from '@/components/courses/courses-query-options'

const PLACEHOLDER_EXAMPLES = [
  'robotics in biology',
  'scary poetry',
  'machine learning',
  'psychology of decision making',
  'global cuisines',
  'urban music',
  'climate entrepreneurship',
  'history of capitalism',
  'game development',
  'science of sleep',
  'urban planning',
]

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
const FILTERED_OFFSET_MS = ROTATE_INTERVAL_MS / 2
const SCROLL_DURATION_MS = 400
const MAX_VALIDATION_ATTEMPTS = 8
const PREFETCH_AHEAD = 3

const normalizeQuery = (v: string) => v.trim().replace(/\./g, '')

function App() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')

  const [semanticIdx, setSemanticIdx] = useState(0)
  const [semanticNextIdx, setSemanticNextIdx] = useState<number | null>(null)
  const [semanticPhase, setSemanticPhase] = useState<'idle' | 'ready' | 'scrolling'>('idle')
  const semanticIdxRef = useRef(0)
  semanticIdxRef.current = semanticIdx

  // Semantic suggestions: rotate at t=0, then every ROTATE_INTERVAL_MS (scroll animation)
  useEffect(() => {
    const rotate = () => {
      if (semanticPhase !== 'idle') return
      const next = (semanticIdxRef.current + 1) % PLACEHOLDER_EXAMPLES.length
      setSemanticNextIdx(next)
      setSemanticPhase('ready')
    }
    const id = setInterval(rotate, ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [semanticPhase])

  // When semantic next is mounted in 'ready', kick off the animation
  useEffect(() => {
    if (semanticPhase !== 'ready' || semanticNextIdx === null) return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSemanticPhase('scrolling'))
    })
    return () => cancelAnimationFrame(raf)
  }, [semanticPhase, semanticNextIdx])

  // When semantic scrolling finishes, promote next → current
  useEffect(() => {
    if (semanticPhase !== 'scrolling' || semanticNextIdx === null) return
    const timeout = setTimeout(() => {
      setSemanticIdx(semanticNextIdx)
      setSemanticNextIdx(null)
      setSemanticPhase('idle')
    }, SCROLL_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [semanticPhase, semanticNextIdx])

  const prefetchDebouncer = useDebouncer(
    (normalized: string) => {
      void queryClient.prefetchQuery(
        searchQueryOptions({
          query: normalized,
          quarters: ALL_QUARTERS,
          year: DEFAULT_YEAR,
          page: 1,
        } as SearchParams),
      )
    },
    { wait: 325 },
  )

  // Prefetch empty search on mount; then debounce as user types
  useEffect(() => {
    void queryClient.prefetchQuery(
      searchQueryOptions({
        query: '',
        quarters: ALL_QUARTERS,
        year: DEFAULT_YEAR,
        page: 1,
      } as SearchParams),
    )
  }, [queryClient])

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
  const abortedRef = useRef(false)

  // Current and next suggestion for the scroll animation
  const [current, setCurrent] = useState<Suggestion | null>(prevalidated.current[0] ?? null)
  const [next, setNext] = useState<Suggestion | null>(null)
  // 'idle' → 'ready' (next mounted at start pos) → 'scrolling' (animate)
  const [phase, setPhase] = useState<'idle' | 'ready' | 'scrolling'>('idle')

  const validateOne = useRef(async (): Promise<Suggestion | null> => {
    for (let i = 0; i < MAX_VALIDATION_ATTEMPTS; i++) {
      if (abortedRef.current) return null
      const candidate = generateCandidate()
      const params: SearchParams = { ...candidate.searchParams, year: DEFAULT_YEAR, page: 1 }
      try {
        const result = await queryClient.fetchQuery({
          ...searchQueryOptions(params),
          staleTime: 1000 * 60 * 60,
        })
        if (abortedRef.current) return null
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
    while (queueRef.current.length < PREFETCH_AHEAD && !abortedRef.current) {
      const s = await validateOne.current()
      if (abortedRef.current) break
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
    abortedRef.current = false
    void validateOne.current().then((s) => {
      if (abortedRef.current) return
      if (s) setCurrent(s)
      void fillQueue.current()
    })
    return () => {
      abortedRef.current = true
    }
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

  // Filtered suggestions: offset by half interval, then rotate every ROTATE_INTERVAL_MS
  const hasRotatedOnce = useRef(false)
  useEffect(() => {
    const rotate = () => {
      if (abortedRef.current) return
      const incoming = dequeue.current()
      if (!incoming || phase !== 'idle') return
      setNext(incoming)
      setPhase('ready')
    }

    const delay = hasRotatedOnce.current ? ROTATE_INTERVAL_MS : FILTERED_OFFSET_MS
    const id = setTimeout(() => {
      rotate()
      hasRotatedOnce.current = true
    }, delay)
    return () => clearTimeout(id)
  }, [phase])

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    abortedRef.current = true
    prefetchDebouncer.cancel()
    void queryClient.cancelQueries({ queryKey: ['search'] })
    void navigate({
      to: '/courses',
      search: {
        query: normalizeQuery(query),
        quarters: ALL_QUARTERS,
        page: 1,
      } as Required<SearchParams>,
    })
  }

  const handleSuggestionClick = (suggestion: Suggestion) => {
    abortedRef.current = true
    void queryClient.cancelQueries({ queryKey: ['search'] })
    void navigate({
      to: '/courses',
      search: { ...suggestion.searchParams, page: 1 } as Required<SearchParams>,
    })
  }

  const handleSemanticClick = (example: string) => {
    abortedRef.current = true
    prefetchDebouncer.cancel()
    void queryClient.cancelQueries({ queryKey: ['search'] })
    void navigate({
      to: '/courses',
      search: {
        query: normalizeQuery(example),
        quarters: ALL_QUARTERS,
        page: 1,
      } as Required<SearchParams>,
    })
  }

  const anim = `transform ${SCROLL_DURATION_MS}ms ease-in-out, opacity ${SCROLL_DURATION_MS}ms ease-in-out`

  const makeLabelStyle =
    (animPhase: 'idle' | 'ready' | 'scrolling') =>
    (slot: 'current' | 'next'): React.CSSProperties => {
      const slide = '3.5rem' // matches min-h-14
      if (slot === 'current') {
        return {
          transition: animPhase === 'scrolling' ? anim : 'none',
          transform: animPhase === 'scrolling' ? `translateY(-${slide})` : 'translateY(0)',
          opacity: animPhase === 'scrolling' ? 0 : 1,
        }
      }
      return {
        transition: animPhase === 'scrolling' ? anim : 'none',
        transform: animPhase === 'scrolling' ? 'translateY(0)' : `translateY(${slide})`,
        opacity: animPhase === 'scrolling' ? 1 : 0,
      }
    }
  const labelStyle = makeLabelStyle(phase)
  const semanticLabelStyle = makeLabelStyle(semanticPhase)

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
        <div className="absolute top-[calc(50%-2rem)] left-1/2 w-full -translate-x-1/2 -translate-y-1/2 px-6">
          <form onSubmit={handleSearch} className="mx-auto max-w-2xl">
            <label htmlFor="course-search" className="sr-only">
              Search courses
            </label>
            <div className="relative">
              <input
                id="course-search"
                type="text"
                value={query}
                maxLength={MAX_QUERY_LENGTH}
                onChange={(e) => {
                  const v = e.target.value
                  setQuery(v)
                  const normalized = normalizeQuery(v)
                  prefetchDebouncer.maybeExecute(normalized)
                }}
                placeholder="Search courses"
                className="w-full rounded-full border border-slate-300 bg-white py-5 pr-28 pl-6 text-lg text-slate-900 shadow-[0_14px_28px_color-mix(in_srgb,var(--primary)_25%,transparent)] focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute top-1/2 right-2 flex h-12 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-5 text-base font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
              >
                Search
              </button>
            </div>
          </form>

          {/* Side-by-side: semantic (left) and filtered (right) */}
          <div className="mx-auto mt-12 grid w-full max-w-3xl grid-cols-[1fr_1fr] items-start gap-1">
            {/* Left: Semantic search suggestions */}
            <div className="flex min-w-0 flex-col items-center gap-2">
              <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                Try semantic search
              </p>
              <div className="relative min-h-14 w-full overflow-hidden text-[1.2rem]">
                <button
                  type="button"
                  onClick={() => handleSemanticClick(PLACEHOLDER_EXAMPLES[semanticIdx])}
                  style={semanticLabelStyle('current')}
                  className="absolute inset-0 flex w-full items-center justify-center gap-2 text-center font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {PLACEHOLDER_EXAMPLES[semanticIdx]}
                  <Search className="size-[1em] shrink-0" aria-hidden />
                </button>
                {semanticNextIdx !== null && (
                  <button
                    type="button"
                    onClick={() => handleSemanticClick(PLACEHOLDER_EXAMPLES[semanticNextIdx!])}
                    style={semanticLabelStyle('next')}
                    className="absolute inset-0 flex w-full items-center justify-center gap-2 text-center font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {PLACEHOLDER_EXAMPLES[semanticNextIdx!]}
                    <Search className="size-[1em] shrink-0" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Filtered suggestions */}
            <div className="flex min-w-0 flex-col items-center gap-2">
              <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                Try filtered suggestions
              </p>

              {/* Animated suggestion label */}
              <div className="relative min-h-14 w-full overflow-hidden text-[1.2rem]">
                {current && (
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(current)}
                    style={labelStyle('current')}
                    className="absolute inset-0 flex w-full items-center justify-center gap-2 text-center font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
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
                    className="absolute inset-0 flex w-full items-center justify-center gap-2 text-center font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
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
