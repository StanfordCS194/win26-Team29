import { z } from 'zod'

export const naturalFromStringOrNumber = z.preprocess((value) => {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    if (value.trim() === '') {
      return value
    } // let Zod fail
    const n = Number(value)
    return Number.isNaN(n) ? value : n
  }

  return value
}, z.int().nonnegative())

export enum QuarterEnum {
  Autumn = 'Autumn',
  Winter = 'Winter',
  Spring = 'Spring',
  Summer = 'Summer',
}

const quarterMap: Record<string, QuarterEnum> = {
  autumn: QuarterEnum.Autumn,
  fall: QuarterEnum.Autumn,
  winter: QuarterEnum.Winter,
  spring: QuarterEnum.Spring,
  summer: QuarterEnum.Summer,
}

const reverseQuarterMap: Record<QuarterEnum, QuarterEnum> = {
  [QuarterEnum.Autumn]: QuarterEnum.Autumn,
  [QuarterEnum.Winter]: QuarterEnum.Winter,
  [QuarterEnum.Spring]: QuarterEnum.Spring,
  [QuarterEnum.Summer]: QuarterEnum.Summer,
}

export const QuarterSchema = z.codec(
  z.string().refine(
    (val) => {
      const normalized = val.trim().toLowerCase()
      return normalized in quarterMap
    },
    { message: 'Invalid quarter. Must be one of: autumn, fall, winter, spring, summer' },
  ),
  z.enum(QuarterEnum),
  {
    decode: (val) => {
      const normalized = val.trim().toLowerCase()
      return quarterMap[normalized]
    },
    encode: (val) => reverseQuarterMap[val],
  },
)
export type Quarter = z.infer<typeof QuarterSchema>

export const WeekdaySchema = z.enum([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
])
export type Weekday = z.infer<typeof WeekdaySchema>

export const CodeNumberSchema = z.codec(
  z.string().refine(
    (val) => {
      const codeRegex = /^(\d+)(.*)$/
      return codeRegex.test(val)
    },
    {
      message: 'Invalid code format. Expected format: number followed by optional suffix',
    },
  ),
  z.object({
    number: z.number(),
    suffix: z.string().optional(),
  }),
  {
    decode: (val) => {
      const codeRegex = /^(\d+)(.*)$/
      const match = val.match(codeRegex)!
      const [, numberPart, suffixPart] = match

      return {
        number: parseInt(numberPart, 10),
        suffix: suffixPart.length > 0 ? suffixPart : undefined,
      }
    },
    encode: (obj) => {
      return `${obj.number}${obj.suffix ?? ''}`
    },
  },
)
export type CodeNumber = z.infer<typeof CodeNumberSchema>

export const CourseCodeSchema = z.object({
  subject: z.string().min(1),
  code: CodeNumberSchema,
})
export type CourseCode = z.infer<typeof CourseCodeSchema>
