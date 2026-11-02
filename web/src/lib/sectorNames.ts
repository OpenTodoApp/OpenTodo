// The words of time sectors (OpenSpec change time-sectors, design D3): a sector
// named relative to the viewer's local date and first day of the week, the
// period's own name with its dates, and "From week 43" for a carried-over one.
// The rules are in sectors.ts (shared with internal/sector); this module only
// turns them into text in the interface language. Nothing here writes.
import { currentDateTime, formatDateRange, monthName, type ResolvedDateTime } from './dates'
import { msg, t, translatedMap } from './i18n'
import { formatPeriod, isCarried, nextOf, parseSector, periodRange, relativeName, resolvePhrase, SECTOR_WORDS, type Period, type SectorGroup, type SectorWord } from './sectors'
import type { UserPrefs } from './types'

/** The switch (design D7): only "on" is on; empty or any other value reads as off and is kept. */
export function timeSectorsOn(prefs: Partial<Pick<UserPrefs, 'time_sectors'>> | null | undefined): boolean {
  return prefs?.time_sectors === 'on'
}

const WORD_NAMES = translatedMap<string>({
  'this-week': msg('This week'), 'next-week': msg('Next week'),
  'this-month': msg('This month'), 'next-month': msg('Next month'),
  'this-quarter': msg('This quarter'), 'next-quarter': msg('Next quarter'),
})

const GROUP_NAMES = translatedMap<string>({ carried: msg('Carried over'), later: msg('Later') })

/** A relative word as a name: "Next week". */
export function sectorWordName(word: SectorWord): string {
  return WORD_NAMES[word]
}

/** A planning list group's heading: "Carried over", "This week", …, "Later". */
export function sectorGroupName(group: SectorGroup): string {
  return group === 'carried' || group === 'later' ? GROUP_NAMES[group] : WORD_NAMES[group]
}

/** A period by its own name: "Week 47", "January" (with the year outside `today`'s), "Q2 2027". */
export function periodName(p: Period, today: string): string {
  const otherYear = String(p.year) !== today.slice(0, 4)
  if (p.kind === 'week') return otherYear ? t('Week {n}, {year}', { n: p.n, year: p.year }) : t('Week {n}', { n: p.n })
  if (p.kind === 'month') return monthName(`${p.year}-${String(p.n).padStart(2, '0')}`, 'long', otherYear)
  return t('Q{n} {year}', { n: p.n, year: p.year })
}

/** A period's days, "2–8 Nov"; a month or a quarter by its first and last month. */
export function periodDates(p: Period): string {
  const { start, end } = periodRange(p)
  if (p.kind === 'week') return formatDateRange(start, end, { day: 'numeric', month: 'short' })
  if (p.kind === 'month') return formatDateRange(start, end, { day: 'numeric', month: 'short' })
  return formatDateRange(start, end, { month: 'short' })
}

export interface SectorLabel {
  /** The chip's text: "This week", "From week 43", "Week 47". */
  text: string
  /** The read-out name, with the period: "Time sector: Next week (week 45, 2–8 Nov)". */
  label: string
  /** Carried over: shown in the faint tone, never the overdue colour. */
  carried: boolean
}

/**
 * How a stored sector reads on the viewer's date (design D3), or null for none
 * and for a value that is not a period.
 */
export function sectorLabel(sector: string | null | undefined, today: string, p: ResolvedDateTime = currentDateTime()): SectorLabel | null {
  const period = parseSector(sector)
  if (!period || !sector) return null
  const own = periodName(period, today)
  const dates = periodDates(period)
  if (isCarried(sector, today, p.weekStart)) {
    const text = t('From {period}', { period: period.kind === 'week' ? t('week {n}', { n: period.n }) : own })
    return { text, label: t('Time sector: {name} ({dates}), carried over', { name: own, dates }), carried: true }
  }
  const word = relativeName(sector, today, p.weekStart)
  const text = word ? WORD_NAMES[word] : own
  return { text, label: t('Time sector: {name} ({dates})', { name: word ? `${text}, ${own}` : own, dates }), carried: false }
}

/** The quick choices of the Sector segment, each with its period and dates in muted text (design D6). */
export function sectorChoices(today: string, p: ResolvedDateTime = currentDateTime()): { word: SectorWord; sector: string; name: string; detail: string }[] {
  return SECTOR_WORDS.map((word) => {
    const sector = currentSector(word, today, p)
    const period = parseSector(sector)!
    return { word, sector, name: WORD_NAMES[word], detail: `${periodName(period, today)} · ${periodDates(period)}` }
  })
}

/** The sector a relative word means today for this viewer. */
export function currentSector(word: SectorWord, today: string, p: ResolvedDateTime = currentDateTime()): string {
  return resolvePhrase(word, today, p.weekStart)!
}

/** How many later periods the picker offers per kind (design D6, "Later…"). */
const LATER_COUNT: Record<Period['kind'], number> = { week: 10, month: 10, quarter: 6 }

/** The periods after next of a kind, for the "Later…" picker: the sector, its name and its dates. */
export function laterPeriods(kind: Period['kind'], today: string, p: ResolvedDateTime = currentDateTime()): { sector: string; name: string; detail: string }[] {
  let cur = parseSector(currentSector(`next-${kind}` as SectorWord, today, p))!
  const out: { sector: string; name: string; detail: string }[] = []
  for (let i = 0; i < LATER_COUNT[kind]; i++) {
    cur = nextOf(cur)
    out.push({ sector: formatPeriod(cur), name: periodName(cur, today), detail: periodDates(cur) })
  }
  return out
}
