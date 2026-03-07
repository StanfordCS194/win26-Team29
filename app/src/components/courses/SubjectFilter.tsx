import { Fragment, useEffect, useRef, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Eraser, Search, X } from 'lucide-react'
import { Route } from '@/routes/courses'
import { availableSubjectsQueryOptions } from './courses-query-options'
import type { SearchParams } from '@/data/search/search.params'
import { cn } from '@/lib/utils'

const COL_W = 'w-12'

const SCHOOL_SHORT: Record<string, string> = {
  'Department of Athletics, Physical Education and Recreation': 'Athletics',
  'Doerr School of Sustainability': 'Sustainability',
  'Graduate School of Business': 'Business',
  'School of Education': 'Education',
  'School of Engineering': 'Engineering',
  'School of Humanities & Sciences': 'Humanities & Sciences',
  'Law School': 'Law',
  'School of Medicine': 'Medicine',
  'Office of Vice Provost for Undergraduate Education': 'VPUE',
  'Office of Vice Provost for Teaching and Learning': 'Teaching & Learning',
}

const MANUAL_HS_CATEGORIES: Record<string, string[]> = {
  'Analytical Sciences': ['DATASCI', 'ECON', 'MATH', 'MCS', 'STATS', 'SYMSYS'],
  'Natural Sciences': ['APPPHYS', 'BIO', 'BIOHOPK', 'BIOPHYS', 'CHEM', 'HUMBIO', 'PHYSICS', 'PSYCH'],
  'Social Sciences': [
    'AFRICAAM',
    'AFRICAST',
    'AMSTUD',
    'ANTHRO',
    'ASNAMST',
    'CHILATST',
    'COMM',
    'CSRE',
    'EASTASN',
    'ECON',
    'FEMGEN',
    'GLOBAL',
    'HISTORY',
    'HUMRTS',
    'INTLPOL',
    'INTNLREL',
    'IIS',
    'SIW',
    'LATINAM',
    'LINGUIST',
    'NATIVEAM',
    'POLISCI',
    'PUBLPOL',
    'PSYCH',
    'SOC',
    'STS',
    'URBANST',
    'SYMSYS',
    'REES',
  ],
  Humanities: [
    'ARCHLGY',
    'ARTHIST',
    'CHINA',
    'CLASSICS',
    'COMPLIT',
    'DLCL',
    'EALC',
    'ENGLISH',
    'ETHICSOC',
    'FILMEDIA',
    'FRENCH',
    'GERMAN',
    'HISTORY',
    'HPS',
    'HUMCORE',
    'HUMSCI',
    'ITALIAN',
    'JAPAN',
    'JEWISHST',
    'KOREA',
    'MLA',
    'MEDVLST',
    'MTL',
    'PHIL',
    'RELIGST',
    'SLAVIC',
    'ILAC',
  ],
  Arts: ['ARTSTUDI', 'ARTSINST', 'DANCE', 'FILMPROD', 'MUSIC', 'TAPS'],
}

const HS_KEY = 'School of Humanities & Sciences'
const VPUE_KEY = 'Office of Vice Provost for Undergraduate Education'

// ── Group types ──────────────────────────────────────────────────────────────

type FlatGroup = {
  kind: 'flat'
  school: string
  codes: string[]
}

type NestedGroup = {
  kind: 'nested'
  school: string
  allCodes: string[]
  subcategories: { name: string; codes: string[] }[]
  uncategorized: string[]
  /** When true, uncategorized codes render inline (no "Other" collapsible header) */
  flatUncategorized?: boolean
}

type GroupEntry = FlatGroup | NestedGroup

// ── Keyboard column cycling ──────────────────────────────────────────────────

type HighlightedCol = null | 'include' | 'exclude'
const COL_CYCLE: HighlightedCol[] = [null, 'include', 'exclude']

function modeButtonClass(active: boolean) {
  return cn(
    'w-6 rounded py-0.5 text-center text-[10px] font-medium transition',
    active ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600',
  )
}

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

// ── Keyboard navigation item types ───────────────────────────────────────────

type FlatCode = { kind: 'code'; code: string }
type FlatHeader = { kind: 'header'; groupKey: string; codes: string[] }
type FlatItem = FlatCode | FlatHeader

// ── Component ────────────────────────────────────────────────────────────────

export function SubjectFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const advancedMode = search.advancedMode === true
  const { data: subjects = [] } = useQuery(availableSubjectsQueryOptions(search.year))

  const include = search.subjects ?? []
  const exclude = search.subjectsExclude ?? []
  const includeMode = search.subjectsIncludeMode
  const crosslistings = advancedMode && search.subjectsWithCrosslistings !== false

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [openSchools, setOpenSchools] = useState<Set<string>>(new Set())
  const [localQuery, setLocalQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [highlightedCol, setHighlightedCol] = useState<HighlightedCol>(null)
  const [labelHoveredIdx, setLabelHoveredIdx] = useState<number | null>(null)

  // ── Build grouped data ───────────────────────────────────────────────────

  const groupEntries: GroupEntry[] = useMemo(() => {
    const schoolMap = new Map<string, string[]>()
    for (const { code, school } of subjects) {
      const key = school ?? 'Other'
      const existing = schoolMap.get(key)
      if (existing) existing.push(code)
      else schoolMap.set(key, [code])
    }

    const entries: GroupEntry[] = []

    for (const [school, codes] of schoolMap) {
      if (school === HS_KEY || school === VPUE_KEY || school === 'Other') continue
      entries.push({ kind: 'flat', school, codes })
    }

    const hsCodes = schoolMap.get(HS_KEY) ?? []
    if (hsCodes.length > 0) {
      const hsSet = new Set(hsCodes)
      const langCodes = hsCodes.filter((c) => c.endsWith('LANG') || c.endsWith('LNG'))
      const nonLangSet = new Set(hsCodes.filter((c) => !langCodes.includes(c)))

      const subcategories: { name: string; codes: string[] }[] = []
      for (const [cat, manualCodes] of Object.entries(MANUAL_HS_CATEGORIES)) {
        const matched = manualCodes.filter((c) => nonLangSet.has(c))
        if (matched.length > 0) subcategories.push({ name: cat, codes: matched })
      }
      if (langCodes.length > 0) {
        subcategories.push({ name: 'Languages', codes: langCodes })
      }

      const categorized = new Set(subcategories.flatMap((s) => s.codes))
      const uncategorized = hsCodes.filter((c) => !categorized.has(c))

      entries.push({
        kind: 'nested',
        school: HS_KEY,
        allCodes: [...hsSet],
        subcategories,
        uncategorized,
      })
    }

    const vpueCodes = schoolMap.get(VPUE_KEY) ?? []
    if (vpueCodes.length > 0) {
      const bospCodes = vpueCodes.filter((c) => c.startsWith('OSP'))
      const subcategories = bospCodes.length > 0 ? [{ name: 'BOSP', codes: bospCodes }] : []
      const categorized = new Set(bospCodes)
      const uncategorized = vpueCodes.filter((c) => !categorized.has(c))
      entries.push({
        kind: 'nested',
        school: VPUE_KEY,
        allCodes: vpueCodes,
        subcategories,
        uncategorized,
        flatUncategorized: true,
      })
    }

    const otherCodes = schoolMap.get('Other')
    if (otherCodes && otherCodes.length > 0) {
      entries.push({ kind: 'flat', school: 'Other', codes: otherCodes })
    }

    return entries
  }, [subjects])

  // ── Full (unfiltered) codes per school, used for bulk toggles ────────────

  const fullCodesByKey = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const entry of groupEntries) {
      if (entry.kind === 'flat') {
        map.set(entry.school, entry.codes)
      } else {
        map.set(entry.school, entry.allCodes)
        for (const sub of entry.subcategories) {
          map.set(`${entry.school}::${sub.name}`, sub.codes)
        }
        if (entry.uncategorized.length > 0) {
          map.set(`${entry.school}::Other`, entry.uncategorized)
        }
      }
    }
    return map
  }, [groupEntries])

  // ── Filtering by search query ────────────────────────────────────────────

  const { filteredEntries, autoExpandedKeys } = useMemo(() => {
    const q = localQuery.trim().toLowerCase()
    if (!q) return { filteredEntries: groupEntries, autoExpandedKeys: new Set<string>() }

    const expanded = new Set<string>()
    const filtered: GroupEntry[] = []

    for (const entry of groupEntries) {
      if (entry.kind === 'flat') {
        const matchingCodes = entry.codes.filter((c) => c.toLowerCase().startsWith(q))
        if (matchingCodes.length > 0) {
          expanded.add(entry.school)
          filtered.push({ ...entry, codes: matchingCodes })
        }
      } else {
        const subs: { name: string; codes: string[] }[] = []
        for (const sub of entry.subcategories) {
          const matchingCodes = sub.codes.filter((c) => c.toLowerCase().startsWith(q))
          if (matchingCodes.length > 0) {
            expanded.add(entry.school)
            expanded.add(`${entry.school}::${sub.name}`)
            subs.push({ name: sub.name, codes: matchingCodes })
          }
        }
        const matchingUncat = entry.uncategorized.filter((c) => c.toLowerCase().startsWith(q))
        if (matchingUncat.length > 0) {
          expanded.add(entry.school)
          expanded.add(`${entry.school}::Other`)
        }
        if (subs.length > 0 || matchingUncat.length > 0) {
          filtered.push({
            ...entry,
            subcategories: subs,
            uncategorized: matchingUncat,
          })
        }
      }
    }

    return { filteredEntries: filtered, autoExpandedKeys: expanded }
  }, [groupEntries, localQuery])

  // ── Visibility helpers (shared by flatItems memo and render) ──────────────

  const isOpenKey = (key: string) => openSchools.has(key) || autoExpandedKeys.has(key)

  const isCodeVisible = (_code: string, parentOpen: boolean, _fullParentCodes: string[]) => {
    return parentOpen
  }

  // ── Flat item list for keyboard navigation (always built) ────────────────

  const flatItems = useMemo(() => {
    const items: FlatItem[] = []

    const addCodesForGroup = (codes: string[], parentOpen: boolean, fullParentCodes: string[]) => {
      for (const code of codes) {
        if (isCodeVisible(code, parentOpen, fullParentCodes)) {
          items.push({ kind: 'code', code })
        }
      }
    }

    for (const entry of filteredEntries) {
      if (entry.kind === 'flat') {
        const fullCodes = fullCodesByKey.get(entry.school) ?? entry.codes
        const schoolOpen = isOpenKey(entry.school)
        items.push({ kind: 'header', groupKey: entry.school, codes: fullCodes })
        addCodesForGroup(entry.codes, schoolOpen, fullCodes)
      } else {
        const fullCodes = fullCodesByKey.get(entry.school) ?? entry.allCodes
        const schoolOpen = isOpenKey(entry.school)
        items.push({ kind: 'header', groupKey: entry.school, codes: fullCodes })

        for (const sub of entry.subcategories) {
          const subKey = `${entry.school}::${sub.name}`
          const fullSubCodes = fullCodesByKey.get(subKey) ?? sub.codes

          if (!schoolOpen) continue

          const subOpen = isOpenKey(subKey)
          items.push({ kind: 'header', groupKey: subKey, codes: fullSubCodes })
          addCodesForGroup(sub.codes, subOpen, fullSubCodes)
        }

        if (entry.uncategorized.length > 0) {
          if (entry.flatUncategorized === true) {
            if (schoolOpen) {
              addCodesForGroup(entry.uncategorized, schoolOpen, fullCodes)
            }
          } else if (schoolOpen) {
            const uncatKey = `${entry.school}::Other`
            const fullUncatCodes = fullCodesByKey.get(uncatKey) ?? entry.uncategorized
            const uncatOpen = isOpenKey(uncatKey)
            items.push({ kind: 'header', groupKey: uncatKey, codes: fullUncatCodes })
            addCodesForGroup(entry.uncategorized, uncatOpen, fullUncatCodes)
          }
        }
      }
    }

    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEntries, fullCodesByKey, openSchools, autoExpandedKeys, include, exclude])

  // ── Auto-select first code when typing a search query ────────────────────

  const firstCodeIndex = useMemo(() => {
    return flatItems.findIndex((item) => item.kind === 'code')
  }, [flatItems])

  const prevQueryRef = useRef('')
  useEffect(() => {
    const wasEmpty = !prevQueryRef.current.trim()
    const isNonEmpty = !!localQuery.trim()
    prevQueryRef.current = localQuery

    if (isNonEmpty && wasEmpty && firstCodeIndex >= 0) {
      setHighlightedIndex(firstCodeIndex)
      setHighlightedCol(null)
    } else if (isNonEmpty && firstCodeIndex >= 0 && highlightedIndex < 0) {
      setHighlightedIndex(firstCodeIndex)
      setHighlightedCol(null)
    }
  }, [localQuery, firstCodeIndex, highlightedIndex])

  // ── Navigation helpers ───────────────────────────────────────────────────

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  const updateLocalQuery = (q: string) => {
    setLocalQuery(q)
    // The useEffect above will set highlightedIndex to firstCodeIndex on next render
    setHighlightedIndex(-1)
    setHighlightedCol(null)
  }

  const toggleInclude = (code: string) => {
    if (include.includes(code)) {
      navigate_({ subjects: include.filter((v) => v !== code) })
    } else {
      navigate_({ subjects: [...include, code], subjectsExclude: exclude.filter((v) => v !== code) })
    }
  }

  const toggleExclude = (code: string) => {
    if (exclude.includes(code)) {
      navigate_({ subjectsExclude: exclude.filter((v) => v !== code) })
    } else {
      navigate_({ subjectsExclude: [...exclude, code], subjects: include.filter((v) => v !== code) })
    }
  }

  const toggleBulkInclude = (codes: string[], groupKey: string) => {
    const codeSet = new Set(codes)
    const allIncluded = codes.every((c) => include.includes(c))
    const someIncluded = codes.some((c) => include.includes(c))
    if (allIncluded || someIncluded) {
      const protectedCodes = new Set<string>()
      for (const [key, groupCodes] of fullCodesByKey) {
        if (key === groupKey) continue
        if (key.startsWith(groupKey + '::')) continue
        if (groupKey.startsWith(key + '::')) continue
        const isFullyIncluded = groupCodes.every((c) => include.includes(c))
        if (isFullyIncluded) {
          for (const c of groupCodes) {
            if (codeSet.has(c)) protectedCodes.add(c)
          }
        }
      }
      navigate_({ subjects: include.filter((c) => !codeSet.has(c) || protectedCodes.has(c)) })
    } else {
      navigate_({
        subjects: [...include.filter((c) => !codeSet.has(c)), ...codes],
        subjectsExclude: exclude.filter((c) => !codeSet.has(c)),
      })
    }
  }

  const toggleBulkExclude = (codes: string[], groupKey: string) => {
    const codeSet = new Set(codes)
    const allExcluded = codes.every((c) => exclude.includes(c))
    const someExcluded = codes.some((c) => exclude.includes(c))
    if (allExcluded || someExcluded) {
      const protectedCodes = new Set<string>()
      for (const [key, groupCodes] of fullCodesByKey) {
        if (key === groupKey) continue
        if (key.startsWith(groupKey + '::')) continue
        if (groupKey.startsWith(key + '::')) continue
        const isFullyExcluded = groupCodes.every((c) => exclude.includes(c))
        if (isFullyExcluded) {
          for (const c of groupCodes) {
            if (codeSet.has(c)) protectedCodes.add(c)
          }
        }
      }
      navigate_({ subjectsExclude: exclude.filter((c) => !codeSet.has(c) || protectedCodes.has(c)) })
    } else {
      navigate_({
        subjectsExclude: [...exclude.filter((c) => !codeSet.has(c)), ...codes],
        subjects: include.filter((c) => !codeSet.has(c)),
      })
    }
  }

  const toggleOpen = (key: string) => {
    setOpenSchools((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        for (const k of next) {
          if (k.startsWith(`${key}::`)) next.delete(k)
        }
      } else {
        next.add(key)
      }
      return next
    })
  }

  // ── Focus management ─────────────────────────────────────────────────────

  const focusElement = (idx: number, col: HighlightedCol) => {
    if (idx < 0) {
      inputRef.current?.focus()
      return
    }
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
      const item: FlatItem | undefined = flatItems[highlightedIndex]
      if (item == null) return

      if (item.kind === 'header') {
        if (highlightedCol === 'exclude') {
          toggleBulkExclude(item.codes, item.groupKey)
        } else {
          toggleBulkInclude(item.codes, item.groupKey)
        }
      } else {
        if (highlightedCol === 'include') {
          toggleInclude(item.code)
        } else if (highlightedCol === 'exclude') {
          toggleExclude(item.code)
        } else {
          const isIncluded = include.includes(item.code)
          const isExcluded = exclude.includes(item.code)
          if (isIncluded) toggleInclude(item.code)
          else if (isExcluded) toggleExclude(item.code)
          else toggleInclude(item.code)
        }
      }
    } else if (e.key === ' ' && highlightedIndex >= 0) {
      if (e.target === inputRef.current) return
      e.preventDefault()
      const item: FlatItem | undefined = flatItems[highlightedIndex]
      if (item == null) return

      if (item.kind === 'header') {
        toggleOpen(item.groupKey)
      } else {
        if (highlightedCol === 'include') {
          toggleInclude(item.code)
        } else if (highlightedCol === 'exclude') {
          toggleExclude(item.code)
        } else {
          const isIncluded = include.includes(item.code)
          const isExcluded = exclude.includes(item.code)
          if (isIncluded) toggleInclude(item.code)
          else if (isExcluded) toggleExclude(item.code)
          else toggleInclude(item.code)
        }
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

  // ── Rendering helpers ────────────────────────────────────────────────────

  /**
   * Mutable counter incremented during render to assign each visible row
   * a flatItems index. Must stay in sync with the flatItems memo above.
   */
  let flatIdx = 0

  const takeFlatIdx = () => flatIdx++

  /** Render the include/exclude bulk-toggle buttons for a group header */
  const renderBulkButtons = (fullCodes: string[], label: string, groupKey: string, headerFlatIdx: number) => {
    const allIncluded = fullCodes.length > 0 && fullCodes.every((c) => include.includes(c))
    const allExcluded = fullCodes.length > 0 && fullCodes.every((c) => exclude.includes(c))
    const someIncluded = !allIncluded && fullCodes.some((c) => include.includes(c))
    const someExcluded = !allExcluded && fullCodes.some((c) => exclude.includes(c))

    const isRowHighlighted = headerFlatIdx === highlightedIndex
    const colHighlight = isRowHighlighted ? highlightedCol : null

    return (
      <>
        <div
          className={`group/include-col flex ${COL_W} cursor-pointer items-center justify-center self-stretch py-1`}
          onClick={() => toggleBulkInclude(fullCodes, groupKey)}
        >
          <button
            type="button"
            data-flat-idx={headerFlatIdx}
            data-col="include"
            onClick={(e) => {
              e.stopPropagation()
              toggleBulkInclude(fullCodes, groupKey)
            }}
            aria-label={`Include all ${label}`}
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
        <div
          className={`group/exclude-col flex ${COL_W} cursor-pointer items-center justify-center self-stretch py-1`}
          onClick={() => toggleBulkExclude(fullCodes, groupKey)}
        >
          <button
            type="button"
            data-flat-idx={headerFlatIdx}
            data-col="exclude"
            onClick={(e) => {
              e.stopPropagation()
              toggleBulkExclude(fullCodes, groupKey)
            }}
            aria-label={`Exclude all ${label}`}
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
      </>
    )
  }

  /** Render a single subject code row */
  const renderCodeRow = (code: string, indent: string) => {
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
          className={cn(
            'min-w-0 cursor-pointer truncate py-1 text-sm text-slate-700 outline-none group-hover/row:[-webkit-text-stroke:0.2px_currentColor]',
            indent,
          )}
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

  /** Render a list of code rows, skipping codes not visible due to collapse */
  const renderCodeRows = (
    codes: string[],
    indent: string,
    parentOpen: boolean,
    fullParentCodes: string[],
  ) => {
    return codes.map((code) => {
      if (!isCodeVisible(code, parentOpen, fullParentCodes)) return null
      return renderCodeRow(code, indent)
    })
  }

  /** Render a subcategory group within a nested entry */
  const renderSubcategory = (
    entry: NestedGroup,
    sub: { name: string; codes: string[] },
    schoolOpen: boolean,
  ) => {
    const subKey = `${entry.school}::${sub.name}`
    const subOpen = isOpenKey(subKey)
    const fullSubCodes = fullCodesByKey.get(subKey) ?? sub.codes

    if (!schoolOpen) return null

    const headerFlatIdx = takeFlatIdx()
    const isHeaderHighlighted = headerFlatIdx === highlightedIndex

    return (
      <Fragment key={subKey}>
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
            onClick={() => toggleOpen(subKey)}
            className="flex min-w-0 items-center gap-0.5 overflow-hidden py-1 pl-3 text-left text-[12.5px] font-medium text-slate-500 transition outline-none hover:text-slate-700"
          >
            {subOpen ? (
              <ChevronDown className="h-2 w-2 shrink-0" />
            ) : (
              <ChevronRight className="h-2 w-2 shrink-0" />
            )}
            <span className="truncate">{sub.name}</span>
          </button>
          {renderBulkButtons(fullSubCodes, sub.name, subKey, headerFlatIdx)}
        </div>
        {renderCodeRows(sub.codes, 'pl-5.5', subOpen, fullSubCodes)}
      </Fragment>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────

  // Reset mutable flatIdx counter before each render pass
  flatIdx = 0

  return (
    <div
      ref={containerRef}
      onKeyDown={handleContainerKeyDown}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-y-[1.5px]">
        {/* Row 1: Subject label + crosslistings toggle */}
        <div className="col-span-3 flex items-center justify-between py-0.5">
          <div className="flex items-center gap-0.5">
            <span className="text-[13px] font-medium text-slate-500 uppercase">Subjects</span>
            <button
              type="button"
              onClick={() => navigate_({ subjects: [], subjectsExclude: [] })}
              aria-label="Clear Subject filter"
              className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 focus-visible:text-red-500 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              style={{ display: include.length > 0 || exclude.length > 0 ? undefined : 'none' }}
            >
              <Eraser className="h-3 w-3" />
            </button>
          </div>
          {advancedMode && (
            <button
              type="button"
              role="checkbox"
              aria-checked={crosslistings}
              onClick={() =>
                navigate_({
                  subjectsWithCrosslistings: crosslistings ? false : undefined,
                  ...(crosslistings ? { subjectsIncludeMode: 'or' } : {}),
                })
              }
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium transition ${
                crosslistings
                  ? 'border-slate-300 bg-white/80 text-slate-700'
                  : 'border-slate-200 bg-white/80 text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>Consider Crosslistings</span>
              <span
                className={`flex h-3 w-3 items-center justify-center rounded-[2px] border text-[0] ${
                  crosslistings ? 'border-slate-500 bg-slate-50' : 'border-slate-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {crosslistings && <Check className="h-2 w-2 text-slate-600" strokeWidth={3} />}
              </span>
            </button>
          )}
        </div>

        {/* Row 2: Search input | Or/And | Exclude */}
        <div className="py-1 pr-3.5 pl-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={localQuery}
              onChange={(e) => updateLocalQuery(e.target.value)}
              placeholder="Search"
              className="h-7 w-full rounded border border-slate-200 bg-slate-50 py-0 pr-6 pl-6 text-[13px] text-slate-700 placeholder-slate-400 transition focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-slate-200 focus:outline-none"
            />
          </div>
        </div>
        <div className={`flex ${COL_W} items-center justify-center py-1`}>
          {crosslistings ? (
            <div className="flex items-center gap-0.25 rounded border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => navigate_({ subjectsIncludeMode: 'or' })}
                className={modeButtonClass(includeMode === 'or')}
              >
                Or
              </button>
              <button
                type="button"
                onClick={() => navigate_({ subjectsIncludeMode: 'and' })}
                className={modeButtonClass(includeMode === 'and')}
              >
                And
              </button>
            </div>
          ) : (
            <span className="text-[10.5px] font-medium text-slate-400">Include</span>
          )}
        </div>
        <div className={`flex ${COL_W} items-center justify-center py-1`}>
          <span className="text-[10.5px] font-medium text-slate-400">Exclude</span>
        </div>

        {/* Group rows */}
        {filteredEntries.map((entry) => {
          if (entry.kind === 'flat') {
            const fullCodes = fullCodesByKey.get(entry.school) ?? entry.codes
            const schoolOpen = isOpenKey(entry.school)

            const headerFlatIdx = takeFlatIdx()
            const isHeaderHighlighted = headerFlatIdx === highlightedIndex

            return (
              <Fragment key={entry.school}>
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
                    onClick={() => toggleOpen(entry.school)}
                    className="flex min-w-0 items-center gap-0.5 overflow-hidden py-1 pl-1 text-left text-[13px] font-semibold text-slate-600 transition outline-none hover:text-slate-800"
                  >
                    {schoolOpen ? (
                      <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">{SCHOOL_SHORT[entry.school] ?? entry.school}</span>
                  </button>
                  {renderBulkButtons(fullCodes, entry.school, entry.school, headerFlatIdx)}
                </div>
                {renderCodeRows(entry.codes, 'pl-4', schoolOpen, fullCodes)}
              </Fragment>
            )
          }

          // Nested (H&S) group
          const fullCodes = fullCodesByKey.get(entry.school) ?? entry.allCodes
          const schoolOpen = isOpenKey(entry.school)

          const headerFlatIdx = takeFlatIdx()
          const isHeaderHighlighted = headerFlatIdx === highlightedIndex

          return (
            <Fragment key={entry.school}>
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
                  onClick={() => toggleOpen(entry.school)}
                  className="flex min-w-0 items-center gap-0.5 overflow-hidden py-1 pl-0.5 text-left text-[13px] font-semibold text-slate-600 transition outline-none hover:text-slate-800"
                >
                  {schoolOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">{SCHOOL_SHORT[entry.school] ?? entry.school}</span>
                </button>
                {renderBulkButtons(fullCodes, entry.school, entry.school, headerFlatIdx)}
              </div>

              {entry.subcategories.map((sub) => renderSubcategory(entry, sub, schoolOpen))}

              {entry.uncategorized.length > 0 &&
                (entry.flatUncategorized === true
                  ? renderCodeRows(entry.uncategorized, 'pl-4', schoolOpen, fullCodes)
                  : (() => {
                      const uncatKey = `${entry.school}::Other`
                      const uncatOpen = isOpenKey(uncatKey)
                      const fullUncatCodes = fullCodesByKey.get(uncatKey) ?? entry.uncategorized

                      if (!schoolOpen) return null

                      const uncatHeaderFlatIdx = takeFlatIdx()
                      const isUncatHighlighted = uncatHeaderFlatIdx === highlightedIndex

                      return (
                        <Fragment key={uncatKey}>
                          <div
                            className={cn(
                              'col-span-3 grid grid-cols-subgrid items-center overflow-hidden rounded transition-colors',
                              isUncatHighlighted ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50',
                            )}
                          >
                            <button
                              type="button"
                              tabIndex={0}
                              data-flat-idx={uncatHeaderFlatIdx}
                              data-col="row"
                              onClick={() => toggleOpen(uncatKey)}
                              className="flex min-w-0 items-center gap-0.5 overflow-hidden py-1 pl-4 text-left text-[11.5px] font-medium text-slate-500 transition outline-none hover:text-slate-700"
                            >
                              {uncatOpen ? (
                                <ChevronDown className="h-2 w-2 shrink-0" />
                              ) : (
                                <ChevronRight className="h-2 w-2 shrink-0" />
                              )}
                              <span className="truncate">Other</span>
                            </button>
                            {renderBulkButtons(fullUncatCodes, 'Other H&S', uncatKey, uncatHeaderFlatIdx)}
                          </div>
                          {renderCodeRows(entry.uncategorized, 'pl-8', uncatOpen, fullUncatCodes)}
                        </Fragment>
                      )
                    })())}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
