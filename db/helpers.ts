import { sql } from 'kysely'
import type { AliasedRawBuilder } from 'kysely'

type IsNullable<T> = null extends T ? true : undefined extends T ? true : false

type NullableKeys<R> = {
  [K in keyof R]: IsNullable<R[K]> extends true ? K : never
}[keyof R]

type NonNullableKeys<R> = {
  [K in keyof R]: IsNullable<R[K]> extends false ? K : never
}[keyof R]

type RequiredOverrides<R> =
  NullableKeys<R> extends never ? {} : Required<Pick<Record<keyof R, string>, NullableKeys<R>>>

type TypeOverrides<R> = RequiredOverrides<R> & Partial<Pick<Record<keyof R, string>, NonNullableKeys<R>>>

export function values<R extends Record<string, unknown>, A extends string>(
  records: R[],
  alias: A,
  ...args: NullableKeys<R> extends never
    ? [typeOverrides?: TypeOverrides<R>]
    : [typeOverrides: TypeOverrides<R>]
): AliasedRawBuilder<R, A> {
  const typeOverrides = args[0]

  // Assume there's at least one record and all records
  // have the same keys.
  const keys = Object.keys(records[0]) as Array<keyof R & keyof typeof typeOverrides>

  // Validate that all values for each key have the same type
  const keyTypes = new Map<keyof R, string>()

  for (const key of keys) {
    const override = typeOverrides?.[key]
    if (override) {
      // If there's a type override, skip validation for this key
      keyTypes.set(key, override)
      continue
    }

    const types = new Set<string>()
    let hasNonNullValue = false

    for (const record of records) {
      const value = record[key]
      if (value !== null && value !== undefined) {
        hasNonNullValue = true
        types.add(getPgType(value))
      }
    }

    if (!hasNonNullValue) {
      throw new Error(
        `All values for key "${String(key)}" are null or undefined. Cannot infer PostgreSQL type. Please provide a type override.`,
      )
    }

    if (types.size > 1) {
      throw new Error(
        `Inconsistent types for key "${String(key)}". Found types: ${Array.from(types).join(', ')}`,
      )
    }

    keyTypes.set(key, Array.from(types)[0])
  }

  // Transform the records into a list of lists such as
  // ($1, $2, $3), ($4, $5, $6)
  const values = sql.join(
    records.map(
      (r) =>
        sql`(${sql.join(
          keys.map((k) => {
            const pgType = keyTypes.get(k)!
            return sql`${sql.val(r[k])}::${sql.raw(pgType)}`
          }),
        )})`,
    ),
  )

  // Create the alias `v(id, v1, v2)` that specifies the table alias
  // AND a name for each column.
  const wrappedAlias = sql.ref(alias)
  const wrappedColumns = sql.join(keys.map(sql.ref))
  const aliasSql = sql`${wrappedAlias}(${wrappedColumns})`

  // Finally create a single `AliasedRawBuilder` instance of the
  // whole thing. Note that we need to explicitly specify
  // the alias type using `.as<A>` because we are using a
  // raw sql snippet as the alias.
  return sql<R>`(values ${values})`.as<A>(aliasSql)
}

function getPgType(value: NonNullable<unknown>): string {
  if (typeof value === 'string') {
    return 'text'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'numeric'
  }

  if (typeof value === 'bigint') {
    return 'bigint'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (Buffer.isBuffer(value)) {
    return 'bytea'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error('Cannot infer array type from empty array')
    }
    const firstElement = value[0]
    const elementType = getPgType(firstElement)
    return `${elementType}[]`
  }

  if (value instanceof Date) {
    return 'timestamptz'
  }

  // For Temporal types (if using Temporal polyfill)
  if (typeof value === 'object' && value !== null) {
    const ctorName = value.constructor?.name

    if (ctorName === 'Instant') return 'timestamptz'
    if (ctorName === 'PlainDate') return 'date'
    if (ctorName === 'PlainTime') return 'time'
    if (ctorName === 'PlainDateTime') return 'timestamp'
    if (ctorName === 'ZonedDateTime') return 'timestamptz'
  }

  // For JSON objects
  if (typeof value === 'object') {
    return 'jsonb'
  }

  throw new Error(`Unknown type: ${typeof value}`)
}
