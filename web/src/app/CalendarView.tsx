// Day and Week time-blocking views (OpenSpec `time-blocking`). A pure projection of
// local tasks: a task with a due time is a block at that time, as long as its
// estimate; date-only tasks sit in each day's unscheduled lane. Every placement,
// by pointer or keyboard, is one `updateTask` call (an ordinary field op). Since
// web-component-structure the days come from lib/calendarDays, the live reads from
// lib/liveData, and the columns, agenda, planning list and keys live in ./calendar.
import { Button, MenuItem, PageBody, PageHeader } from '../ui'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { calendarTasks, formatTime as toHHMM, placementStart, weekDates, type GridPrefs } from '../lib/calendar'
import { calendarDays, calendarOrder, type DayData } from '../lib/calendarDays'
import { useOnline } from '../lib/online'
import { ensureEventsFor, eventsStatus, setShowEvents } from '../lib/calendarFeeds'
import { addDaysISO, dueFromView, formatDate, formatShort, formatTime as formatWallTime, viewedTask } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import { getTask, readGridPrefs, useCachedEventsWindow, useCalendarEvents, useCalendarSubscriptions, useGridPrefs, useLiveProjects, useShowEvents } from '../lib/liveData'
import { updateTask } from '../lib/ops'
import type { CalendarSubscription, Project, Task } from '../lib/types'
import { useCalendarDrag, type DragState, type DropTarget } from './calendarDrag'
import { setDueWithUndo } from './undoable'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { navigate } from './router'
import { CalendarRangeSwitch } from './CalendarRange'
import { placement as placementSignal } from './signals'
import { useWide } from '../ui'
import { closePanel, openPanel, setPanelTaskId, usePanelOccupantKey, usePanelTaskId } from './panel'
import { rememberCalendarMode } from '../lib/calendarMode'
import { useToday, useViewerZone } from './useViews'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { t } from '../lib/i18n'
import { act } from './actionError'
import { DayColumn, DayHeader, HourGutter } from './calendar/DayColumn'
import { formatTime, minutesOf, PX_PER_MIN, type Placement, type Preview } from './calendar/grid'
import { PLAN_PANEL, PlanPanel, type PlanActions } from './calendar/PlanPanel'
import { useCalendarKeys } from './calendar/useCalendarKeys'
import { WeekAgenda } from './calendar/WeekAgenda'

/** Live preferences of this device (Dexie meta, never synced); MonthView and the settings read them too. */
export { useGridPrefs }

function useNowMinutes(): number {
  const read = () => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** Subscribed calendars (calendar-feeds D8): the device cache, refreshed for the range on screen; hidden with the toolbar toggle (per device). */
function useCalendarFeeds(from: string, to: string) {
  useEffect(() => { void ensureEventsFor({ from, to }) }, [from, to])
  const eventsShown = useShowEvents()
  const events = useCalendarEvents()
  const subs = useCalendarSubscriptions()
  const win = useCachedEventsWindow()
  const subMap = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs])
  const visibleEvents = useMemo(() => (eventsShown ? events.filter((e) => subMap.get(e.subscriptionId)?.enabled !== false) : []), [eventsShown, events, subMap])
  const status = subs.length === 0 || !eventsShown ? null : eventsStatus(win, { from, to })
  return { eventsShown, subs, subMap, win, visibleEvents, status }
}

/** Placement mode (`s`): a ghost the keys move, placed with Enter. */
function usePlacement(dates: string[], today: string, prefs: GridPrefs, date: string | undefined, setSelectedId: (id: string) => void) {
  const [placing, setPlacing] = useState<Placement | null>(null)
  const startPlacing = useCallback((task: Task, onDate?: string, gridPrefs: GridPrefs = prefs) => {
    const d = onDate ?? (task.due?.date && dates.includes(task.due.date) ? task.due.date : dates.includes(today) ? today : dates[0])
    const now = new Date()
    setPlacing({ taskId: task.id, date: d, start: placementStart(task, d, today, now.getHours() * 60 + now.getMinutes(), gridPrefs) })
    setSelectedId(task.id)
  }, [dates, today, prefs, setSelectedId])

  // `s` from a list sends a task here (placement mode). Read the row and the preferences
  // directly: on first render the live queries have not delivered yet.
  const startRef = useRef(startPlacing)
  startRef.current = startPlacing
  useEffect(() => {
    const take = () => {
      const id = placementSignal.take()
      if (!id) return
      void Promise.all([getTask(id), readGridPrefs()]).then(([task, gridPrefs]) => {
        if (task && !task.deleted_at && !task.completed_at) startRef.current(viewedTask(task), date ?? today, gridPrefs)
      })
    }
    take()
    return placementSignal.subscribe(take)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- subscribe once; date/today are read when a placement request arrives
  return { placing, setPlacing, startPlacing }
}

export function CalendarView({ mode, date }: { mode: 'day' | 'week'; date?: string }) {
  const today = useToday()
  const nowMinutes = useNowMinutes()
  const anchor = date ?? today
  // The Week view starts on the preferred first day (date-time-preferences D5).
  const { resolved } = useDateTimeFormat()
  const dates = useMemo(() => (mode === 'day' ? [anchor] : weekDates(anchor, resolved.weekStart)), [mode, anchor, resolved.weekStart])
  const prefs = useGridPrefs()

  const projects = useLiveProjects()
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const rawTasks = useLiveTasks() ?? NO_TASKS
  // The grid shows every due in the viewer's zone (absolute-datetimes): zoned dues
  // are converted here and edits are converted back with dueFromView.
  const zone = useViewerZone()
  const allTasks = useMemo(() => rawTasks.map((tk) => viewedTask(tk, zone)), [rawTasks, zone])
  const rawMap = useMemo(() => new Map(rawTasks.map((item) => [item.id, item])), [rawTasks])
  const taskMap = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks])
  const shown = useMemo(() => calendarTasks(allTasks, projects, dates[0], dates[dates.length - 1]), [allTasks, projects, dates])

  const from = dates[0], to = dates[dates.length - 1]
  const feeds = useCalendarFeeds(from, to)
  const online = useOnline()
  const days = useMemo(() => calendarDays(dates, shown, feeds.visibleEvents, zone), [dates, shown, feeds.visibleEvents, zone])
  const order = useMemo(() => calendarOrder(days), [days])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const setOpenId = setPanelTaskId
  const { placing, setPlacing, startPlacing } = usePlacement(dates, today, prefs, date, setSelectedId)
  const [expanded, setExpanded] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Below 640 px the Week is a vertical agenda grouped by day (time-blocking "Week on a phone").
  const wide = useWide()
  // The Calendar destination remembers Day or Week on this device (ux-overhaul).
  useEffect(() => rememberCalendarMode(mode), [mode])

  // Start at the grid start hour; the hours before and after stay reachable by scrolling.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, prefs.startHour * 60 * PX_PER_MIN - 8)
  }, [prefs.startHour, mode])

  const commit = useCallback((taskId: string, target: DropTarget) => {
    const task = taskMap.get(taskId)
    if (!task) return
    const stored = rawMap.get(taskId)?.due
    if (target.type === 'slot') {
      const time = toHHMM(target.start)
      if (task.due?.date !== target.date || task.due?.time !== time) act(setDueWithUndo(taskId, dueFromView(stored, { date: target.date, time })))
    } else if (target.type === 'lane') {
      if (task.due?.date !== target.date || task.due?.time) act(setDueWithUndo(taskId, dueFromView(stored, { date: target.date })))
    } else if (target.estimate !== task.estimate_minutes) {
      act(updateTask(taskId, { estimate_minutes: target.estimate }))
    }
    setSelectedId(taskId)
  }, [taskMap, rawMap])

  const { drag, start: startDrag } = useCalendarDrag({ pxPerMinute: PX_PER_MIN, scroller, onDrop: commit })
  // The planning list lives in the shell's panel slot (time-blocking, app-shell): its
  // actions read the latest handlers through this ref.
  const planActions = useRef<PlanActions>({ onPointerDown: () => {}, onPlace: () => {}, onOpen: () => {} })
  const planOpen = usePanelOccupantKey() === PLAN_PANEL

  const goTo = useCallback((d: string) => navigate({ view: mode, date: d === today ? undefined : d }), [mode, today])
  /** Keep a moved task in view: follow it to another day or week. */
  const follow = useCallback((d: string) => {
    if (!dates.includes(d)) goTo(d)
  }, [dates, goTo])

  useCalendarKeys({
    mode, anchor, today, nowMinutes, prefs, days, order, taskMap, selectedId, setSelectedId, openId, setOpenId,
    placing, setPlacing, expanded, setExpanded, commit, startPlacing, goTo, follow,
  })

  // Keep the selection (or the placement ghost) on screen.
  useEffect(() => {
    const id = placing ? 'placement-ghost' : selectedId
    if (id) document.querySelector(`[data-cal-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId, placing])

  // A selected task hidden behind a "+N" marker opens that marker's list.
  useEffect(() => {
    if (!selectedId) return
    for (const d of days) {
      const o = d.layout.overflow.find((x) => x.ids.includes(selectedId))
      if (o) setExpanded(`${d.date}:${o.start}`)
    }
  }, [selectedId, days])

  const title = mode === 'day'
    ? formatDate(anchor, 'heading', resolved)
    : `${formatShort(dates[0])} – ${formatShort(dates[6])}`
  const dragTask = drag ? taskMap.get(drag.taskId) : undefined
  const placingTask = placing ? taskMap.get(placing.taskId) : undefined

  planActions.current = {
    onPointerDown: (e, id) => startDrag(e, { taskId: id, kind: 'move' }),
    onPlace: (id) => { const task = taskMap.get(id); if (task) startPlacing(task) },
    onOpen: (id) => setOpenId(id),
  }
  const togglePlan = () => (planOpen ? closePanel() : openPanel(PLAN_PANEL, () => <PlanPanel actions={planActions} />))
  const select = (id: string) => setSelectedId(id)
  const open = (id: string) => { setSelectedId(id); setOpenId(id) }
  const step = (dir: 1 | -1) => goTo(addDaysISO(anchor, (mode === 'day' ? 1 : 7) * dir))

  return (
    <PageBody width="full" flush className="flex h-full select-none flex-col" data-calendar-page={mode}>
        <PageHeader title={title} help="calendar"
          meta={<CalendarStatus placing={placing} placingTask={placingTask} status={feeds.status} online={online} fetchedAt={feeds.win?.fetchedAt} />}
          actions={<>
            {feeds.subs.length > 0 && (
              <Button variant="ghost" size="sm" icon="calendar-range" aria-pressed={feeds.eventsShown} data-calendars-toggle
                title={feeds.eventsShown ? t('Hide other calendars on this device') : t('Show other calendars on this device')}
                className={feeds.eventsShown ? 'bg-sunken dark:bg-raised' : 'text-muted'}
                onClick={() => act(setShowEvents(!feeds.eventsShown))}>{t('Calendars')}</Button>
            )}
            <span className="flex items-center" role="group" aria-label={t('Range')}>
              <Button variant="ghost" size="sm" icon="chevron-left" aria-label={mode === 'day' ? t('Previous day') : t('Previous week')} onClick={() => step(-1)} />
              <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
              <Button variant="ghost" size="sm" icon="chevron-right" aria-label={mode === 'day' ? t('Next day') : t('Next week')} onClick={() => step(1)} />
            </span>
            <CalendarRangeSwitch mode={mode} date={date} />
          </>}
          overflow={<MenuItem label={planOpen ? t('Hide the planning list') : t('Plan from a list')} icon="list" description={t('Drag tasks onto a time, or press s on one')} onSelect={togglePlan} />} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

        {/* Focusable, so the grid scrolls with the keyboard even when no block is in view (axe scrollable-region-focusable). */}
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          data-calendar-scroller data-scroll-x tabIndex={0} role="region" aria-label={mode === 'week' ? t('Week calendar') : t('Day calendar')}>
          {mode === 'week' && !wide ? (
            <WeekAgenda days={days} today={today} prefs={prefs} tasks={shown} taskMap={taskMap} projectMap={projectMap} selectedId={selectedId}
              onSelect={select} onOpen={open} />
          ) : (
            <CalendarGrid mode={mode} days={days} today={today} nowMinutes={nowMinutes} prefs={prefs} shown={shown} taskMap={taskMap} projectMap={projectMap}
              subMap={feeds.subMap} zone={zone} selectedId={selectedId} expanded={expanded} setExpanded={setExpanded} drag={drag} dragTask={dragTask}
              placing={placing} placingTask={placingTask} onSelect={select} onOpen={open} onDragStart={startDrag} />
          )}
        </div>
      </div>

      {drag && dragTask && (
        <div className="pointer-events-none fixed z-50 max-w-56 truncate rounded-control bg-accent px-2 py-1 text-meta text-on-accent shadow-2" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {dragTask.title || t('Untitled')}
          {drag.target?.type === 'slot' && ` · ${formatTime(drag.target.start)}`}
          {drag.target?.type === 'lane' && ` · ${t('unscheduled')}`}
          {drag.target?.type === 'resize' && ` · ${formatMinutes(drag.target.estimate)}`}
        </div>
      )}
    </PageBody>
  )
}

/** The header's status line: placement mode, or how fresh the subscribed calendars are. */
function CalendarStatus({ placing, placingTask, status, online, fetchedAt }: {
  placing: Placement | null
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

/** The Day or Week grid: a sticky header (day name, capacity, unscheduled lane) over the hour columns. */
function CalendarGrid({ mode, days, today, nowMinutes, prefs, shown, taskMap, projectMap, subMap, zone, selectedId, expanded, setExpanded, drag, dragTask, placing, placingTask, onSelect, onOpen, onDragStart }: {
  mode: 'day' | 'week'
  days: DayData[]
  today: string
  nowMinutes: number
  prefs: GridPrefs
  shown: Task[]
  taskMap: Map<string, Task>
  projectMap: Map<string, Project>
  subMap: Map<string, CalendarSubscription>
  zone?: string
  selectedId: string | null
  expanded: string | null
  setExpanded: (key: string | null) => void
  drag: DragState | null
  dragTask?: Task
  placing: Placement | null
  placingTask?: Task
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: ReturnType<typeof useCalendarDrag>['start']
}) {
  /** The ghost of a drag, a resize or a placement on this day. */
  const previewFor = (d: DayData): Preview | null => {
    if (drag && dragTask && drag.target?.type === 'slot' && drag.target.date === d.date) {
      return { id: 'drag-ghost', start: drag.target.start, length: dragTask.estimate_minutes ?? 30, title: dragTask.title }
    }
    const resized = drag && dragTask && drag.target?.type === 'resize' && dragTask.due?.date === d.date ? d.blocks.get(dragTask.id) : undefined
    if (drag?.target?.type === 'resize' && dragTask && resized) return { id: 'drag-ghost', start: resized.start, length: drag.target.estimate, title: dragTask.title }
    if (placing && placingTask && placing.date === d.date) return { id: 'placement-ghost', start: placing.start, length: placingTask.estimate_minutes ?? 30, title: placingTask.title }
    return null
  }
  return (
    <div className="min-w-full" style={{ width: mode === 'week' ? 'max(100%, 56rem)' : undefined }}>
      {/* Sticky header: day name, capacity and the unscheduled lane of each column. */}
      <div className="sticky top-0 z-20 flex border-b border-default bg-surface">
        <div className="w-12 shrink-0 pt-1 text-right text-hint text-faint" aria-hidden>
          <span className="pr-1">{t('all day')}</span>
        </div>
        {days.map((d) => (
          <DayHeader key={d.date} day={d} today={today} tasks={shown} prefs={prefs} showName={mode === 'week'} selectedId={selectedId} subMap={subMap} zone={zone}
            laneTarget={drag?.target?.type === 'lane' && drag.target.date === d.date} onSelect={onSelect} onOpen={onOpen}
            onPointerDown={(e, id) => onDragStart(e, { taskId: id, kind: 'move' })} projectMap={projectMap} />
        ))}
      </div>

      <div className="flex">
        <HourGutter />
        {days.map((d) => (
          <DayColumn key={d.date} day={d} prefs={prefs} isToday={d.date === today} nowMinutes={nowMinutes} taskMap={taskMap} projectMap={projectMap}
            subMap={subMap} zone={zone} selectedId={selectedId} draggingId={drag?.taskId ?? null} expanded={expanded} setExpanded={setExpanded}
            preview={previewFor(d)} onSelect={onSelect} onOpen={onOpen} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  )
}
