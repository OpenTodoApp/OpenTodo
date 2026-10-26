// The Calendar destination remembers Day, Week, Month or Plan per device (OpenSpec
// changes ux-overhaul, month-and-timeline-views and planner-view): `/calendar`, the
// sidebar item and the Day | Week | Month | Plan control all go through this.
import { readEnum, writeString } from './deviceStorage'

export type CalendarMode = 'day' | 'week' | 'month' | 'plan'

const KEY = 'ot.calendar.mode'

export function readCalendarMode(): CalendarMode {
  return readEnum<CalendarMode>(KEY, ['day', 'week', 'month', 'plan'], 'day')
}

export function rememberCalendarMode(mode: CalendarMode): void {
  writeString(KEY, mode) // private mode or blocked storage: the choice lasts for this page only
}
