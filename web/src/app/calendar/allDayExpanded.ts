// The days whose all-day strip is expanded past three items (OpenSpec change
// surfaces-v2, design D4, calendar-feeds "Events drawn in Day and Week"). Device
// state, never synced: a set of dates in localStorage, trimmed to the 60 most
// recent so it cannot grow without bound. Read through a store so every column
// follows a toggle at once.
import { createStoredValue } from '../../lib/deviceStorage'

export const ALL_DAY_KEY = 'calendar.allDayExpanded'
/** At most this many all-day items show before the "+N" control. */
export const ALL_DAY_CAP = 3
const KEEP = 60

const expanded = createStoredValue<ReadonlySet<string>>(ALL_DAY_KEY, {
  parse: (raw) => {
    try {
      const v = raw ? JSON.parse(raw) as unknown : []
      return new Set(Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : [])
    } catch {
      return new Set() // unreadable: start empty
    }
  },
  serialize: (set) => JSON.stringify([...set].sort().slice(-KEEP)),
})

/** Expands or collapses one day's all-day strip on this device. */
export function toggleAllDay(date: string): void {
  const next = new Set(expanded.get())
  if (next.has(date)) next.delete(date)
  else next.add(date)
  expanded.set(next)
}

/** The expanded days, live. */
export const useAllDayExpanded = expanded.use
