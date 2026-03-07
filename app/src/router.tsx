import { createRouter, parseSearchWith, stringifySearchWith } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { routeTree } from './routeTree.gen'
import type { RouterContext } from './routes/__root'

function serializeValue(value: unknown): string {
  if (Array.isArray(value)) {
    const badElement = value.find((v) => String(v).includes('.'))
    if (badElement !== undefined) {
      throw new Error(
        `Cannot serialize array whose elements contain dots — dots are used as the array separator: ${JSON.stringify(value)}`,
      )
    }
    return value.map(String).join('.')
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

function deserializeValue(str: string): unknown {
  if (str.includes('.')) return str.split('.')
  return str
}

export const getRouter = () => {
  const rqContext = TanstackQuery.getContext()

  const router = createRouter({
    routeTree,
    stringifySearch: stringifySearchWith(serializeValue),
    parseSearch: parseSearchWith(deserializeValue),
    context: {
      ...rqContext,
      user: null,
    } satisfies RouterContext,

    defaultPreload: 'intent',
  })

  setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })

  return router
}
