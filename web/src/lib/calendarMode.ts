// The Calendar destination remembers Day, Week, Month, Plan or Year per device (OpenSpec
// changes ux-overhaul, month-and-timeline-views, planner-view and year-view): `/calendar`,
// the sidebar item and the Day | Week | Month | Plan | Year control all go through this.
// Month's "Months shown" (year-view D1) is a device choice beside it, never synced.
import { createStoredValue, readEnum, writeString } from './deviceStorage'

export type CalendarMode = 'day' | 'week' | 'month' | 'plan' | 'year'

const KEY = 'ot.calendar.mode'

export function readCalendarMode(): CalendarMode {
  return readEnum<CalendarMode>(KEY, ['day', 'week', 'month', 'plan', 'year'], 'day')
}

export function rememberCalendarMode(mode: CalendarMode): void {
  writeString(KEY, mode) // private mode or blocked storage: the choice lasts for this page only
}

export type MonthsShown = 1 | 2 | 3 | 6
export const MONTHS_SHOWN: readonly MonthsShown[] = [1, 2, 3, 6]

/** The value stored under `ot.calendar.months`, 1 for anything else. */
export function parseMonthsShown(raw: string | null): MonthsShown {
  const n = Number(raw)
  return (MONTHS_SHOWN as readonly number[]).includes(n) ? (n as MonthsShown) : 1
}

/** The months Month stacks on this device, read from storage on each use (other tabs follow); blocked storage shows one. */
export const monthsShown = createStoredValue<MonthsShown>('ot.calendar.months', {
  parse: parseMonthsShown,
  serialize: (n) => (n === 1 ? null : String(n)),
}, { crossTab: true })
