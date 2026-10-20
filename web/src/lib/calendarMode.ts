// The Calendar destination remembers Day, Week, Month or Plan per device (OpenSpec
// changes ux-overhaul, month-and-timeline-views and planner-view): `/calendar`, the
// sidebar item and the Day | Week | Month | Plan control all go through this.
export type CalendarMode = 'day' | 'week' | 'month' | 'plan'

const KEY = 'ot.calendar.mode'

export function readCalendarMode(): CalendarMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'week' || v === 'month' || v === 'plan' ? v : 'day'
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
