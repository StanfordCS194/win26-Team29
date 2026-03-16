import type { Quarter } from '@/data/search/search.params'

const QUARTER_ORDER: Quarter[] = ['Autumn', 'Winter', 'Spring', 'Summer']

export function getCurrentQuarter(): Quarter {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const mmdd = month * 100 + day

  // Boundaries aligned with Stanford's academic calendar:
  // Winter: ~Jan 6 – Mar 21   → Dec 15 – Mar 21
  // Spring: ~Mar 28 – Jun 11  → Mar 22 – Jun 20
  // Summer: ~Jun 23 – Aug 18  → Jun 21 – Sep 21
  // Autumn: ~Sep 22 – Dec 13  → Sep 22 – Dec 14
  if (mmdd >= 322 && mmdd < 621) return 'Spring'
  if (mmdd >= 621 && mmdd < 922) return 'Summer'
  if (mmdd >= 922 && mmdd < 1215) return 'Autumn'
  return 'Winter'
}

export function getNextQuarter(current?: Quarter): Quarter {
  const q = current ?? getCurrentQuarter()
  const idx = QUARTER_ORDER.indexOf(q)
  return QUARTER_ORDER[(idx + 1) % QUARTER_ORDER.length]!
}
