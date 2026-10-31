// The device switches of projected occurrences (OpenSpec change series-occurrences,
// design D4): "Show repeating occurrences" for the calendar's Day, Week and Month
// (on by default) and for Upcoming (off by default). Per device, never synced. Kept
// apart from the drawing code so the first load carries only the switches.
import { createStoredValue } from '../../lib/deviceStorage'
import { t } from '../../lib/i18n'
import { MenuItem } from '../../ui'

export const CALENDAR_PROJECTIONS_KEY = 'calendar.projections'
export const UPCOMING_PROJECTIONS_KEY = 'upcoming.projections'
/** Upcoming lists projections of this many days after today (design D4). */
export const UPCOMING_PROJECTION_DAYS = 14

const calendarOn = createStoredValue<boolean>(CALENDAR_PROJECTIONS_KEY, { parse: (raw) => raw !== '0', serialize: (on) => (on ? null : '0') }, { crossTab: true })
const upcomingOn = createStoredValue<boolean>(UPCOMING_PROJECTIONS_KEY, { parse: (raw) => raw === '1', serialize: (on) => (on ? '1' : null) }, { crossTab: true })

export const useCalendarProjectionsOn = (): boolean => calendarOn.use()
export const useUpcomingProjectionsOn = (): boolean => upcomingOn.use()
export const setCalendarProjections = (on: boolean): void => calendarOn.set(on)
export const setUpcomingProjections = (on: boolean): void => upcomingOn.set(on)

/** "Show repeating occurrences" in a page menu: the calendar's (Day, Week, Month) or Upcoming's. */
export function ProjectionsMenuItem({ surface }: { surface: 'calendar' | 'upcoming' }) {
  const calendar = useCalendarProjectionsOn()
  const upcoming = useUpcomingProjectionsOn()
  const on = surface === 'calendar' ? calendar : upcoming
  return (
    <MenuItem label={t('Show repeating occurrences')} icon="repeat" checked={on} data-projections-toggle={surface}
      description={t('Future dates of repeating tasks, read-only')}
      onSelect={() => (surface === 'calendar' ? setCalendarProjections(!on) : setUpcomingProjections(!on))} />
  )
}
