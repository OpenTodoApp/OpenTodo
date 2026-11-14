// The "Calendars" toggle of the calendar headers (calendar-feeds "Events are read-only
// and can be hidden"): shows or hides the subscribed calendars' events on this device,
// in Day, Week, Plan, Month and Year alike (calendar-events-all-views). Absent while
// the user has no calendar. Below 768 px it is an item of the page's menu, so the row
// under the phone bar holds only the range and the view (phone-calendar-chrome).
import { setShowEvents } from '../../lib/calendarFeeds'
import { t } from '../../lib/i18n'
import { Button, DESKTOP_HEADER_QUERY, MenuItem, Tooltip, useMediaQuery } from '../../ui'
import { act } from '../actionError'

export function CalendarsToggle({ shown, count, menu = false }: { shown: boolean; count: number; menu?: boolean }) {
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  if (count === 0 || desktop === menu) return null
  if (menu) return <MenuItem label={t('Calendars')} icon="calendar-range" checked={shown} data-calendars-toggle onSelect={() => act(setShowEvents(!shown))} />
  return (
    <Tooltip label={shown ? t('Hide other calendars on this device') : t('Show other calendars on this device')}>
      <Button variant="ghost" size="sm" icon="calendar-range" aria-pressed={shown} data-calendars-toggle
        className={shown ? 'bg-sunken dark:bg-raised' : 'text-muted'}
        onClick={() => act(setShowEvents(!shown))}>{t('Calendars')}</Button>
    </Tooltip>
  )
}
