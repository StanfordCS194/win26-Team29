import { Route } from '@/routes/courses'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { PAGE_SIZE } from '@/data/search/search.query'
import { SearchParams } from '@/data/search/search.params'

type PaginationControlsProps = {
  page: number
  totalCount: number
}

/**
 * Returns exactly 7 slots (for totalPages > 7) so the pagination pill
 * never changes width as you navigate. Three fixed layouts:
 *   near start  (page ≤ 4):      1 2 3 4 5 … N
 *   middle      (5 ≤ page ≤ N−4): 1 … p−1 p p+1 … N
 *   near end    (page ≥ N−3):    1 … N−4 N−3 N−2 N−1 N
 */
function getPaginationItems(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }
  if (page >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages]
}

export function PaginationControls({ page, totalCount }: PaginationControlsProps) {
  const navigate = Route.useNavigate()

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const hasMore = page < totalPages

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return
    void navigate({
      search: (prev) =>
        ({
          ...prev,
          page: nextPage,
        }) as Required<SearchParams>,
    })
  }

  const prevDisabled = page <= 1
  const nextDisabled = !hasMore
  const pageItems = getPaginationItems(page, totalPages)

  return (
    <div className="sticky bottom-6 z-50 mx-auto w-fit">
      <Pagination className="rounded-full border border-slate-200 bg-white/80 px-2 py-1 shadow-lg backdrop-blur-md">
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

          {pageItems.map((item, i) =>
            item === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  href="#"
                  isActive={item === page}
                  onClick={(event) => {
                    event.preventDefault()
                    goToPage(item)
                  }}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

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
    </div>
  )
}
