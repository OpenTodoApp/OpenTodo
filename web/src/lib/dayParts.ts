// A task's part of the day (OpenSpec change day-parts). Morning and Afternoon are
// task.day_part; Evening stays the evening flag, so old clients and integrations
// that only know This Evening keep working (design D1). A task's part is Evening
// when the flag is set, else its day_part. Every writer sets a part with
// `dayPartFields`, both fields in one batch, so per-field last-writer-wins
// converges on one part (D2). The Go side is internal/daypart.
import { db } from './db'
import { localDueOf } from './dates'
import { t } from './i18n'
import { mutate } from './ops'
import type { Task, UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export type DayPart = 'morning' | 'afternoon' | 'evening'
/** The parts in Today's order; `null` is Any time. */
export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening']

/** The part a task has: Evening when the flag is set, else its stored day_part; an unknown value reads as none. */
export function dayPartOf(task: Pick<Task, 'evening' | 'day_part'>): DayPart | null {
  if (task.evening) return 'evening'
  return task.day_part === 'morning' || task.day_part === 'afternoon' ? task.day_part : null
}

/** The fields that set `part` (null = Any time): never `evening: true` with a day_part. */
export function dayPartFields(part: DayPart | null): { day_part: 'morning' | 'afternoon' | null; evening: boolean } {
  return part === 'evening' ? { day_part: null, evening: true } : { day_part: part, evening: false }
}

/** The part of a wall-clock time "HH:MM": before 12:00 Morning, 12:00–17:59 Afternoon, from 18:00 Evening (fixed, D3). */
export function partOfTime(time: string): DayPart {
  if (time < '12:00') return 'morning'
  return time < '18:00' ? 'afternoon' : 'evening'
}

/**
 * Where Today places a task while day parts are on (D3): its part, else the part
 * of its due time in the viewer's zone, else none (the Today group).
 */
export function placedPart(task: Pick<Task, 'evening' | 'day_part' | 'due'>): DayPart | null {
  const own = dayPartOf(task)
  if (own) return own
  const time = localDueOf(task.due)?.time
  return time ? partOfTime(time) : null
}

/** The part's name as a heading or a chip ("Morning", "Afternoon", "Evening"). */
export function dayPartName(part: DayPart | null): string {
  switch (part) {
    case 'morning': return t('Morning')
    case 'afternoon': return t('Afternoon')
    case 'evening': return t('Evening')
    default: return t('Any time')
  }
}

/** The part as the lower-case word after a date ("Today · morning"), or null for none. */
export function dayPartWord(part: DayPart | null): string | null {
  switch (part) {
    case 'morning': return t('morning')
    case 'afternoon': return t('afternoon')
    case 'evening': return t('evening')
    default: return null
  }
}

/** Whether the account groups Today by part of the day; '' and unknown values read as off. */
export function dayPartsOn(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.day_parts === 'on'
}

/** The account's choice read now (one keyed read), for code outside React (the bar's add). */
export async function dayPartsPreferred(): Promise<boolean> {
  return dayPartsOn(await db.userPrefs.get(USER_PREFS_ID))
}

/** Turns day parts on or off for the account: one synced op, offline included. */
export function setDayParts(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { day_parts: on ? 'on' : 'off' })
}
