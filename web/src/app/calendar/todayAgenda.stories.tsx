import type { Meta, StoryObj } from '@storybook/react-vite'
import { allDayEvents, eventBlocks } from '../../lib/calendar'
import type { CalendarEvent, CalendarSubscription } from '../../lib/types'
import { PageBody, PageHeader } from '../../ui'
import { withClock } from '../stories/fixtures'
import { TodayAgenda, type TodayCalendar } from './TodayAgenda'

// Core screen: Today's agenda of calendar events (OpenSpec change today-agenda) under
// a day head, as Today shows it before its list. The clock is frozen at 12:00, so the
// morning's events are dimmed; the data is given directly, without the device cache.
const meta: Meta = { title: 'Screens/Today agenda', decorators: [withClock] }
export default meta

const DAY = '2026-10-14'
const subs: CalendarSubscription[] = [
  { id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: 0 },
  { id: 'home', name: 'Family', color: '#16a34a', enabled: true, lastSuccessAt: 0 },
]
const ev = (id: string, sub: string, summary: string, start: string, end: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, subscriptionId: sub, uid: id, summary, location: '', allDay: false, free: false,
  start: { date: DAY, time: start }, end: { date: DAY, time: end }, ...more,
})
const events: CalendarEvent[] = [
  { ...ev('conf', 'work', 'Product conference', '', ''), allDay: true, start: { date: '2026-10-13' }, end: { date: '2026-10-16' } },
  { ...ev('bday', 'home', 'Mia’s birthday', '', ''), allDay: true, free: true, start: { date: DAY }, end: { date: '2026-10-15' } },
  ev('standup', 'work', 'Standup', '09:00', '09:15'),
  ev('review', 'work', 'Design review', '11:00', '12:00', { location: 'Room 4' }),
  ev('lunch', 'home', 'Lunch with Ana', '12:30', '13:30', { location: 'Café Central, Corso Italia 12' }),
  ev('focus', 'work', 'Focus time', '14:00', '16:00', { free: true }),
]

function calendar(fetchedAt: number): TodayCalendar {
  return {
    available: true, allDay: allDayEvents(events, DAY), timed: eventBlocks(events, DAY),
    subMap: new Map(subs.map((s) => [s.id, s])), status: 'fresh', fetchedAt,
  }
}

function Today({ online, fetchedAt }: { online: boolean; fetchedAt: number }) {
  return (
    <div className="-m-4 bg-canvas">
      <PageBody width="list">
        <PageHeader kind="day" title="Today" meta="Wednesday 14 October" sticky={false} />
        <TodayAgenda cal={calendar(fetchedAt)} online={online} />
      </PageBody>
    </div>
  )
}

/** All-day chips (one free), then the timed events: ended ones dimmed, a free one as an outline. */
export const Agenda: StoryObj = {
  render: () => <Today online fetchedAt={Date.now()} />,
}

/** Offline: the cached events with the calendar toolbar's "Calendars as of" line. */
export const Offline: StoryObj = {
  render: () => <Today online={false} fetchedAt={Date.now() - 2 * 60 * 60 * 1000} />,
}
