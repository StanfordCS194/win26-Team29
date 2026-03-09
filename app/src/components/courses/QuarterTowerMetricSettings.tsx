import { Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EVAL_QUESTION_SLUGS } from '@/data/search/eval-questions'
import { DERIVED_METRIC_SLUGS, getEvalMetricMeta } from '@/data/search/eval-metrics'

import type { AllMetricSlug } from '@/data/search/eval-metrics'

const ALL_METRIC_SLUGS: AllMetricSlug[] = [...EVAL_QUESTION_SLUGS, ...DERIVED_METRIC_SLUGS]

type QuarterTowerMetricSettingsProps = {
  alwaysVisibleEvalSlugs: AllMetricSlug[]
  onAlwaysVisibleEvalSlugsChange: (slugs: AllMetricSlug[]) => void
  visibleEvalSlugs: AllMetricSlug[]
}

export function QuarterTowerMetricSettings({
  alwaysVisibleEvalSlugs,
  onAlwaysVisibleEvalSlugsChange,
  visibleEvalSlugs,
}: QuarterTowerMetricSettingsProps) {
  const selected = new Set(alwaysVisibleEvalSlugs)
  const forceChecked = new Set(visibleEvalSlugs.filter((slug) => !selected.has(slug)))
  const totalVisible = new Set([...selected, ...forceChecked])

  const maxSmartAverages = 4

  const toggle = (slug: AllMetricSlug, nextChecked: boolean) => {
    const next = new Set(selected)
    if (nextChecked) {
      const wouldBeVisible = new Set([...next, slug, ...forceChecked])
      if (wouldBeVisible.size > maxSmartAverages) return
      next.add(slug)
    } else {
      next.delete(slug)
    }
    onAlwaysVisibleEvalSlugsChange(ALL_METRIC_SLUGS.filter((item) => next.has(item)))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="bg-white"
            aria-label="Quarter tower metric settings"
            size="icon"
          />
        }
      >
        <Settings2 />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show Eval Smart Averages</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {EVAL_QUESTION_SLUGS.map((slug) => {
            const meta = getEvalMetricMeta(slug)
            const Icon = meta.icon
            const isForced = forceChecked.has(slug)
            return (
              <DropdownMenuCheckboxItem
                key={slug}
                checked={selected.has(slug) || isForced}
                disabled={isForced || (!selected.has(slug) && totalVisible.size >= maxSmartAverages)}
                onCheckedChange={(value) => toggle(slug, value === true)}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                {meta.label}
              </DropdownMenuCheckboxItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Derived Metrics</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {DERIVED_METRIC_SLUGS.map((slug) => {
            const meta = getEvalMetricMeta(slug)
            const Icon = meta.icon
            const isForced = forceChecked.has(slug)
            return (
              <DropdownMenuCheckboxItem
                key={slug}
                checked={selected.has(slug) || isForced}
                disabled={isForced || (!selected.has(slug) && totalVisible.size >= maxSmartAverages)}
                onCheckedChange={(value) => toggle(slug, value === true)}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                {meta.label}
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
