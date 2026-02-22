import { createServerFn } from '@tanstack/react-start'

export const EVAL_QUESTION_SLUGS = [
  'rating',
  'hours',
  'learning',
  'organized',
  'goals',
  'attend_in_person',
  'attend_online',
] as const

export type EvalSlug = (typeof EVAL_QUESTION_SLUGS)[number]

export const SLUG_TO_QUESTION_TEXT: Record<EvalSlug, string> = {
  rating: 'Overall, how would you describe the quality of the instruction in this course?',
  learning: 'How much did you learn from this course?',
  organized: 'How organized was the course?',
  goals: 'How well did you achieve the learning goals of this course?',
  attend_in_person: 'About what percent of the class meetings did you attend in person?',
  attend_online: 'About what percent of the class meetings did you attend online?',
  hours: 'How many hours per week on average did you spend on this course (including class meetings)?',
}

export const SLUG_LABEL: Record<EvalSlug, string> = {
  rating: 'Instruction quality',
  learning: 'How much you learned',
  organized: 'Course organization',
  goals: 'Learning goals achieved',
  attend_in_person: 'In-person attendance',
  attend_online: 'Online attendance',
  hours: 'Hours per week',
}

const QUESTION_TEXT_TO_SLUG = new Map(
  Object.entries(SLUG_TO_QUESTION_TEXT).map(([slug, text]) => [text, slug as EvalSlug]),
)

export type EvalQuestion = {
  id: number
  slug: EvalSlug
  label: string
  questionText: string
}

let cachedEvalQuestions: EvalQuestion[] | null = null

export const getEvalQuestions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<EvalQuestion[]> => {
    if (cachedEvalQuestions) return cachedEvalQuestions

    const { getServerDb } = await import('@/lib/server-db')
    const db = getServerDb()

    const rows = await db
      .selectFrom('evaluation_numeric_questions as enq')
      .select(['enq.id', 'enq.question_text'])
      .execute()

    const questions: EvalQuestion[] = []
    for (const row of rows) {
      const slug = QUESTION_TEXT_TO_SLUG.get(row.question_text)
      if (!slug) continue
      questions.push({
        id: row.id,
        slug,
        label: SLUG_LABEL[slug],
        questionText: row.question_text,
      })
    }

    cachedEvalQuestions = questions
    console.log(`[startup] warmed ${questions.length} eval questions`)
    return questions
  },
)
