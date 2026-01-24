import { Effect, Either, pipe } from 'effect'
import { parse } from 'node-html-parser'
import { z } from 'zod'
import { decode } from 'html-entities'
import type { HTMLElement } from 'node-html-parser'
import { EvalInfoSchema, type EvalInfo } from './parse-listings.ts'

const ResponseOptionSchema = z.object({
  option: z.string().min(1),
  weight: z.number(),
  frequency: z.number().int().nonnegative(),
})

const NumericQuestionSchema = z.object({
  type: z.literal('numeric'),
  responses: z.array(ResponseOptionSchema),
})

const TextQuestionSchema = z.object({
  type: z.literal('text'),
  responses: z.array(z.string().min(1)),
})

const QuestionSchema = z.discriminatedUnion('type', [
  NumericQuestionSchema,
  TextQuestionSchema,
])
export type Question = z.infer<typeof QuestionSchema>

type QuestionSchemaType = (typeof QuestionSchema.options)[number]

export enum KnownQuestion {
  HowWellDidYouAchieve = 'How well did you achieve the learning goals of this course?',
  AboutWhatPercentInPerson = 'About what percent of the class meetings (including discussions) did you attend in person?',
  AboutWhatPercentOnline = 'About what percent of the class meetings did you attend online?',
  HowMuchDidYouLearn = 'How much did you learn from this course?',
  OverallQualityOfInstruction = 'Overall, how would you describe the quality of the instruction in this course?',
  HowManyHoursPerWeek = 'How many hours per week on average did you spend on this course (including class meetings)?',
  HowOrganized = 'How organized was the course?',
  WhatWouldYouLikeToSay = 'What would you like to say about this course to a student who is considering taking it in the future?',
}

export const KnownQuestionSchema = z.enum(KnownQuestion)

const QUESTION_KIND_MAP = {
  [KnownQuestion.HowWellDidYouAchieve]: NumericQuestionSchema,
  [KnownQuestion.AboutWhatPercentInPerson]: NumericQuestionSchema,
  [KnownQuestion.AboutWhatPercentOnline]: NumericQuestionSchema,
  [KnownQuestion.HowMuchDidYouLearn]: NumericQuestionSchema,
  [KnownQuestion.OverallQualityOfInstruction]: NumericQuestionSchema,
  [KnownQuestion.HowManyHoursPerWeek]: NumericQuestionSchema,
  [KnownQuestion.HowOrganized]: NumericQuestionSchema,
  [KnownQuestion.WhatWouldYouLikeToSay]: TextQuestionSchema,
} as const satisfies Record<KnownQuestion, QuestionSchemaType>

const QuestionTypeMapSchema = z
  .object(QUESTION_KIND_MAP)
  .catchall(QuestionSchema)
export type QuestionTypeMap = z.infer<typeof QuestionTypeMapSchema>

const ProcessedReportSchema = z.object({
  info: EvalInfoSchema,
  questions: QuestionTypeMapSchema,
})
export type ProcessedReport = z.infer<typeof ProcessedReportSchema>

const cleanQuestionText = (text: string): string =>
  text.replace(/^\d+\s*-\s*/, '').trim()

function normalizeText(str: string): string {
  return decode(str)
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .normalize('NFC')
    .trim()
}

const matchKnownQuestion = (cleanedText: string): KnownQuestion | string => {
  const knownQuestions = Object.values(KnownQuestion)
  for (const question of knownQuestions) {
    if (cleanedText.startsWith(question)) {
      return question
    }
  }
  return cleanedText
}

const parseNumber = (value: string): Effect.Effect<number, Error> =>
  Effect.gen(function* (_) {
    const normalized = value.replace(/,/g, '').trim()
    if (normalized.length === 0) {
      return yield* _(
        Effect.fail(new Error(`Cannot parse empty string as number`)),
      )
    }
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) {
      return yield* _(Effect.fail(new Error(`Invalid number: "${value}"`)))
    }
    return parsed
  })

const parseWeight = (value: string): Effect.Effect<number, Error> =>
  Effect.gen(function* (_) {
    const match = value.match(/\(([0-9.]+)\)/)
    if (!match) {
      return yield* _(
        Effect.fail(new Error(`Could not extract weight from: "${value}"`)),
      )
    }
    return yield* _(parseNumber(match[1]))
  })

const findAncestorWithClass = (
  node: HTMLElement,
  className: string,
): HTMLElement => {
  let current: HTMLElement | null = node
  while (current) {
    const classes = (current.getAttribute('class') || '').split(/\s+/)
    if (classes.includes(className)) return current
    current = current.parentNode as HTMLElement | null
  }
  throw new Error(
    `Could not find ancestor with class "${className}" for node ${node.tagName}`,
  )
}

const extractQuestionBlocks = (root: HTMLElement) =>
  root.querySelectorAll('h4.question-text').map((questionNode) => {
    const questionText = questionNode.text.trim()
    const siblings: Array<HTMLElement> = []

    // Try to find panel structure first
    try {
      const heading = findAncestorWithClass(questionNode, 'panel-heading')
      const panelBody =
        heading.nextElementSibling &&
        (heading.nextElementSibling.getAttribute('class') || '').includes(
          'panel-body',
        )
          ? heading.nextElementSibling
          : undefined

      if (panelBody) {
        siblings.push(panelBody)
        return { questionText, siblings }
      }
    } catch {
      // Fall through to sibling collection
    }

    // Collect siblings until next H4
    let current = questionNode.nextElementSibling
    while (current && current.tagName !== 'H4') {
      siblings.push(current)
      current = current.nextElementSibling
    }

    return { questionText, siblings }
  })

const parseNumericQuestion = (
  questionKey: string,
  siblings: Array<HTMLElement>,
): Effect.Effect<z.infer<typeof NumericQuestionSchema>, Error> =>
  Effect.gen(function* (_) {
    const responses: Array<z.infer<typeof ResponseOptionSchema>> = []

    const optionsTable = siblings
      .flatMap((node) => node.querySelectorAll('table'))
      .find((table) => {
        const headers = table.querySelectorAll('th')
        const headerTexts = Array.from(headers).map((h) => h.text.trim())
        return (
          headerTexts.includes('Response Option') &&
          headerTexts.includes('Weight') &&
          headerTexts.includes('Frequency')
        )
      })

    if (!optionsTable) {
      return yield* _(
        Effect.fail(
          new Error(
            `Could not find options table for numeric question: "${questionKey}"`,
          ),
        ),
      )
    }

    const rows = optionsTable.querySelectorAll('tr')
    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      if (cells.length >= 3) {
        const option = cells[0].text.trim().replace(/\s+/g, ' ')
        const weightText = cells[1].text.trim()
        const frequencyText = cells[2].text.trim()

        if (!option || !weightText || !frequencyText) {
          continue
        }

        const weight = yield* _(parseWeight(weightText))
        const frequency = yield* _(parseNumber(frequencyText))

        responses.push({ option, weight, frequency })
      }
    }

    const result = NumericQuestionSchema.safeParse({
      type: 'numeric',
      responses,
    })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(
            `Invalid numeric question data for "${questionKey}": ${result.error.message}`,
          ),
        ),
      )
    }

    return result.data
  })

const parseTextQuestion = (
  questionKey: string,
  siblings: Array<HTMLElement>,
): Effect.Effect<z.infer<typeof TextQuestionSchema>, Error> =>
  Effect.gen(function* (_) {
    const responses: Array<string> = []

    const list = siblings
      .flatMap((node) => node.querySelectorAll('ul'))
      .find((ul) => ul.getAttribute('role') === 'list')

    const items = list?.querySelectorAll('li[role="listitem"]') ?? []
    for (const item of items) {
      const text = item.text.trim()
      if (text.length > 0) {
        responses.push(text)
      }
    }

    const result = TextQuestionSchema.safeParse({
      type: 'text',
      responses,
    })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(
            `Invalid text question data for "${questionKey}": ${result.error.message}`,
          ),
        ),
      )
    }

    return result.data
  })

export const parseReport = (
  html: string,
  info: EvalInfo,
): Effect.Effect<ProcessedReport, Error> =>
  Effect.gen(function* (_) {
    const root = parse(html)
    const questions: Record<string, Question> = {}

    const blocks = extractQuestionBlocks(root)

    if (blocks.length === 0) {
      return yield* _(
        Effect.fail(new Error('No question blocks found in HTML report')),
      )
    }

    for (const { questionText, siblings } of blocks) {
      const cleanedText = cleanQuestionText(normalizeText(questionText))
      const questionKey = matchKnownQuestion(cleanedText)

      const expectedSchema =
        questionKey in QUESTION_KIND_MAP
          ? QUESTION_KIND_MAP[questionKey as KnownQuestion]
          : null

      let parsedQuestion: Question

      if (expectedSchema === NumericQuestionSchema) {
        parsedQuestion = yield* _(parseNumericQuestion(questionKey, siblings))
      } else if (expectedSchema === TextQuestionSchema) {
        parsedQuestion = yield* _(parseTextQuestion(questionKey, siblings))
      } else {
        const numericResult = yield* _(
          parseNumericQuestion(questionKey, siblings).pipe(Effect.either),
        )
        const textResult = yield* _(
          parseTextQuestion(questionKey, siblings).pipe(Effect.either),
        )

        if (Either.isRight(numericResult) && Either.isLeft(textResult)) {
          parsedQuestion = numericResult.right
        } else if (Either.isLeft(numericResult) && Either.isRight(textResult)) {
          parsedQuestion = textResult.right
        } else if (
          Either.isRight(numericResult) &&
          Either.isRight(textResult)
        ) {
          return yield* _(
            Effect.fail(
              new Error(
                `Ambiguous question type for "${questionKey}": parsed as both numeric and text`,
              ),
            ),
          )
        } else {
          return yield* _(
            Effect.fail(
              new Error(
                `Could not parse question "${questionKey}" as either numeric or text`,
              ),
            ),
          )
        }
      }

      questions[questionKey] = parsedQuestion
    }

    const result = ProcessedReportSchema.safeParse({ info, questions })

    if (!result.success) {
      return yield* _(
        Effect.fail(
          new Error(`Invalid processed report: ${result.error.message}`),
        ),
      )
    }

    return result.data
  })

export { QuestionSchema, QuestionTypeMapSchema, ProcessedReportSchema }
