import { queryOptions } from '@tanstack/react-query'
import { getUserPlan } from './plan-server'

export const PLAN_QUERY_KEY = ['user-plan'] as const

export const planQueryOptions = queryOptions({
  queryKey: PLAN_QUERY_KEY,
  queryFn: () => getUserPlan(),
})
