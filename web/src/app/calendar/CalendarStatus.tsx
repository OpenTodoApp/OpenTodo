// The status line of a calendar page header (time-blocking, calendar-feeds): placement
// mode in Day and Week, or how fresh the subscribed calendars are. Day, Week and the
// Plan (planner-view D1) import it from here.
import { formatTime as toHHMM } from '../../lib/calendar'
import type { eventsStatus } from '../../lib/calendarFeeds'
import { formatTime as formatWallTime } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { formatTime, minutesOf, type Placement } from './grid'

/** The header's status line: placement mode, or how fresh the subscribed calendars are. */
export function CalendarStatus({ placing = null, placingTask, status, online, fetchedAt }: {
  placing?: Placement | null
  placingTask?: Task
  status: ReturnType<typeof eventsStatus> | null
  online: boolean
  fetchedAt?: number
}) {
  if (placing) {
    return (
      <span role="status" className="rounded-control bg-success-soft px-2 py-0.5 text-meta text-on-success-soft">
        {t.rich('Placing <b>{title}</b> at {time} · arrows move · Enter places · Esc cancels', { title: placingTask?.title || t('task'), time: formatTime(placing.start), b: (chunks) => <strong>{chunks}</strong> })}
      </span>
    )
  }
  if (status === 'missing' && !online) return <span data-calendars-status="missing" className="text-meta text-muted">{t('Calendars unavailable offline for these days')}</span>
  if (fetchedAt !== undefined && (status === 'stale' || (status === 'fresh' && !online))) {
    return <span data-calendars-status="stale" className="text-meta text-muted">{t('Calendars as of {wallTime}', { wallTime: formatWallTime(toHHMM(minutesOf(fetchedAt))) })}</span>
  }
  return null
}
