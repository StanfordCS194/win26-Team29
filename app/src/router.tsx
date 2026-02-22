import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import qs from 'query-string'

import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
  const rqContext = TanstackQuery.getContext()

  const router = createRouter({
    routeTree,
    parseSearch: (searchStr) =>
      qs.parse(searchStr, { arrayFormat: 'comma', parseBooleans: true, parseNumbers: true }),

    stringifySearch: (search) => {
      const str = qs.stringify(search as Record<string, unknown>, { arrayFormat: 'comma' })
      return str ? `?${str}` : ''
    },
    context: {
      ...rqContext,
    },

    defaultPreload: 'intent',
  })

  setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })

  return router
}
