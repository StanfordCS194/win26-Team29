import { Effect } from 'effect'

import { DbService } from '@scrape/shared/db-layer.ts'

export const lookupSubjectIds = (subjects: Set<string>) =>
  Effect.gen(function* () {
    if (subjects.size === 0) {
      return new Map<string, number>()
    }

    const db = yield* DbService

    const records = yield* Effect.promise(() =>
      db.selectFrom('subjects').select(['id', 'code']).where('code', 'in', Array.from(subjects)).execute(),
    )

    return new Map<string, number>(records.map((r) => [r.code, r.id]))
  })
