// The Calendar destination remembers Day or Week per device (OpenSpec change
// ux-overhaul, time-blocking "Day and Week calendar views"): `/calendar`, the
// sidebar item and the Day/Week control all go through this.
export type CalendarMode = 'day' | 'week'

const KEY = 'ot.calendar.mode'

export function readCalendarMode(): CalendarMode {
  try {
    return localStorage.getItem(KEY) === 'week' ? 'week' : 'day'
  } catch {
    return 'day'
  }
}

export function rememberCalendarMode(mode: CalendarMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}
