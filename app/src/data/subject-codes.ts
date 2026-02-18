import { AnyFunctionMiddleware, createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { getServerDb } from '@/lib/server-db'

export const getSubjectCodes = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware as AnyFunctionMiddleware])
  .handler(async () => {
    const db = getServerDb()
    const rows = await db.selectFrom('subjects').select('code').execute()
    return rows.map((r) => r.code)
  })
