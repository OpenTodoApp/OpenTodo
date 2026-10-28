// The day's schedule at the bottom of the sidebar (OpenSpec change sidebar-schedule,
// issue 536): the time now and what is still ahead today, timed tasks and calendar
// events in start order, pinned under the sidebar's scroller so it stays in sight
// whatever page and task are open. It folds like a sidebar group, closed by default and
// remembered on the device; it never scrolls on its own (interface budget), so it lists
// a few items and links the rest to the Day calendar.
import { useMemo, useState } from 'react'
import { blockFor, calendarTasks, formatTime as toHHMM } from '../../lib/calendar'
import { formatTime as formatWallTime, viewedTask } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useLiveProjects } from '../../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../../lib/liveTasks'
import { readString, writeString } from '../../lib/deviceStorage'
import type { CalendarEvent, Task } from '../../lib/types'
import { hueFor, Icon, SIDEBAR_HEADING } from '../../ui'
import { openTaskPanel } from '../panel'
import { navigate } from '../router'
import { useToday, useViewerZone } from '../useViews'
import { AgendaEvent, useTodayCalendar } from './TodayAgenda'
import { useNowMinutes } from './useNowMinutes'

const OPEN_KEY = 'ot.sidebar.group.schedule'
/** Items listed before "N more today" (the panel has no scroller of its own). */
export const SCHEDULE_ROWS = 5

export type ScheduleItem =
  | { kind: 'task'; id: string; start: number; end: number; task: Task }
  | { kind: 'event'; id: string; start: number; end: number; event: CalendarEvent }

/** Today's timed tasks and events that have not ended by `now`, in start order (tasks first on a tie). */
export function scheduleAhead(tasks: readonly Task[], events: readonly { id: string; start: number; end: number; event: CalendarEvent }[], now: number): ScheduleItem[] {
  const items: ScheduleItem[] = []
  for (const task of tasks) {
    const b = blockFor(task)
    if (b) items.push({ kind: 'task', id: task.id, start: b.start, end: b.end, task })
  }
  for (const e of events) items.push({ kind: 'event', id: e.id, start: e.start, end: e.end, event: e.event })
  return items
    .filter((i) => i.end > now)
    .sort((a, b) => a.start - b.start || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1))
}

const time = (minutes: number) => formatWallTime(toHHMM(minutes))

export function SidebarSchedule() {
  const [open, setOpenState] = useState(() => readString(OPEN_KEY) === '1')
  const setOpen = (v: boolean) => { setOpenState(v); writeString(OPEN_KEY, v ? '1' : '0') } // device state only
  return (
    <section aria-label={t('Schedule', { context: 'sidebar' })} className="shrink-0 border-t border-soft px-3 pb-1" data-sidebar-schedule>
      <div className={`flex items-center justify-between px-2 pt-2 pb-1 ${SIDEBAR_HEADING}`}>
        <button type="button" className="flex min-h-6 items-center gap-1 rounded-chip uppercase hover:text-muted focus-visible:text-muted" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />{t('Schedule', { context: 'sidebar' })}
        </button>
      </div>
      {open && <ScheduleBody />}
    </section>
  )
}

function ScheduleBody() {
  const today = useToday()
  const zone = useViewerZone()
  const now = useNowMinutes()
  const projects = useLiveProjects()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const cal = useTodayCalendar(true, false, today, zone)
  const colours = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects])
  const items = useMemo(() => {
    const tasks = calendarTasks(rawTasks.map((tk) => viewedTask(tk, zone)), projects, today, today)
    return scheduleAhead(tasks, cal.timed, now)
  }, [rawTasks, zone, projects, today, cal.timed, now])
  const shown = items.slice(0, SCHEDULE_ROWS)
  const later = items.length - shown.length
  return (
    <div className="space-y-1 px-1 pb-1" data-schedule-body>
      <p className="px-1 text-meta text-muted tabular-nums" data-schedule-now>{t('Now {time}', { time: time(Math.min(now, 24 * 60 - 1)) })}</p>
      {shown.length === 0
        ? <p className="px-1 text-meta text-faint" data-schedule-empty>{t('Nothing else scheduled today.')}</p>
        : <ul className="space-y-0.5">{shown.map((i) => <li key={i.id}><ScheduleRow item={i} now={now} colour={i.kind === 'task' && i.task.project_id ? colours.get(i.task.project_id) : undefined} subName={i.kind === 'event' ? cal.subMap.get(i.event.subscriptionId)?.name : undefined} zone={zone} cal={cal} /></li>)}</ul>}
      <button type="button" onClick={() => navigate({ view: 'day' })} data-schedule-calendar
        className="flex w-full items-center gap-1 rounded-control px-1 py-0.5 text-left text-meta text-muted hover:bg-hover hover:text-default">
        <span className="min-w-0 flex-1 truncate">{later > 0 ? t('{n} more today', { n: later }) : t('Open the calendar')}</span>
        <Icon name="arrow-right" size="xs" />
      </button>
    </div>
  )
}

function ScheduleRow({ item, now, colour, subName, zone, cal }: {
  item: ScheduleItem
  now: number
  colour?: string
  subName?: string
  zone?: string
  cal: ReturnType<typeof useTodayCalendar>
}) {
  const current = item.start <= now
  const when = <span className="w-11 shrink-0 tabular-nums text-faint">{time(item.start)}</span>
  const mark = current ? t('Now') : undefined
  if (item.kind === 'event') {
    const ev = item.event
    return (
      <AgendaEvent ev={ev} sub={cal.subMap.get(ev.subscriptionId)} zone={zone} data={{ 'data-schedule-event': ev.id, 'data-current': current || undefined }}
        className={`flex w-full items-center gap-2 rounded-control px-1 py-0.5 text-meta hover:bg-hover ${current ? 'bg-selected text-strong' : ev.free ? 'text-muted' : 'text-default'}`}
        extra={[subName, ev.free && t('Shown as free'), mark]}>
        {when}
        <span aria-hidden className={ev.free ? 'ui-block-dot invisible' : 'ui-block-dot'} />
        <span className="min-w-0 flex-1 truncate">{ev.summary || t('Busy')}</span>
      </AgendaEvent>
    )
  }
  return (
    <button type="button" onClick={() => openTaskPanel(item.id)} data-schedule-task={item.id} data-current={current || undefined} data-hue={hueFor(colour)}
      className={`flex w-full items-center gap-2 rounded-control px-1 py-0.5 text-left text-meta hover:bg-hover ${current ? 'bg-selected text-strong' : 'text-default'}`}>
      {when}
      <span aria-hidden className="ui-block-dot" />
      <span className="min-w-0 flex-1 truncate">{item.task.title || t('Untitled')}</span>
      {mark && <span className="sr-only">{`, ${mark}`}</span>}
    </button>
  )
}
