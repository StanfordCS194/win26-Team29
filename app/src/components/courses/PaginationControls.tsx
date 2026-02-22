import { Route } from '@/routes/courses'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { CoursesSearch } from '@/data/search/search.types'

type PaginationControlsProps = {
  page: number
  hasMore: boolean
  isLoading?: boolean
}

export function PaginationControls({ page, hasMore, isLoading = false }: PaginationControlsProps) {
  const navigate = Route.useNavigate()

  const goToPage = (nextPage: number) => {
    if (nextPage < 1) return
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          page: nextPage,
        }) as Required<CoursesSearch>,
    })
  }

  const prevDisabled = page <= 1 || isLoading
  const nextDisabled = !hasMore || isLoading

  return (
    <Pagination className="mt-6">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            tabIndex={prevDisabled ? -1 : undefined}
            aria-disabled={prevDisabled}
            className={prevDisabled ? 'pointer-events-none opacity-50' : undefined}
            onClick={(event) => {
              event.preventDefault()
              if (prevDisabled) return
              goToPage(page - 1)
            }}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-3 text-sm text-slate-500">Page {page}</span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            tabIndex={nextDisabled ? -1 : undefined}
            aria-disabled={nextDisabled}
            className={nextDisabled ? 'pointer-events-none opacity-50' : undefined}
            onClick={(event) => {
              event.preventDefault()
              if (nextDisabled) return
              goToPage(page + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
