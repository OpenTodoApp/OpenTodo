// Date and time preferences in the UI (OpenSpec date-time-preferences, design D2):
// the provider watches the synced `user_prefs` row, publishes the resolved value
// as the formatters' module snapshot and through context, so a component that
// reads it with useDateTimeFormat() re-renders when a preference changes, on this
// device or by sync, without a reload.
import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { db } from '../lib/db'
import {
  currentDateTime, formatDate, formatHour, formatInstant, formatTime, setDateTime, weekDays, weekStartOf,
  type DateStyle, type InstantStyle, type ResolvedDateTime,
} from '../lib/dates'
import { readUserPrefs, USER_PREFS_ID, type DateTimePrefs } from '../lib/userPrefs'

interface DateTimeContextValue {
  prefs: DateTimePrefs
  resolved: ResolvedDateTime
}

const DateTimeContext = createContext<DateTimeContextValue | null>(null)

export function DateTimePrefsProvider({ children }: { children: ReactNode }) {
  const row = useLiveQuery(() => db.userPrefs.get(USER_PREFS_ID), [])
  const prefs = readUserPrefs(row)
  const key = `${prefs.date_format}|${prefs.time_format}|${prefs.week_start}`
  // The snapshot is updated during render, before any child formats a date.
  const value = useMemo<DateTimeContextValue>(() => ({ prefs, resolved: setDateTime(prefs) }), [key])
  return <DateTimeContext.Provider value={value}>{children}</DateTimeContext.Provider>
}

/** The resolved preferences and formatters bound to them; re-renders the caller when a preference changes. */
export function useDateTimeFormat() {
  const ctx = useContext(DateTimeContext)
  const resolved = ctx?.resolved ?? currentDateTime()
  return useMemo(() => ({
    prefs: ctx?.prefs ?? null,
    resolved,
    formatDate: (iso: string, style: DateStyle) => formatDate(iso, style, resolved),
    formatTime: (hhmm: string) => formatTime(hhmm, resolved),
    formatHour: (hour: number) => formatHour(hour, resolved),
    formatInstant: (ms: number, style: InstantStyle) => formatInstant(ms, style, resolved),
    weekStartOf: (iso: string) => weekStartOf(iso, resolved),
    weekDays: (iso: string) => weekDays(iso, resolved),
  }), [ctx, resolved])
}
