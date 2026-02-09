import { Effect } from 'effect'
import { DbService } from '@scrape/shared/db-layer.ts'

export const preupsertAllQuestions = (numericQuestions: Set<string>, textQuestions: Set<string>) =>
  Effect.gen(function* () {
    const db = yield* DbService

    const result = yield* Effect.tryPromise({
      try: async () => {
        const numericQuestionMap = new Map<string, number>()
        const textQuestionMap = new Map<string, number>()

        // Upsert numeric questions
        if (numericQuestions.size > 0) {
          const upsertedNumeric = await db
            .insertInto('evaluation_numeric_questions')
            .values(Array.from(numericQuestions).map((q) => ({ question_text: q })))
            .onConflict((oc) =>
              oc.column('question_text').doUpdateSet({
                question_text: (eb) => eb.ref('excluded.question_text'),
              }),
            )
            .returning(['id', 'question_text'])
            .execute()

          for (const q of upsertedNumeric) {
            numericQuestionMap.set(q.question_text, q.id)
          }
        }

        // Upsert text questions
        if (textQuestions.size > 0) {
          const upsertedText = await db
            .insertInto('evaluation_text_questions')
            .values(Array.from(textQuestions).map((q) => ({ question_text: q })))
            .onConflict((oc) =>
              oc.column('question_text').doUpdateSet({
                question_text: (eb) => eb.ref('excluded.question_text'),
              }),
            )
            .returning(['id', 'question_text'])
            .execute()

          for (const q of upsertedText) {
            textQuestionMap.set(q.question_text, q.id)
          }
        }

        return { numericQuestionMap, textQuestionMap }
      },
      catch: (error) => {
        const msg = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to pre-upsert questions: ${msg}`)
      },
    })

    return result
  })
