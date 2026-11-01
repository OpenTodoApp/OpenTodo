// The "Calendars" toggle of the calendar headers (calendar-feeds "Events are read-only
// and can be hidden"): shows or hides the subscribed calendars' events on this device,
// in Day, Week, Plan, Month and Year alike (calendar-events-all-views). Absent while
// the user has no calendar.
import { setShowEvents } from '../../lib/calendarFeeds'
import { t } from '../../lib/i18n'
import { Button, Tooltip } from '../../ui'
import { act } from '../actionError'

export function CalendarsToggle({ shown, count }: { shown: boolean; count: number }) {
  if (count === 0) return null
  return (
    <Tooltip label={shown ? t('Hide other calendars on this device') : t('Show other calendars on this device')}>
      <Button variant="ghost" size="sm" icon="calendar-range" aria-pressed={shown} data-calendars-toggle
        className={shown ? 'bg-sunken dark:bg-raised' : 'text-muted'}
        onClick={() => act(setShowEvents(!shown))}>{t('Calendars')}</Button>
    </Tooltip>
  )
}
