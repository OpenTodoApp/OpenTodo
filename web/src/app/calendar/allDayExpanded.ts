// The days whose all-day strip is expanded past three items (OpenSpec change
// surfaces-v2, design D4, calendar-feeds "Events drawn in Day and Week"). Device
// state, never synced: a set of dates in localStorage, trimmed to the 60 most
// recent so it cannot grow without bound. Read through a store so every column
// follows a toggle at once.
import { useSyncExternalStore } from 'react'

export const ALL_DAY_KEY = 'calendar.allDayExpanded'
/** At most this many all-day items show before the "+N" control. */
export const ALL_DAY_CAP = 3
const KEEP = 60
const listeners = new Set<() => void>()
let cache: { raw: string | null; set: ReadonlySet<string> } = { raw: null, set: new Set() }

function read(): ReadonlySet<string> {
  let raw: string | null = null
  try { raw = localStorage.getItem(ALL_DAY_KEY) } catch { /* storage blocked: nothing expanded */ }
  if (raw === cache.raw) return cache.set
  let dates: string[] = []
  try { const v = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) dates = v.filter((d): d is string => typeof d === 'string') } catch { /* unreadable: start empty */ }
  cache = { raw, set: new Set(dates) }
  return cache.set
}

/** Expands or collapses one day's all-day strip on this device. */
export function toggleAllDay(date: string): void {
  const next = new Set(read())
  if (next.has(date)) next.delete(date)
  else next.add(date)
  const kept = [...next].sort().slice(-KEEP)
  try { localStorage.setItem(ALL_DAY_KEY, JSON.stringify(kept)) } catch { /* storage refused: the toggle does not stick */ }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The expanded days, live. */
export function useAllDayExpanded(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, read)
}
