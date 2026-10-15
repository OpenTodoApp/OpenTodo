// The Calendar destination remembers Day, Week or Month per device (OpenSpec
// changes ux-overhaul and month-and-timeline-views): `/calendar`, the sidebar
// item and the Day | Week | Month control all go through this.
export type CalendarMode = 'day' | 'week' | 'month'

const KEY = 'ot.calendar.mode'

export function readCalendarMode(): CalendarMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'week' || v === 'month' ? v : 'day'
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
