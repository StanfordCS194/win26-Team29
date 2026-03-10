import { useQuery } from '@tanstack/react-query'
import { Route } from '@/routes/courses'
import { availableComponentTypesQueryOptions } from './courses-query-options'
import { SetFilter } from './SetFilter'
import type { SearchParams } from '@/data/search/search.params'

const COMPONENT_LABELS: Record<string, string> = {
  LEC: 'Lecture (LEC)',
  SEM: 'Seminar (SEM)',
  DIS: 'Discussion Section (DIS)',
  LAB: 'Laboratory (LAB)',
  LBS: 'Lab Section (LBS)',
  ACT: 'Activity (ACT)',
  CAS: 'Case Study (CAS)',
  COL: 'Colloquium (COL)',
  WKS: 'Workshop (WKS)',
  RSC: 'Research (RSC)',
  INS: 'Independent Study (INS)',
  IDS: 'Intro Dial, Sophomore (IDS)',
  ISF: 'Intro Sem, Freshman (ISF)',
  ISS: 'Intro Sem, Sophomore (ISS)',
  ITR: 'Internship (ITR)',
  API: 'Arts Intensive Program (API)',
  LNG: 'Language (LNG)',
  CLK: 'Clerkship (CLK)',
  CLN: 'Clinic (CLN)',
  SIM: 'Simulation (SIM)',
  TUT: 'Tutorial (TUT)',
  PRA: 'Practicum (PRA)',
  PRC: 'Practicum (PRC)',
  RES: 'Research (RES)',
  SCS: 'Sophomore College (SCS)',
  'T/D': 'Thesis/Dissertation (T/D)',
}

export function ComponentFilter() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: componentCodes = [] } = useQuery(availableComponentTypesQueryOptions(search.year))

  const items = componentCodes.map((c) => ({ value: c, label: COMPONENT_LABELS[c] ?? c }))

  const navigate_ = (patch: Partial<SearchParams>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }) as Required<SearchParams>,
    })
  }

  return (
    <SetFilter
      label="Component"
      items={items}
      include={search.componentTypes}
      exclude={search.componentTypesExclude}
      onIncludeChange={(v) => navigate_({ componentTypes: v })}
      onExcludeChange={(v) => navigate_({ componentTypesExclude: v })}
      onClear={() => navigate_({ componentTypes: [], componentTypesExclude: [] })}
    />
  )
}
