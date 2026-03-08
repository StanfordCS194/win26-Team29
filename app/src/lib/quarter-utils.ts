import type { Quarter } from '@/data/search/search.params'

const QUARTER_ORDER: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

export function getCurrentQuarter(): Quarter {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const mmdd = month * 100 + day

  if (mmdd >= 201 && mmdd < 415) return 'Spring'
  if (mmdd >= 415 && mmdd < 1015) return 'Autumn'
  return 'Winter'
}

export function getNextQuarter(current?: Quarter): Quarter {
  const q = current ?? getCurrentQuarter()
  const idx = QUARTER_ORDER.indexOf(q)
  return QUARTER_ORDER[(idx + 1) % QUARTER_ORDER.length]!
}
