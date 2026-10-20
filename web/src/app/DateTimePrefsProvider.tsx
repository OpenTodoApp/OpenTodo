// Date and time preferences in the UI (OpenSpec date-time-preferences, design D2):
// the provider watches the synced `user_prefs` row, publishes the resolved value
// as the formatters' module snapshot and through context, so a component that
// reads it with useDateTimeFormat() re-renders when a preference changes, on this
// device or by sync, without a reload. It also publishes the day start
// (day-boundary D3): `dayStart` in the context for useToday(), and the module
// snapshot (setDayStart) that logicalToday() and logicalDay() read by default.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useUserPrefsRow } from '../lib/localData'
import {
  currentDateTime, currentDayStart, formatDate, formatHour, formatInstant, formatTime, setDateTime, setDayStart, weekDays, weekStartOf,
  type DateStyle, type InstantStyle, type ResolvedDateTime,
} from '../lib/dates'
import { useLanguageVersion } from '../lib/i18n'
import { readDayStart, readUserPrefs, type DateTimePrefs } from '../lib/userPrefs'

interface DateTimeContextValue {
  prefs: DateTimePrefs
  resolved: ResolvedDateTime
  /** The day start in minutes after midnight (0: midnight). */
  dayStart: number
}

const DateTimeContext = createContext<DateTimeContextValue | null>(null)

export function DateTimePrefsProvider({ children }: { children: ReactNode }) {
  const row = useUserPrefsRow()
  const prefs = readUserPrefs(row)
  const dayStart = readDayStart(row)
  // The interface language decides what `system` means and the month names (app-localization D4).
  const lang = useLanguageVersion()
  const key = `${prefs.date_format}|${prefs.time_format}|${prefs.week_start}|${lang}|${dayStart}`
  // The snapshot is updated during render, before any child formats a date.
  const value = useMemo<DateTimeContextValue>(() => {
    setDayStart(dayStart)
    return { prefs, resolved: setDateTime(prefs), dayStart }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs is a new object every render; key holds every field it is made of
  }, [key])
  return <DateTimeContext.Provider value={value}>{children}</DateTimeContext.Provider>
}

/** The resolved preferences and formatters bound to them; re-renders the caller when a preference changes. */
export function useDateTimeFormat() {
  const ctx = useContext(DateTimeContext)
  const resolved = ctx?.resolved ?? currentDateTime()
  return useMemo(() => ({
    prefs: ctx?.prefs ?? null,
    resolved,
    dayStart: ctx?.dayStart ?? currentDayStart(),
    formatDate: (iso: string, style: DateStyle) => formatDate(iso, style, resolved),
    formatTime: (hhmm: string) => formatTime(hhmm, resolved),
    formatHour: (hour: number) => formatHour(hour, resolved),
    formatInstant: (ms: number, style: InstantStyle) => formatInstant(ms, style, resolved),
    weekStartOf: (iso: string) => weekStartOf(iso, resolved),
    weekDays: (iso: string) => weekDays(iso, resolved),
  }), [ctx, resolved])
}
