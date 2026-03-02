import { Data, HashMap, HashSet, Option } from 'effect'

import type { ProcessedReport, Question } from './parse-report.ts'

// ── Atomic value types ──────────────────────────────────────────────

export class CodeNumber extends Data.Class<{
  number: number
  suffix: Option.Option<string>
}> {}

export class SectionCourseCode extends Data.Class<{
  subject: string
  codeNumber: CodeNumber
  sectionNumber: string
}> {}

export class ResponseOption extends Data.Class<{
  option: string
  weight: number
  frequency: number
}> {}

// ── Questions ───────────────────────────────────────────────────────

export class NumericQuestion extends Data.TaggedClass('numeric')<{
  responses: HashSet.HashSet<ResponseOption>
}> {}

export class TextQuestion extends Data.TaggedClass('text')<{
  responses: HashSet.HashSet<string>
}> {}

export type EffectQuestion = NumericQuestion | TextQuestion

// ── EvalInfo (without dataIds) ──────────────────────────────────────

export class EffectEvalInfo extends Data.Class<{
  sectionCourseCodes: HashSet.HashSet<SectionCourseCode>
  quarter: string // QuarterOutput
  year: number
  responded: number
  total: number
}> {}

// ── ProcessedReport ─────────────────────────────────────────────────

export class EffectProcessedReport extends Data.Class<{
  info: EffectEvalInfo
  questions: HashMap.HashMap<string, EffectQuestion>
}> {}

// ── Conversion ──────────────────────────────────────────────────────

const convertCodeNumber = (cn: { number: number; suffix?: string }): CodeNumber =>
  new CodeNumber({
    number: cn.number,
    suffix: Option.fromNullable(cn.suffix),
  })

const convertSectionCourseCode = (
  scc: ProcessedReport['info']['sectionCourseCodes'][number],
): SectionCourseCode =>
  new SectionCourseCode({
    subject: scc.subject,
    codeNumber: convertCodeNumber(scc.codeNumber),
    sectionNumber: scc.sectionNumber,
  })

const convertQuestion = (q: Question): EffectQuestion => {
  if (q.type === 'numeric') {
    return new NumericQuestion({
      responses: HashSet.fromIterable(
        [...q.responses].map(
          (r) => new ResponseOption({ option: r.option, weight: r.weight, frequency: r.frequency }),
        ),
      ),
    })
  }
  return new TextQuestion({
    responses: HashSet.fromIterable(q.responses),
  })
}

export const toEffectProcessedReport = (report: ProcessedReport): EffectProcessedReport =>
  new EffectProcessedReport({
    info: new EffectEvalInfo({
      sectionCourseCodes: HashSet.fromIterable(report.info.sectionCourseCodes.map(convertSectionCourseCode)),
      quarter: report.info.quarter,
      year: report.info.year,
      responded: report.info.responded,
      total: report.info.total,
    }),
    questions: HashMap.fromIterable(
      Object.entries(report.questions).map(([key, question]) => [key, convertQuestion(question)] as const),
    ),
  })
