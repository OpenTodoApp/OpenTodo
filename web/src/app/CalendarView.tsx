// Day and Week time-blocking views (OpenSpec `time-blocking`). A pure projection of
// local tasks: a task with a due time is a block at that time, as long as its
// estimate; date-only tasks sit in each day's unscheduled lane. Every placement,
// by pointer or keyboard, is one `updateTask` call (an ordinary field op). Since
// web-component-structure the days come from lib/calendarDays, the live reads from
// lib/liveData, and the columns, agenda, planning list and keys live in ./calendar.
import { Button, DESKTOP_HEADER_QUERY, MenuItem, PageBody, Tooltip, useMediaQuery } from '../ui'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { calendarTasks, DEFAULT_BLOCK_MINUTES, formatTime as toHHMM, placementStart, weekDates, type GridPrefs } from '../lib/calendar'
import { fitInFrame, frameTarget, framesByDate, useFrames, type PlacedFrame } from '../lib/frames'
import { clampSlotMinutes, slotAt, slotKey, slotName, type SlotView } from '../lib/slots'
import { calendarDays, calendarOrder, type DayData } from '../lib/calendarDays'
import { useOnline } from '../lib/online'
import { setShowEvents } from '../lib/calendarFeeds'
import { addDaysISO, dueFromView, formatDate, formatShort, viewedTask } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import { getTask, readGridPrefs, useCalendarShowCompleted, useGridPrefs, useLiveProjects } from '../lib/liveData'
import { updateTask } from '../lib/ops'
import type { CalendarSubscription, Task } from '../lib/types'
import { useCalendarDrag, type DragState, type DropTarget } from './calendarDrag'
import { rescheduleWithUndo, setDueWithUndo, spanWithUndo } from './undoable'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { CalendarRangeSwitch } from './CalendarRange'
import { placement as placementSignal } from './signals'
import { useWide } from '../ui'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { rememberCalendarMode } from '../lib/calendarMode'
import { useToday, useViewerZone } from './useViews'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { t } from '../lib/i18n'
import { act } from './actionError'
import { DayColumn, DayHeader, HourGutter } from './calendar/DayColumn'
import { formatTime, PX_PER_MIN, type Placement, type Preview } from './calendar/grid'
import { usePlanActions, usePlanPanel, type PlanActions } from './calendar/PlanPanel'
import { useCalendarKeys } from './calendar/useCalendarKeys'
import { WeekAgenda } from './calendar/WeekAgenda'
import { requestFrames } from './calendar/framesRequest'
import { CalendarPageHeader, useCalendarChrome, useDrawn } from './calendar/useCalendarChrome'
import { useCalendarGo } from './calendar/scope'
import type { AddGestures, HueOf } from './calendar/DayColumn'
import { CalendarCompletedToggle } from './calendar/CalendarCompletedToggle'
import { commitSlotDrop, newSlotFor, useSlotIndex, useSlotViews } from './calendar/useCalendarSlots'
import { CalendarStatus } from './calendar/CalendarStatus'
import { useCalendarFeeds } from './calendar/useCalendarFeeds'
import { meetingsByDay, type DayMeetings } from './calendar/meetingCapacity'
import { useNowMinutes } from './calendar/useNowMinutes'
import { useReplanPreview, type ReplanPreviewState } from './calendar/useReplanPreview'
import type { ProjectionHue, ReplanGhosts } from './calendar/DayColumn'
import { commitProjectionDrop, useCalendarProjections } from './calendar/projections'
import { bandLayout, startExtend, uniqueSpans, usePreloadSpanDrag, useSpanEditable } from './calendar/spanModel'
import { ALL_DAY_CAP, useAllDayExpanded } from './calendar/allDayExpanded'

// The re-plan bar and sheet load only when someone re-plans (replan-the-day).
const ReplanPreview = lazy(() => import('./calendar/ReplanPreview'))
// Span bars load when a span is on screen (multi-day-tasks).
const SpanBand = lazy(() => import('./calendar/SpanBand'))

/** Live preferences of this device (Dexie meta, never synced); MonthView and the settings read them too. */
export { useGridPrefs }

/**
 * Plan from this frame (calendar-frames D4): the first free 15-minute start inside the
 * target occurrence that holds the task (30 minutes without an estimate) around the
 * day's other timed tasks and busy events; null without a target on screen or a fit.
 */
function frameFit(task: Task, days: readonly DayData[]): { date: string; start: number } | null {
  const target = frameTarget.get()
  const day = target ? days.find((d) => d.date === target.date) : undefined
  if (!target || !day) return null
  const busy = [...[...day.blocks.values()].filter((b) => b.id !== task.id), ...[...day.events.values()].filter((e) => !e.event.free)]
  const start = fitInFrame(target, busy, task.estimate_minutes || DEFAULT_BLOCK_MINUTES)
  return start === null ? null : { date: target.date, start }
}

/** Placement mode (`s`): a ghost the keys move, placed with Enter. */
function usePlacement(dates: string[], today: string, prefs: GridPrefs, date: string | undefined, setSelectedId: (id: string) => void, inFrame: (task: Task) => { date: string; start: number } | null) {
  const [placing, setPlacing] = useState<Placement | null>(null)
  const startPlacing = useCallback((task: Task, onDate?: string, gridPrefs: GridPrefs = prefs) => {
    if (task.completed_at) return
    // Plan from this frame (calendar-frames D4): the first free start inside the frame that fits.
    const framed = onDate ? null : inFrame(task)
    if (framed) {
      setPlacing({ taskId: task.id, date: framed.date, start: framed.start })
      setSelectedId(task.id)
      return
    }
    const d = onDate ?? (task.due?.date && dates.includes(task.due.date) ? task.due.date : dates.includes(today) ? today : dates[0])
    const now = new Date()
    setPlacing({ taskId: task.id, date: d, start: placementStart(task, d, today, now.getHours() * 60 + now.getMinutes(), gridPrefs) })
    setSelectedId(task.id)
  }, [dates, today, prefs, setSelectedId, inFrame])

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
  const showCompleted = useCalendarShowCompleted()

  const projects = useLiveProjects()
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const liveTasks = useLiveTasks()
  const rawTasks = liveTasks ?? NO_TASKS
  // The grid shows every due in the viewer's zone (absolute-datetimes): zoned dues
  // are converted here and edits are converted back with dueFromView.
  const zone = useViewerZone()
  const allTasks = useMemo(() => rawTasks.map((tk) => viewedTask(tk, zone)), [rawTasks, zone])
  const rawMap = useMemo(() => new Map(rawTasks.map((item) => [item.id, item])), [rawTasks])
  const taskMap = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks])
  const chrome = useCalendarChrome(allTasks, projects, { projections: true }) // Colour by, the filter, the project scope, adding with the pointer (calendar-clarity)
  const shown = useMemo(() => calendarTasks(allTasks, projects, dates[0], dates[dates.length - 1], showCompleted), [allTasks, projects, dates, showCompleted])
  const { drawn, hidden, deadlines } = useDrawn(chrome, shown, allTasks, projects, dates[0], dates[dates.length - 1]) // capacity counts `shown`, the grid draws `drawn` (D4)

  const from = dates[0], to = dates[dates.length - 1]
  const feeds = useCalendarFeeds(from, to)
  const online = useOnline()
  // Slots (calendar-slots): one block per slot with the tasks it shows, which are not drawn again.
  const { slotViews, obstacles } = useSlotViews(dates, taskMap, today)
  const { projections, hue: projectionHue } = useCalendarProjections({ raw: rawTasks, viewed: taskMap, projects, keeps: chrome.keeps, hueOf: chrome.color.hueOf, today, from, to, zone })
  const days = useMemo(() => calendarDays(dates, drawn, feeds.visibleEvents, zone, slotViews, projections), [dates, drawn, feeds.visibleEvents, zone, slotViews, projections])
  const { slotIndex, heldBy } = useSlotIndex(days)
  const order = useMemo(() => calendarOrder(days), [days])
  // Frames (calendar-frames): background bands of the shown days, never part of the order or capacity.
  const frameRows = useFrames()
  const frames = useMemo(() => framesByDate(frameRows, dates), [frameRows, dates])
  const inFrame = useCallback((task: Task) => frameFit(task, days), [days])
  // Busy event minutes per day, when this device counts meetings (meeting-aware-capacity).
  const meetings = useMemo(() => meetingsByDay(dates, feeds.visibleEvents, {
    count: prefs.countEvents, eventsShown: feeds.eventsShown, subscriptions: feeds.subs.length, win: feeds.win, online, zone,
  }), [dates, feeds.visibleEvents, prefs.countEvents, feeds.eventsShown, feeds.subs.length, feeds.win, online, zone])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const setOpenId = setPanelTaskId
  const { placing, setPlacing, startPlacing } = usePlacement(dates, today, prefs, date, setSelectedId, inFrame)
  const [expanded, setExpanded] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Below 640 px the Week is a vertical agenda grouped by day (time-blocking "Week on a phone").
  const wide = useWide()
  // The Calendar destination remembers Day or Week on this device (ux-overhaul).
  useEffect(() => rememberCalendarMode(mode), [mode])

  // Start at the grid start hour; the hours before and after stay reachable by scrolling.
  // Only the time grid: the phone agenda is a list of days and starts at its first day.
  useLayoutEffect(() => {
    if (!scroller.current) return
    const agenda = mode === 'week' && !wide
    scroller.current.scrollTop = agenda ? 0 : Math.max(0, prefs.startHour * 60 * PX_PER_MIN - 8)
  }, [prefs.startHour, mode, wide])

  /** The planning-list task being placed with the keys, to give focus back to the list after. */
  const placeFrom = useRef<{ id: string; next: string | null; placed: boolean } | null>(null)
  const commit = useCallback((taskId: string, target: DropTarget) => {
    const task = taskMap.get(taskId)
    if (task?.completed_at) return
    const stored = rawMap.get(taskId)?.due
    // Slots (calendar-slots D3, D5): a slot moved or resized, a task dropped on one, a row dragged out.
    if (commitSlotDrop(taskId, target, { slotIndex, heldBy, task, stored, zone })) {
      if (target.type !== 'into-slot') setSelectedId(taskId)
      return
    }
    if (!task) return
    if (placeFrom.current?.id === taskId) placeFrom.current.placed = true
    if (target.type === 'into-slot') return
    if (target.type === 'slot') {
      const time = toHHMM(target.start)
      if (task.due?.date !== target.date || task.due?.time !== time) act(setDueWithUndo(taskId, dueFromView(stored, { date: target.date, time })))
    } else if (target.type === 'lane') {
      if (task.due?.date !== target.date || task.due?.time) act(setDueWithUndo(taskId, dueFromView(stored, { date: target.date })))
    } else if (target.type === 'resize-start') {
      // The upper edge: a new start and the estimate that keeps the end, one change with Undo (GitHub issue 355).
      const time = toHHMM(target.start)
      if (task.due?.time !== time || target.estimate !== task.estimate_minutes) act(rescheduleWithUndo(taskId, dueFromView(stored, { date: target.date, time })!, target.estimate))
    } else if (target.estimate !== task.estimate_minutes) {
      act(updateTask(taskId, { estimate_minutes: target.estimate }))
    }
    setSelectedId(taskId)
  }, [taskMap, rawMap, slotIndex, heldBy, zone])

  useEffect(() => {
    const from = placeFrom.current
    if (placing || !from) return
    placeFrom.current = null
    const list = document.querySelector('[data-panel-frame="calendar-plan"]')
    const item = (id: string | null) => (id ? list?.querySelector<HTMLElement>(`[data-tray-task="${id}"]`) : null)
    const back = (from.placed ? item(from.next) ?? item(from.id) : item(from.id)) ?? list?.querySelector<HTMLElement>('[data-tray-task]') ?? scroller.current
    back?.focus({ preventScroll: true })
  }, [placing])

  const { drag, start } = useCalendarDrag({ pxPerMinute: PX_PER_MIN, scroller, onDrop: (id, target) => { if (!commitProjectionDrop(id, target, toHHMM)) commit(id, target) } })
  const startDrag = useCallback<typeof start>((event, info) => {
    if (!taskMap.get(info.taskId)?.completed_at) start(event, info)
  }, [taskMap, start])
  // The planning list lives in the shell's panel slot (time-blocking, app-shell): its
  // actions read the latest handlers through this ref.
  const planActions = useRef<PlanActions>({ onPointerDown: () => {}, onPlace: () => {}, onOpen: () => {} })
  usePlanActions(planActions)
  const { planOpen, togglePlan } = usePlanPanel()

  const go = useCalendarGo()
  const goTo = useCallback((d: string) => go(mode, d === today ? undefined : d), [go, mode, today])
  /** Keep a moved task in view: follow it to another day or week. */
  const follow = useCallback((d: string) => {
    if (!dates.includes(d)) goTo(d)
  }, [dates, goTo])

  // Re-plan the rest of the day (replan-the-day): the entry, the live proposal, the preview.
  const rp = useReplanPreview({ today, dates, nowMinutes, tasks: allTasks, rawMap, projects, projectMap, prefs, events: feeds.visibleEvents, obstacles,
    eventsUsed: feeds.eventsShown && feeds.subs.length > 0, win: feeds.win, online, zone, loaded: liveTasks !== undefined, goTo })
  // Where the header has its own row the bar sits in its lead line and the grid shows ghosts; below, a bottom sheet (design D8).
  const desktopHead = useMediaQuery(DESKTOP_HEADER_QUERY)
  const previewing = !!rp.proposal
  // While the preview is open dragging and placing wait (design D4).
  const dragStart: typeof startDrag = useCallback((...args) => { if (!previewing) startDrag(...args) }, [previewing, startDrag])

  useCalendarKeys({
    mode, anchor, today, nowMinutes, prefs, days, order, taskMap, selectedId, setSelectedId, openId, setOpenId, canEdit: useSpanEditable(),
    placing, setPlacing, expanded, setExpanded, commit, startPlacing, goTo, follow, slots: slotIndex,
    replan: previewing ? { apply: rp.apply, cancel: rp.cancel } : null,
    // `q` adds on the focused day without a time (calendar-clarity D2).
    onQuickAdd: (d) => chrome.add.add({ date: d }),
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
  const dragSlot = drag ? slotIndex.get(drag.taskId) : undefined
  // Placing over a slot: Shift+Enter adds the task to it (calendar-slots D7).
  const placingSlot = placing ? slotAt(slotViews.get(placing.date), placing.start) : null
  /** New slot (calendar-slots "Create slots"): the focused day, the next free quarter hour, 30 minutes. */
  const newSlotHere = () => act(newSlotFor({ selectedDate: selectedId ? (taskMap.get(selectedId)?.due?.date ?? slotIndex.get(selectedId)?.slot.date) : null,
    dates, days, today, nowMinutes, startHour: prefs.startHour, zone }))
  const placingTask = placing ? taskMap.get(placing.taskId) : undefined

  // `s` on a task in the planning list (GitHub issue 352): the grid takes the keys
  // (arrows move the ghost, Enter places, Esc cancels), then focus goes back to the list:
  // to the next task after Enter, to the same one after Esc.
  planActions.current = {
    onPointerDown: (e, id) => dragStart(e, { taskId: id, kind: 'move' }),
    onPlace: (id) => {
      const task = taskMap.get(id)
      if (!task || task.completed_at || previewing) return
      const row = document.querySelector(`[data-tray-task="${id}"]`)?.closest('li')
      const next = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>('[data-tray-task]')?.dataset.trayTask ?? null
      placeFrom.current = { id, next, placed: false }
      startPlacing(task)
      scroller.current?.focus({ preventScroll: true })
    },
    onOpen: (id) => setOpenId(id),
    onEscape: () => { if (!placing) return false; setPlacing(null); return true },
  }
  const select = (id: string) => setSelectedId(id), open = (id: string) => { setSelectedId(id); setOpenId(id) }
  const step = (dir: 1 | -1) => goTo(addDaysISO(anchor, (mode === 'day' ? 1 : 7) * dir))
  const { color: { hueOf } } = chrome, gestures: AddGestures | undefined = previewing ? undefined : chrome.add

  const status = previewing && desktopHead
    ? <Suspense fallback={null}><ReplanPreview variant="bar" {...previewProps(rp, taskMap, today)} /></Suspense>
    : rp.missed > 0 && !placing ? <span className="inline-flex max-w-full items-center gap-3">
      <CalendarStatus status={feeds.status} online={online} fetchedAt={feeds.win?.fetchedAt} />
      <ReplanEntry count={rp.missed} onStart={rp.start} />
    </span>
      : <CalendarStatus placing={placing} placingTask={placingTask} placingSlot={placingSlot ? slotName(placingSlot.slot) : undefined} status={feeds.status} online={online} fetchedAt={feeds.win?.fetchedAt} />
  const meta = chrome.chip ? <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-2">{chrome.chip}{status}</span> : status
  const overflow = <>
    <CalendarCompletedToggle shown={showCompleted} menu />
    <MenuItem label={planOpen ? t('Hide the planning list') : t('Plan from a list')} icon="list" description={t('Drag tasks onto a time, or press s on one')} onSelect={() => chrome.plan(planOpen, togglePlan)} />
    {rp.missed > 0 && !previewing && <MenuItem label={t('Re-plan the rest of the day')} icon="calendar-clock" data-replan-item onSelect={rp.start} />}
    <MenuItem label={t('Frames…')} icon="rows-2" description={t('Shade the hours you keep for one kind of work')} data-frames-item onSelect={() => requestFrames()} />
    <MenuItem label={t('New slot')} icon="layers" description={t('One block for several small tasks')} data-new-slot onSelect={newSlotHere} />
    {chrome.overflow}
  </>
  const rangeActions = <>
            {feeds.subs.length > 0 && (
              <Tooltip label={feeds.eventsShown ? t('Hide other calendars on this device') : t('Show other calendars on this device')}>
                <Button variant="ghost" size="sm" icon="calendar-range" aria-pressed={feeds.eventsShown} data-calendars-toggle
                  className={feeds.eventsShown ? 'bg-sunken dark:bg-raised' : 'text-muted'}
                  onClick={() => act(setShowEvents(!feeds.eventsShown))}>{t('Calendars')}</Button>
              </Tooltip>
            )}
            <span className="flex items-center" role="group" aria-label={t('Range')}>
              <Button variant="ghost" size="sm" icon="chevron-left" aria-label={mode === 'day' ? t('Previous day') : t('Previous week')} onClick={() => step(-1)} />
              <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
              <Button variant="ghost" size="sm" icon="chevron-right" aria-label={mode === 'day' ? t('Next day') : t('Next week')} onClick={() => step(1)} />
            </span>
            <CalendarCompletedToggle shown={showCompleted} />
            <CalendarRangeSwitch mode={mode} date={date} />
  </>

  return (
    <PageBody width="full" flush className="flex h-full select-none flex-col" data-calendar-page={mode}>
        <CalendarPageHeader chrome={chrome} title={title} meta={meta} actions={rangeActions} overflow={overflow} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

        {/* Focusable, so the grid scrolls with the keyboard even when no block is in view (axe scrollable-region-focusable). */}
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          data-calendar-scroller data-scroll-x tabIndex={0} role="region" aria-label={mode === 'week' ? t('Week calendar') : t('Day calendar')}>
          {mode === 'week' && !wide ? (
            <WeekAgenda days={days} today={today} prefs={prefs} tasks={shown} meetings={meetings} frames={frames} taskMap={taskMap} hueOf={hueOf} projectionHue={projectionHue} deadlines={deadlines} selectedId={selectedId}
              onSelect={select} onOpen={open} onAdd={(d) => chrome.add.add({ date: d })} />
          ) : (
            <CalendarGrid mode={mode} days={days} today={today} nowMinutes={nowMinutes} prefs={prefs} shown={shown} meetings={meetings} frames={frames} taskMap={taskMap} rawMap={rawMap} hueOf={hueOf} projectionHue={projectionHue} deadlines={deadlines} hidden={hidden} gestures={gestures} dragSlot={dragSlot}
              subMap={feeds.subMap} zone={zone} selectedId={selectedId} expanded={expanded} setExpanded={setExpanded} drag={drag} dragTask={dragTask}
              placing={placing} placingTask={placingTask} replanFor={previewing && desktopHead ? rp.ghostsFor : undefined} onSelect={select} onOpen={open} onDragStart={dragStart} />
          )}
        </div>
      </div>

      {previewing && !desktopHead && <Suspense fallback={null}><ReplanPreview variant="sheet" {...previewProps(rp, taskMap, today)} /></Suspense>}

      {chrome.element}
      {drag && (dragTask || dragSlot) && (
        <div className="pointer-events-none fixed z-50 max-w-56 truncate rounded-control bg-accent px-2 py-1 text-meta text-on-accent shadow-2" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {dragSlot ? slotName(dragSlot.slot) : dragTask!.title || t('Untitled')}
          {drag.target?.type === 'into-slot' && ` · ${slotName(slotIndex.get(slotKey(drag.target.slotId))?.slot ?? { title: '' })}`}
          {drag.target?.type === 'slot' && ` · ${formatTime(drag.target.start)}`}
          {drag.target?.type === 'lane' && ` · ${t('unscheduled')}`}
          {drag.target?.type === 'resize' && ` · ${formatMinutes(drag.target.estimate)}`}
          {drag.target?.type === 'resize-start' && ` · ${formatTime(drag.target.start)} · ${formatMinutes(drag.target.estimate)}`}
        </div>
      )}
    </PageBody>
  )
}

/** "3 blocks behind · Re-plan" in the header's lead line (replan-the-day D4). */
function ReplanEntry({ count, onStart }: { count: number; onStart: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1" data-replan-entry>
      <span>{t('{n, plural, one {# block behind} other {# blocks behind}}', { n: count })}</span>
      <span aria-hidden>·</span>
      <Button variant="ghost" size="sm" className="px-1 py-0 text-accent" onClick={onStart} data-replan-start>{t('Re-plan')}</Button>
    </span>
  )
}

function previewProps(rp: ReplanPreviewState, taskMap: Map<string, Task>, today: string) {
  return {
    proposal: rp.proposal!, taskMap, today, choice: rp.choice, onChoice: rp.setChoice,
    calendarsUnavailable: rp.calendarsUnavailable, onApply: rp.apply, onCancel: rp.cancel,
  }
}

function CalendarGrid({ mode, days, today, nowMinutes, prefs, shown, meetings, frames, taskMap, rawMap, hueOf, projectionHue, deadlines, hidden, gestures, subMap, zone, selectedId, expanded, setExpanded, drag, dragTask, dragSlot, placing, placingTask, replanFor, onSelect, onOpen, onDragStart }: {
  /** The stored rows by id: span writes keep the due's time and zone (multi-day-tasks). */
  rawMap: Map<string, Task>
  /** The slot being dragged or resized (calendar-slots D5). */
  dragSlot?: SlotView
  mode: 'day' | 'week'
  days: DayData[]
  today: string
  nowMinutes: number
  prefs: GridPrefs
  shown: Task[]
  meetings: Map<string, DayMeetings> | null
  frames: Map<string, PlacedFrame[]>
  taskMap: Map<string, Task>
  hueOf: HueOf
  projectionHue: ProjectionHue
  /** Deadline markers per date (calendar-clarity D1). */
  deadlines: Map<string, Task[]>
  /** Tasks the filter hides per date. */
  hidden: Map<string, number>
  gestures?: AddGestures
  subMap: Map<string, CalendarSubscription>
  zone?: string
  selectedId: string | null
  expanded: string | null
  setExpanded: (key: string | null) => void
  drag: DragState | null
  dragTask?: Task
  placing: Placement | null
  placingTask?: Task
  /** The re-plan preview's ghosts of a day, while it is open on the grid. */
  replanFor?: (date: string) => ReplanGhosts | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: ReturnType<typeof useCalendarDrag>['start']
}) {
  /** The ghost of a drag, a resize or a placement on this day. */
  const previewFor = (d: DayData): Preview | null => {
    if (drag && dragSlot) {
      const title = slotName(dragSlot.slot)
      if (drag.target?.type === 'slot' && drag.target.date === d.date) return { id: 'drag-ghost', start: drag.target.start, length: dragSlot.end - dragSlot.start, title }
      if (drag.target?.type === 'resize' && dragSlot.slot.date === d.date) return { id: 'drag-ghost', start: dragSlot.start, length: clampSlotMinutes(drag.target.estimate), title }
      return null
    }
    if (drag && dragTask && drag.target?.type === 'slot' && drag.target.date === d.date) {
      return { id: 'drag-ghost', start: drag.target.start, length: dragTask.estimate_minutes ?? 30, title: dragTask.title }
    }
    const resized = drag && dragTask && drag.target?.type === 'resize' && dragTask.due?.date === d.date ? d.blocks.get(dragTask.id) : undefined
    if (drag?.target?.type === 'resize' && dragTask && resized) return { id: 'drag-ghost', start: resized.start, length: drag.target.estimate, title: dragTask.title }
    if (drag?.target?.type === 'resize-start' && dragTask && drag.target.date === d.date) return { id: 'drag-ghost', start: drag.target.start, length: drag.target.estimate, title: dragTask.title }
    if (placing && placingTask && placing.date === d.date) return { id: 'placement-ghost', start: placing.start, length: placingTask.estimate_minutes ?? 30, title: placingTask.title }
    return null
  }
  // Spans (multi-day-tasks D3): one band across the columns, between the day names and the all-day strip.
  const dates = days.map((d) => d.date)
  const spans = uniqueSpans(days.map((d) => d.spans))
  const allDayOpen = useAllDayExpanded()
  const { pieces: cappedPieces, hiddenOn } = bandLayout(dates, spans, ALL_DAY_CAP)
  const spanRowsOn = (date: string) => cappedPieces.filter((p) => p.first <= date && date <= p.last).length
  const editable = useSpanEditable()
  usePreloadSpanDrag(true)
  const extend = (e: React.PointerEvent, task: Task) => {
    if (editable(task)) startExtend(e, rawMap.get(task.id) ?? task, (patch) => { act(spanWithUndo(task.id, patch)); onSelect(task.id) })
  }
  const header = (d: DayData, part: 'all' | 'head' | 'body') => (
    <DayHeader key={d.date} part={part} day={d} today={today} tasks={shown} meetings={meetings?.get(d.date) ?? null} prefs={prefs} showName={mode === 'week'} selectedId={selectedId} subMap={subMap} zone={zone}
      laneTarget={drag?.target?.type === 'lane' && drag.target.date === d.date} onSelect={onSelect} onOpen={onOpen}
      onPointerDown={(e, id) => onDragStart(e, { taskId: id, kind: 'move' })} hueOf={hueOf} projectionHue={projectionHue}
      deadlines={deadlines.get(d.date)} hidden={hidden.get(d.date) ?? 0} gestures={gestures}
      spanRows={spanRowsOn(d.date)} spanHidden={hiddenOn.get(d.date) ?? 0} onExtend={extend} />
  )
  const gutter = (label: boolean) => (
    <div className="w-12 shrink-0 pt-1 text-right text-hint text-faint" aria-hidden>
      {label && <span className="pr-1">{t('all day')}</span>}
    </div>
  )
  return (
    <div className="min-w-full" style={{ width: mode === 'week' ? 'max(100%, 56rem)' : undefined }}>
      {/* Sticky header: day name, capacity, the span band, the all-day strip and the unscheduled lane of each column. */}
      {spans.length === 0 ? (
        <div className="sticky top-0 z-20 flex border-b border-default bg-surface">
          {gutter(true)}
          {days.map((d) => header(d, 'all'))}
        </div>
      ) : (
        <div className="sticky top-0 z-20 border-b border-default bg-surface" data-span-header>
          <div className="flex">{gutter(true)}{days.map((d) => header(d, 'head'))}</div>
          <div className="flex">
            {gutter(false)}
            <Suspense fallback={null}><SpanBand days={dates} spans={spans} today={today} variant={mode === 'day' ? 'day' : 'week'} maxLanes={dates.some((d) => allDayOpen.has(d)) ? Infinity : ALL_DAY_CAP}
              selectedId={selectedId} hueOf={hueOf} projectionHue={projectionHue} drags onSelect={onSelect} onOpen={onOpen} stored={(id) => rawMap.get(id)}
              columnLines className="min-w-0 flex-1 pt-1" /></Suspense>
          </div>
          <div className="flex">{gutter(false)}{days.map((d) => header(d, 'body'))}</div>
        </div>
      )}

      <div className="flex">
        <HourGutter />
        {days.map((d) => (
          <DayColumn key={d.date} day={d} prefs={prefs} isToday={d.date === today} isPast={d.date < today} nowMinutes={nowMinutes} taskMap={taskMap} hueOf={hueOf} projectionHue={projectionHue} gestures={gestures}
            subMap={subMap} zone={zone} selectedId={selectedId} draggingId={drag?.taskId ?? null} slotDrop={drag?.target?.type === 'into-slot' ? drag.target.slotId : null} expanded={expanded} setExpanded={setExpanded}
            preview={previewFor(d)} replan={replanFor?.(d.date)} frames={frames.get(d.date)} onSelect={onSelect} onOpen={onOpen} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  )
}
