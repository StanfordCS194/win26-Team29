import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import type { SearchQueryOptions } from './courses-query-options'

export function usePrefetchOnHover(getQueryOptions: () => SearchQueryOptions | null, delay = 150) {
  const queryClient = useQueryClient()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const onPointerEnter = () => {
    timeoutRef.current = setTimeout(() => {
      const opts = getQueryOptions()
      if (opts) void queryClient.prefetchQuery(opts)
    }, delay)
  }

  const onPointerLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  return { onPointerEnter, onPointerLeave }
}
