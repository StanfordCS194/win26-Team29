import { z } from 'zod'

/** Accepts string or nested array (GPT sometimes returns [[]] or [["a","b"]]). Normalizes to string[]. */
const variantsSchema = z
  .array(z.union([z.string(), z.array(z.any())]))
  .transform((arr) => arr.flat(1).filter((x): x is string => typeof x === 'string'))

export const TagsResponseSchema = z.object({
  terms: z.array(
    z.object({
      term: z.string(),
      variants: variantsSchema,
    }),
  ),
})

export type TagsResponse = z.infer<typeof TagsResponseSchema>
