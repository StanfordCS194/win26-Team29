import { FileArchive, FileStack } from 'lucide-react'

import { Route } from '@/routes/courses'
import type { SearchParams } from '@/data/search/search.params'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

export function DeduplicateCrosslistings() {
  const checked = Route.useSearch({ select: (s) => s.dedupeCrosslistings ?? true })
  const navigate = Route.useNavigate()

  const toggle = () => {
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          dedupeCrosslistings: checked ? false : undefined,
          page: 1,
        }) as Required<SearchParams>,
    })
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="outline" size="icon-sm" aria-pressed={checked} aria-label="Skip crosslistings">
              {checked ? <FileArchive /> : <FileStack />}
            </Button>
          }
          onClick={toggle}
        />
        <TooltipContent side="bottom">
          {checked ? 'Crosslistings hidden' : 'Hide crosslistings'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
