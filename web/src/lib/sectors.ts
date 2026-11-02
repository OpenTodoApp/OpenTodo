// Time sectors (OpenSpec change time-sectors): a task planned for a period
// rather than a day. The stored value is absolute, an ISO week `2026-W44`, a
// month `2026-11` or a quarter `2026-Q4`; everything relative (This week, Next
// month, carried over) is derived here from the viewer's local date and first
// day of the week, and never written.
//
// The Go twin is internal/sector; both run web/src/lib/sectors.vectors.json and
// must agree. Change them together. Pure functions, no imports, so the module
// stays a leaf the planning list, the rows, the filter and the parser share.

export type SectorKind = 'week' | 'month' | 'quarter'

export interface Period {
  kind: SectorKind
  year: number
  /** The week (1–53), month (1–12) or quarter (1–4). */
  n: number
}

/** The relative words a sector can be named with, in the planning list's order. */
export const SECTOR_WORDS = ['this-week', 'next-week', 'this-month', 'next-month', 'this-quarter', 'next-quarter'] as const
export type SectorWord = (typeof SECTOR_WORDS)[number]

/** The planning list's groups, in order (design D5). */
export const SECTOR_GROUPS = ['carried', ...SECTOR_WORDS, 'later'] as const
export type SectorGroup = (typeof SECTOR_GROUPS)[number]

const RE = /^(\d{4})-(?:W(\d{2})|(\d{2})|Q(\d))$/

// Calendar arithmetic on UTC dates, so no zone or DST ever shifts a day.
const DAY = 86_400_000
const toMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (iso: string, days: number) => toISO(toMs(iso) + days * DAY)
/** ISO weekday: 1 Monday … 7 Sunday. */
const isoDow = (iso: string) => ((new Date(toMs(iso)).getUTCDay() + 6) % 7) + 1
const pad = (n: number) => String(n).padStart(2, '0')

/** The ISO week a date falls in. */
export function isoWeekOf(iso: string): { year: number; week: number } {
  const thursday = addDays(iso, 4 - isoDow(iso))
  const year = +thursday.slice(0, 4)
  const week = Math.floor((toMs(thursday) - Date.UTC(year, 0, 1)) / DAY / 7) + 1
  return { year, week }
}

/** 52 or 53: the number of ISO weeks of a year (28 December is always in the last). */
export function isoWeeksIn(year: number): number {
  return isoWeekOf(`${year}-12-28`).week
}

/** The Monday of an ISO week. */
export function mondayOfWeek(year: number, week: number): string {
  const jan4 = `${year}-01-04`
  return addDays(jan4, 1 - isoDow(jan4) + (week - 1) * 7)
}

/** A stored sector as a period, or null when empty or invalid (years 2000–2999). */
export function parseSector(value: unknown): Period | null {
  if (typeof value !== 'string') return null
  const m = RE.exec(value)
  if (!m) return null
  const year = +m[1]
  if (year < 2000 || year > 2999) return null
  if (m[2] !== undefined) {
    const n = +m[2]
    return n >= 1 && n <= isoWeeksIn(year) ? { kind: 'week', year, n } : null
  }
  if (m[3] !== undefined) {
    const n = +m[3]
    return n >= 1 && n <= 12 ? { kind: 'month', year, n } : null
  }
  const n = +m[4]
  return n >= 1 && n <= 4 ? { kind: 'quarter', year, n } : null
}

/** Whether a value is a valid stored sector (the empty string is "none", not a sector). */
export function isSector(value: unknown): value is string {
  return parseSector(value) !== null
}

export function formatPeriod(p: Period): string {
  if (p.kind === 'week') return `${p.year}-W${pad(p.n)}`
  if (p.kind === 'month') return `${p.year}-${pad(p.n)}`
  return `${p.year}-Q${p.n}`
}

/** The first and last day of a period, YYYY-MM-DD. */
export function periodRange(p: Period): { start: string; end: string } {
  if (p.kind === 'week') {
    const start = mondayOfWeek(p.year, p.n)
    return { start, end: addDays(start, 6) }
  }
  const first = p.kind === 'month' ? p.n : (p.n - 1) * 3 + 1
  const months = p.kind === 'month' ? 1 : 3
  const start = `${p.year}-${pad(first)}-01`
  const next = first + months > 12 ? `${p.year + 1}-01-01` : `${p.year}-${pad(first + months)}-01`
  return { start, end: addDays(next, -1) }
}

/** Orders two periods of the same kind (negative when a is earlier). */
function compareSame(a: Period, b: Period): number {
  return a.year - b.year || a.n - b.n
}

/** The period after `p`, of the same kind. */
export function nextOf(p: Period): Period {
  const max = p.kind === 'week' ? isoWeeksIn(p.year) : p.kind === 'month' ? 12 : 4
  return p.n < max ? { ...p, n: p.n + 1 } : { kind: p.kind, year: p.year + 1, n: 1 }
}

/**
 * The viewer's current periods (design D3). This week is the ISO week holding the
 * Monday that falls inside the viewer's current week, so a Sunday-start week on
 * Sunday 1 November 2026 is `2026-W45`. `weekStart` is 0 (Sunday) to 6 (Saturday).
 */
export function currentPeriods(localDate: string, weekStart = 1): Record<SectorWord, string> {
  const ws = ((weekStart % 7) + 7) % 7
  const dow = isoDow(localDate) % 7 // 0 Sunday … 6 Saturday
  const start = addDays(localDate, -((dow - ws + 7) % 7))
  const monday = addDays(start, (1 - ws + 7) % 7)
  const w = isoWeekOf(monday)
  const week: Period = { kind: 'week', year: w.year, n: w.week }
  const year = +localDate.slice(0, 4)
  const monthN = +localDate.slice(5, 7)
  const month: Period = { kind: 'month', year, n: monthN }
  const quarter: Period = { kind: 'quarter', year, n: Math.floor((monthN - 1) / 3) + 1 }
  return {
    'this-week': formatPeriod(week),
    'next-week': formatPeriod(nextOf(week)),
    'this-month': formatPeriod(month),
    'next-month': formatPeriod(nextOf(month)),
    'this-quarter': formatPeriod(quarter),
    'next-quarter': formatPeriod(nextOf(quarter)),
  }
}

/** The sector a relative word means on the viewer's date, or null for an unknown word. */
export function resolvePhrase(word: string, localDate: string, weekStart = 1): string | null {
  const w = word.trim().toLowerCase().replace(/[\s_]+/g, '-') as SectorWord
  return SECTOR_WORDS.includes(w) ? currentPeriods(localDate, weekStart)[w] : null
}

/** The relative word a sector is named by on the viewer's date, or null (named by its period then). */
export function relativeName(sector: string, localDate: string, weekStart = 1): SectorWord | null {
  if (!parseSector(sector)) return null
  const cur = currentPeriods(localDate, weekStart)
  return SECTOR_WORDS.find((w) => cur[w] === sector) ?? null
}

/** Carried over (design D3): the period ended before the viewer's current period of its kind. */
export function isCarried(sector: string, localDate: string, weekStart = 1): boolean {
  const p = parseSector(sector)
  if (!p) return false
  const cur = currentPeriods(localDate, weekStart)
  const now = parseSector(cur[`this-${p.kind}` as SectorWord])!
  return compareSame(p, now) < 0
}

/**
 * The planning list group of a sector (design D5): carried, the relative word of its
 * own kind, else the first later group whose period holds the sector's first day
 * (a week two weeks out is in This month), else Later. Null for an invalid value.
 */
export function sectorGroup(sector: string, localDate: string, weekStart = 1): SectorGroup | null {
  const p = parseSector(sector)
  if (!p) return null
  if (isCarried(sector, localDate, weekStart)) return 'carried'
  const own = relativeName(sector, localDate, weekStart)
  if (own) return own
  const start = periodRange(p).start
  const cur = currentPeriods(localDate, weekStart)
  const order: SectorWord[] = ['this-month', 'next-month', 'this-quarter', 'next-quarter']
  for (const w of order) {
    const r = periodRange(parseSector(cur[w])!)
    if (start >= r.start && start <= r.end) return w
  }
  return 'later'
}

/** Sorts sectors by their first day, then week before month before quarter. */
export function compareSectors(a: string, b: string): number {
  const pa = parseSector(a)
  const pb = parseSector(b)
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0
  const sa = periodRange(pa).start
  const sb = periodRange(pb).start
  if (sa !== sb) return sa < sb ? -1 : 1
  const rank = { week: 0, month: 1, quarter: 2 }
  return rank[pa.kind] - rank[pb.kind]
}
