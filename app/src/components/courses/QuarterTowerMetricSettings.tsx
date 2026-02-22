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
import { getEvalMetricMeta } from '@/data/search/eval-metrics'

import type { EvalSlug } from '@/data/search/eval-questions'

type QuarterTowerMetricSettingsProps = {
  alwaysVisibleEvalSlugs: EvalSlug[]
  onAlwaysVisibleEvalSlugsChange: (slugs: EvalSlug[]) => void
}

export function QuarterTowerMetricSettings({
  alwaysVisibleEvalSlugs,
  onAlwaysVisibleEvalSlugsChange,
}: QuarterTowerMetricSettingsProps) {
  const selected = new Set(alwaysVisibleEvalSlugs)

  const toggle = (slug: EvalSlug, nextChecked: boolean) => {
    const next = new Set(selected)
    if (nextChecked) {
      next.add(slug)
    } else {
      next.delete(slug)
    }
    onAlwaysVisibleEvalSlugsChange(EVAL_QUESTION_SLUGS.filter((item) => next.has(item)))
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
          <DropdownMenuLabel>Quarter tower always-show metrics</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {EVAL_QUESTION_SLUGS.map((slug) => {
            const meta = getEvalMetricMeta(slug)
            const Icon = meta.icon
            return (
              <DropdownMenuCheckboxItem
                key={slug}
                checked={selected.has(slug)}
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
