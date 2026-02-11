import { PGTemporal } from '@db/db.ts'
import { Equal, Hash } from 'effect'

declare module '@js-temporal/polyfill' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Temporal {
    interface PlainDate extends Equal.Equal {
      [Equal.symbol]: (that: Equal.Equal) => boolean
      [Hash.symbol]: () => number
    }

    interface PlainDateTime extends Equal.Equal {
      [Equal.symbol]: (that: Equal.Equal) => boolean
      [Hash.symbol]: () => number
    }

    interface Instant extends Equal.Equal {
      [Equal.symbol]: (that: Equal.Equal) => boolean
      [Hash.symbol]: () => number
    }

    interface PlainTime extends Equal.Equal {
      [Equal.symbol]: (that: Equal.Equal) => boolean
      [Hash.symbol]: () => number
    }

    interface ZonedDateTime extends Equal.Equal {
      [Equal.symbol]: (that: Equal.Equal) => boolean
      [Hash.symbol]: () => number
    }
  }
}

// Effect Equal and Hash implementations for js-temporal
PGTemporal.PlainDate.prototype[Equal.symbol] = function (that: Equal.Equal): boolean {
  return that instanceof PGTemporal.PlainDate && this.equals(that)
}

PGTemporal.PlainDate.prototype[Hash.symbol] = function (): number {
  return Hash.string(this.toString())
}

PGTemporal.PlainDateTime.prototype[Equal.symbol] = function (that: Equal.Equal): boolean {
  return that instanceof PGTemporal.PlainDateTime && this.equals(that)
}

PGTemporal.PlainDateTime.prototype[Hash.symbol] = function (): number {
  return Hash.string(this.toString())
}

PGTemporal.Instant.prototype[Equal.symbol] = function (that: Equal.Equal): boolean {
  return that instanceof PGTemporal.Instant && this.equals(that)
}

PGTemporal.Instant.prototype[Hash.symbol] = function (): number {
  return Hash.string(this.toString())
}

PGTemporal.PlainTime.prototype[Equal.symbol] = function (that: Equal.Equal): boolean {
  return that instanceof PGTemporal.PlainTime && this.equals(that)
}

PGTemporal.PlainTime.prototype[Hash.symbol] = function (): number {
  return Hash.string(this.toString())
}

PGTemporal.ZonedDateTime.prototype[Equal.symbol] = function (that: Equal.Equal): boolean {
  return that instanceof PGTemporal.ZonedDateTime && this.equals(that)
}

PGTemporal.ZonedDateTime.prototype[Hash.symbol] = function (): number {
  return Hash.string(this.toString())
}

export { PGTemporal as EffectTemporal }
