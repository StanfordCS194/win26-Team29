// ── Group definitions ─────────────────────────────────────────────────────────

export const GRADING_GROUPS: { name: string; topLevel?: boolean; codes: string[] }[] = [
  {
    name: 'Standard',
    topLevel: true,
    codes: [
      'Letter (ABCD/NP)',
      'Letter or Credit/No Credit',
      'Credit / No Credit',
      'Credit/No Credit',
      'Satisfactory/No Credit',
    ],
  },
  {
    name: 'GSB',
    codes: ['GSB Letter Graded', 'GSB Pass/Fail', 'GSB Student Option LTR/PF'],
  },
  {
    name: 'Law',
    codes: [
      'Law Honors/Pass/Restrd Cr/Fail',
      'Law Mandatory Credit 3K',
      'Law Mandatory P/R/F',
      'Law Mixed H/P/R/F or MP/R/F',
      'Law Student Option NM/KE',
      'Law Student Option NM/KM',
    ],
  },
  {
    name: 'Medical',
    codes: [
      'MED Letter Graded',
      'Medical Option (Med-Ltr-CR/NC)',
      'Medical Satisfactory/No Credit',
      'Medical School MD Grades',
    ],
  },
  {
    name: 'Other',
    codes: ['NQF Scale', 'RO Satisfactory/Unsatisfactory', 'TGR'],
  },
]

// ── Token format ──────────────────────────────────────────────────────────────
// Group tokens are prefixed with `-` followed by the group name, e.g. `-GSB`.
// Grading codes never start with `-`, so the prefix is unambiguous.

const TOKEN_PREFIX = '-'

const TOKEN_TO_CODES = new Map<string, string[]>(
  GRADING_GROUPS.map((g) => [`${TOKEN_PREFIX}${g.name}`, g.codes]),
)

const CODE_TO_TOKEN = new Map<string, string>(
  GRADING_GROUPS.flatMap((g) => g.codes.map((c) => [c, `${TOKEN_PREFIX}${g.name}`])),
)

// ── Compression ───────────────────────────────────────────────────────────────

/**
 * If all codes of a group are present in `selected`, replace them with a single
 * group token (e.g. `-GSB`). Codes belonging to partially-selected groups pass
 * through unchanged.
 *
 * When `availableCodes` is provided, only requires the group's codes that exist
 * in `availableCodes` to be selected (so compression works when the DB returns
 * a subset for the selected year).
 */
export function compressGradingCodes(selected: string[], availableCodes?: string[]): string[] {
  const selectedSet = new Set(selected)
  const availableSet = availableCodes ? new Set(availableCodes) : null
  const result: string[] = []
  const consumed = new Set<string>()

  for (const group of GRADING_GROUPS) {
    const codesToCheck = availableSet != null ? group.codes.filter((c) => availableSet.has(c)) : group.codes
    const allSelected = codesToCheck.length > 0 && codesToCheck.every((c) => selectedSet.has(c))
    if (allSelected) {
      result.push(`${TOKEN_PREFIX}${group.name}`)
      for (const c of group.codes) consumed.add(c)
    }
  }

  for (const code of selected) {
    if (!consumed.has(code)) result.push(code)
  }

  return result
}

// ── Expansion ─────────────────────────────────────────────────────────────────

/**
 * Expand any `-GroupName` tokens in `codes` back to their member codes.
 * Non-token entries pass through unchanged. Duplicate codes are deduplicated.
 */
export function expandGradingTokens(codes: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  const push = (code: string) => {
    if (!seen.has(code)) {
      seen.add(code)
      result.push(code)
    }
  }

  for (const entry of codes) {
    const expansion = TOKEN_TO_CODES.get(entry)
    if (expansion != null) {
      for (const c of expansion) push(c)
    } else {
      push(entry)
    }
  }

  return result
}

// ── Label ─────────────────────────────────────────────────────────────────────

/**
 * Convert group tokens to human-readable labels; individual codes pass through.
 * e.g. `-GSB` → `GSB`, `-Standard` → `Standard`
 */
export function labelGradingTokens(tokens: string[]): string[] {
  return tokens.map((t) => (t.startsWith(TOKEN_PREFIX) ? t.slice(TOKEN_PREFIX.length) : t))
}

// Re-export for consumers that need to check whether a code belongs to a group
export { CODE_TO_TOKEN }
