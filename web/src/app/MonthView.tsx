// The Month view (OpenSpec change month-and-timeline-views, month-view spec): a
// six-week grid of due dates, a pure projection of local tasks like Day and Week.
// Moving a task, by drag onto a day or with the arrows, is one due edit that keeps
// its time and zone; `q` adds a task due on the focused day. Works offline. A device
// may stack 2, 3 or 6 months (year-view D1); a phone always shows one. Loads on first use.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, EmptyState, MenuItem, MenuSeparator, PageBody, useMediaQuery } from '../ui'
import { calendarTasks, eventsByDay, nudgeDue, type DayEvents, type EventBlock } from '../lib/calendar'
import { MONTHS_SHOWN, monthsShown, rememberCalendarMode } from '../lib/calendarMode'
import { addDaysISO, dueFromView, viewedTask, formatDateParts, formatDateRange, monthName } from '../lib/dates'
import { getTask, useMembershipMap, useProjects } from '../lib/localData'
import { beginDrag } from '../lib/dnd'
import { formatMinutes } from '../lib/duration'
import { addMonthsISO, stackedMonths, visibleRows } from '../lib/month'
import { updateTask } from '../lib/ops'
import { canEditTasks, roleOf } from '../lib/sharing'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { slotsByDate, useSlots } from '../lib/slots'
import type { CalendarEvent, Task } from '../lib/types'
import { EventRow } from './CalendarEvents'
import { CalendarsToggle } from './calendar/CalendarsToggle'
import { CalendarStatus } from './calendar/CalendarStatus'
import { CalendarRangeSwitch } from './CalendarRange'
import { useCalendarShowCompleted, useGridPrefs } from '../lib/liveData'
import { CalendarCompletedToggle } from './calendar/CalendarCompletedToggle'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { usePlanActions, usePlanPanel, type PlanActions } from './calendar/PlanPanel'
import { CalendarPageHeader, useCalendarChrome, useDrawn } from './calendar/useCalendarChrome'
import { useCalendarGo } from './calendar/scope'
import { DeadlineMarker } from './calendar/DeadlineMarker'
import { keysOf } from '../lib/shortcuts'
import { useShortcutScope } from './shortcuts'
import { setDueWithUndo } from './undoable'
import { useToday, useViewerZone } from './useViews'
import { t } from '../lib/i18n'
import { act, reportActionError } from './actionError'
import { meetingsByDay } from './calendar/meetingCapacity'
import { useCalendarFeeds } from './calendar/useCalendarFeeds'
import { useOnline } from '../lib/online'
import { useResetOnChange } from '../lib/useResetOnChange'
import { columnEntries } from '../lib/plan'
import { projectionsByDate, type Projection } from '../lib/occurrences'
import { isProjectionTarget, ProjectedItem, useCalendarProjections } from './calendar/projections'
import { moveSpanPatch, spanCovers, spanOf } from '../lib/span'
import { MonthRow } from './calendar/MonthRow'
import { monthOrder, monthSpanKeys, useMonthSpans } from './calendar/monthSpans'
import { CELL_ROWS, MonthWeek, NO_PROJECTIONS, type CellEntry, type MonthCells } from './calendar/MonthWeek'

export { addMonthsISO }

/**
 * A cell's rows: its tasks and projected occurrences ordered together by time, priority
 * and position (series-occurrences D3, as Plan's columns), then the deadlines of tasks
 * due elsewhere (calendar-clarity D1), then the subscribed calendars' events, all-day
 * ones first, then the timed ones by start (calendar-events-all-views); all take part
 * in "+N more", so tasks keep the first rows.
 */
function cellEntries(tasks: readonly Task[], deadlines: readonly Task[], projected: readonly Projection[] = NO_PROJECTIONS, date = '', zone?: string, events?: DayEvents): CellEntry[] {
  const rows: CellEntry[] = projected.length === 0
    ? tasks.map((task) => ({ kind: 'task' as const, task }))
    : columnEntries(tasks, projected, date, zone).map((e) => (e.kind === 'task' ? { kind: 'task' as const, task: e.task } : { kind: 'projected' as const, projection: e.projection }))
  return [...rows, ...deadlines.map((task) => ({ kind: 'deadline' as const, task })), ...eventEntries(events)]
}

function eventEntries(events?: DayEvents): Extract<CellEntry, { kind: 'event' }>[] {
  if (!events) return []
  return [...events.allDay.map((event) => ({ kind: 'event' as const, event })), ...events.timed.map((block) => ({ kind: 'event' as const, event: block.event, block }))]
}

/** The focused day's rows below a phone's grid, or its empty state: tasks, deadlines, projected occurrences, then events (series-occurrences D3; the grid's count counts tasks only). */
function MonthDayList({ focused, empty, onAdd, children }: { focused: string; empty: boolean; onAdd: () => void; children: ReactNode }) {
  return (
    <section aria-label={t('Tasks on {focused}', { focused })} className="mt-3 space-y-1" data-month-day-list>
      {empty ? <EmptyState compact title={t('Nothing planned.')} action={{ label: t('Add a task'), onClick: onAdd, shortcut: keysOf('month.quick-add') }} /> : children}
    </section>
  )
}

/** Previous, Today, Next and the mode switch of the Month. */
function MonthRange({ anchor, date, today, goTo, showCompleted, calendars }: { anchor: string; date?: string; today: string; goTo: (d: string) => void; showCompleted: boolean; calendars: ReactNode }) {
  return (
    <>
      {calendars}
      <span className="flex items-center" role="group" aria-label={t('Range')}>
        <Button variant="ghost" size="sm" icon="chevron-left" aria-label={t('Previous month')} onClick={() => goTo(addMonthsISO(anchor, -1))} />
        <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
        <Button variant="ghost" size="sm" icon="chevron-right" aria-label={t('Next month')} onClick={() => goTo(addMonthsISO(anchor, 1))} />
      </span>
      <CalendarCompletedToggle shown={showCompleted} />
      <CalendarRangeSwitch mode="month" date={date} />
    </>
  )
}

/** "Months shown" in the page's menu (year-view D1): a device choice, kept while a phone shows one month. */
function MonthsShownItems({ count }: { count: number }) {
  return <>
    {MONTHS_SHOWN.map((n) => (
      <MenuItem key={n} label={t('Months shown: {n}', { n })} icon="calendar-days" checked={count === n} data-months-shown={n} onSelect={() => monthsShown.set(n)} />
    ))}
    <MenuSeparator />
  </>
}

export function MonthView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const month = anchor.slice(0, 7)
  const { resolved } = useDateTimeFormat()
  const zone = useViewerZone()
  const prefs = useGridPrefs()
  const showCompleted = useCalendarShowCompleted()
  const narrow = useMediaQuery('(max-width: 39.99rem)')
  const preferred = monthsShown.use()
  useEffect(() => rememberCalendarMode('month'), [])

  // Below 640 px one month whatever the device's choice (year-view D6).
  const count = narrow ? 1 : preferred
  const stacked = count > 1
  const shownMonths = useMemo(() => stackedMonths(anchor, count, resolved.weekStart), [anchor, count, resolved.weekStart])
  // The days with cells: the six weeks of one month, or each stacked month's own days in date order.
  const days = useMemo(() => (stacked ? shownMonths.flatMap((m) => m.weeks.flat().filter((d) => d.slice(0, 7) === m.month)) : shownMonths[0].weeks.flat()), [shownMonths, stacked])
  const isShown = useCallback((d: string) => shownMonths.some((m) => m.month === d.slice(0, 7)), [shownMonths])
  const projects = useProjects()
  const memberMap = useMembershipMap()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const viewed = useMemo(() => rawTasks.map((task) => viewedTask(task, zone)), [rawTasks, zone])
  const chrome = useCalendarChrome(viewed, projects, { projections: true }) // Colour by, the filter, the project scope, adding with the pointer (calendar-clarity)
  const shownIds = useMemo(() => new Set(calendarTasks(viewed, projects, days[0], days[days.length - 1], showCompleted).map((tk) => tk.id)), [viewed, projects, days, showCompleted])
  const shownRaw = useMemo(() => rawTasks.filter((item) => shownIds.has(item.id)), [rawTasks, shownIds])
  const shownViewed = useMemo(() => viewed.filter((task) => shownIds.has(task.id)), [viewed, shownIds])
  const { drawn: drawnRaw, deadlines } = useDrawn(chrome, shownRaw, viewed, projects, days[0], days[days.length - 1])
  const viewedMap = useMemo(() => new Map(viewed.map((task) => [task.id, task])), [viewed])
  const { projections, hue: projectionHue } = useCalendarProjections({ raw: rawTasks, viewed: viewedMap, projects, keeps: chrome.keeps, hueOf: chrome.color.hueOf, today, from: days[0], to: days[days.length - 1], zone })
  // Spans (multi-day-tasks D3): bars across each week row, never rows of a cell; capacity stays on the due day.
  const { spans, spanIds, cells } = useMonthSpans(drawnRaw, viewedMap, projections, days, zone)
  const projected = useMemo(() => projectionsByDate(projections), [projections])
  // Slots count once toward a cell's capacity (calendar-slots D6); Month lists their tasks as usual.
  const slotRows = useSlots()
  const slotViews = useMemo(() => slotsByDate(slotRows, days, viewedMap), [slotRows, days, viewedMap])
  const rawMap = useMemo(() => new Map(rawTasks.map((task) => [task.id, task])), [rawTasks])
  const canEdit = useCallback((task: Task) => canEditTasks(roleOf(task.project_id, memberMap)), [memberMap])
  const editable = useCallback((task: Task) => !task.completed_at && canEdit(task), [canEdit])
  // The shown weeks' events are rows of their cells (calendar-events-all-views); they
  // count toward a cell's capacity only when this device counts meetings (meeting-aware-capacity D5).
  const feeds = useCalendarFeeds(days[0], days[days.length - 1])
  const dayEvents = useMemo(() => eventsByDay(feeds.visibleEvents, days[0], days[days.length - 1], zone), [feeds.visibleEvents, days, zone])
  const online = useOnline()
  const meetings = useMemo(() => meetingsByDay(days, feeds.visibleEvents, {
    count: prefs.countEvents, eventsShown: feeds.eventsShown, subscriptions: feeds.subs.length, win: feeds.win, online, zone,
  }), [days, feeds.visibleEvents, prefs.countEvents, feeds.eventsShown, feeds.subs.length, feeds.win, online, zone])

  /** Selection order: the shown months' tasks in date order (`j` / `k`). */
  const order = useMemo(() => monthOrder(days, cells, spans), [days, cells, spans])

  const [focused, setFocused] = useState(anchor)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const gridRef = useRef<HTMLDivElement>(null)

  // A new anchor (navigation, a task followed into another month) moves the focus there,
  // or to the day that was followed past the last stacked month.
  const followed = useRef<string | null>(null)
  useResetOnChange([anchor], () => { setFocused(followed.current ?? anchor); followed.current = null })

  const go = useCalendarGo()
  const goTo = useCallback((d: string) => go('month', d === today ? undefined : d), [go, today])
  /** Keep a day on screen: before the shown months it opens first, after them the months move on until it is last. */
  const reveal = useCallback((d: string) => {
    if (isShown(d)) return
    followed.current = d
    goTo(d < days[0] ? d : addMonthsISO(d, 1 - count))
  }, [isShown, goTo, days, count])
  const focusDay = useCallback((d: string) => { setFocused(d); reveal(d) }, [reveal])

  // Keyboard moves run one after another on the freshest row (as in Day and Week).
  const queue = useRef<Promise<void>>(Promise.resolve())
  const move = useCallback((id: string, n: number) => {
    queue.current = queue.current.then(async () => {
      const raw = await getTask(id)
      if (!raw || raw.deleted_at || raw.completed_at || !raw.due) return
      const task = viewedTask(raw)
      if (!task.due) return
      // A span moves whole, start and due by the same days (multi-day-tasks D4).
      const whole = spanOf(task) ? moveSpanPatch(task, n) : null
      const due = whole ? whole.due : nudgeDue(task.due, { days: n })
      await updateTask(id, whole ? { start: whole.start, due: dueFromView(raw.due, due) } : { due: dueFromView(raw.due, due) })
      setFocused(due.date)
      reveal(due.date)
    }).catch(reportActionError)
  }, [reveal])

  /** Dropped on a day: same time and zone, new date (one due edit, with Undo); a task from the planning list may have no date yet. */
  const dropOn = useCallback((id: string, d: string) => {
    const task = viewedMap.get(id)
    if (!task || task.completed_at || task.due?.date === d) return
    act(setDueWithUndo(id, dueFromView(rawMap.get(id)?.due, { date: d, ...(task.due?.time ? { time: task.due.time } : {}) })))
    setSelectedId(id)
    setFocused(d)
  }, [viewedMap, rawMap])

  // The planning list in the panel slot, as in Day, Week and Plan: drag a task onto a day, or `s` puts it on the focused day.
  const planActions = useRef<PlanActions>({ onPointerDown: () => {}, onPlace: () => {}, onOpen: () => {} })
  usePlanActions(planActions)
  planActions.current = {
    onPointerDown: (e, id) => {
      const task = rawMap.get(id)
      if (!task || !editable(task) || e.button !== 0) return
      beginDrag(e, { label: task.title, onDrop: (key) => { if (key.startsWith('day:')) dropOn(id, key.slice(4)) } })
    },
    onPlace: (id) => { const task = rawMap.get(id); if (task && editable(task)) dropOn(id, focused) },
    onOpen: (id) => setPanelTaskId(id),
  }
  const { planOpen, togglePlan } = usePlanPanel()

  // The Month view's keys are `view` entries of the shortcut registry (keyboard-
  // shortcuts "One shortcut registry with scopes"): the dispatcher keeps them out
  // of text fields and dialogs and runs the `g` sequences first.
  const idx = selectedId ? order.indexOf(selectedId) : -1
  const selectedTask = selectedId && order.includes(selectedId) ? rawMap.get(selectedId) : undefined
  const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const step = (dir: 'next' | 'prev') => {
    const next = order[dir === 'next' ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1)] ?? null
    setSelectedId(next)
    const d = next ? viewedMap.get(next)?.due?.date : undefined
    if (d) setFocused(d)
  }
  useShortcutScope('view', {
    // With a task selected the arrows move it (a day or a week); otherwise, or with Shift, they move the focused day.
    'month.move': (e) => {
      if (selectedTask) { if (editable(selectedTask)) move(selectedTask.id, ARROWS[e.key]) } else focusDay(addDaysISO(focused, ARROWS[e.key]))
    },
    'month.focus': (e) => focusDay(addDaysISO(focused, ARROWS[e.key])),
    // A selected span's ends; anything else falls through to moving the focused day (multi-day-tasks D4).
    ...monthSpanKeys({ selected: selectedTask, viewed: viewedMap, editable, queue, focus: setFocused }),
    'month.next': () => step('next'),
    'month.prev': () => step('prev'),
    // A focused button (a projected occurrence, series-occurrences D6) keeps its own Enter.
    'month.open': (e) => { if (!selectedTask || isProjectionTarget(e.target)) return false; setPanelTaskId(selectedTask.id) },
    'month.escape': () => {
      if (expanded) setExpanded(null)
      else if (openId) setPanelTaskId(null)
      else setSelectedId(null)
    },
    'month.quick-add': () => chrome.add.add({ date: focused }),
    // One month at a time, also with several shown (year-view D1).
    'month.range-prev': () => goTo(addMonthsISO(anchor, -1)),
    'month.range-next': () => goTo(addMonthsISO(anchor, 1)),
    'month.today': () => goTo(today),
  }, { view: 'month' })

  // The focused cell takes the browser focus while the grid has it (roving tabindex).
  useEffect(() => {
    const g = gridRef.current
    if (!g || !g.contains(document.activeElement)) return
    g.querySelector<HTMLElement>(`[data-month-day="${focused}"]`)?.focus()
  }, [focused])
  // A selected task hidden behind "+N more" opens its cell.
  useEffect(() => {
    if (!selectedId) return
    const d = viewedMap.get(selectedId)?.due?.date
    if (spanIds.has(selectedId)) return
    const entries = d ? cellEntries(cells.get(d) ?? [], deadlines.get(d) ?? [], projected.get(d), d, zone, dayEvents.get(d)) : []
    if (d && entries.length > CELL_ROWS && !visibleRows(entries, CELL_ROWS).shown.some((e) => e.kind === 'task' && e.task.id === selectedId)) setExpanded(d)
  }, [selectedId, viewedMap, cells, deadlines, projected, zone, spanIds, dayEvents])

  const last = shownMonths[shownMonths.length - 1]
  const title = stacked ? formatDateRange(shownMonths[0].from, last.from, { month: 'short', year: 'numeric' }) : monthName(month, 'long', true)
  const weekdays = shownMonths[0].weeks[0].map((d) => formatDateParts(d, { weekday: narrow ? 'narrow' : 'short' }))

  const row = (task: Task) => (
    <MonthRow key={task.id} task={task} v={viewedMap.get(task.id)} compact={false} today={today} selected={selectedId === task.id} hue={chrome.color.hueOf(task)}
      canMove={editable(task)} readOnly={!canEdit(task)} extend={!narrow} onDrop={dropOn} onOpen={setPanelTaskId}
      onSelect={(id, d) => { setSelectedId(id); if (d) setFocused(d) }} />
  )
  const deadlineRow = (task: Task, d: string) => <DeadlineMarker key={`deadline:${task.id}`} task={task} date={d} today={today} variant="row" onOpen={(id) => setPanelTaskId(id)} />
  // Events are read-only rows (calendar-feeds D8): the same details popover as in Day, never dragged, selected or counted.
  const eventRow = ({ event, block }: { event: CalendarEvent; block?: EventBlock }, variant: 'cell' | 'agenda') => (
    <EventRow key={`event:${event.id}`} ev={event} start={block?.start} end={block?.end} sub={feeds.subMap.get(event.subscriptionId)} zone={zone} variant={variant} />
  )
  const focusedEvents = eventEntries(dayEvents.get(focused))
  const c: MonthCells = {
    today, focused, expanded, narrow, selectedId, cells, spans, projected, shownViewed, dayLength: prefs.dayLength, meetings, slotViews,
    outside: (d) => !stacked && d.slice(0, 7) !== month, add: chrome.add,
    entries: (d, dayProjected) => cellEntries(cells.get(d) ?? [], deadlines.get(d) ?? [], dayProjected, d, zone, dayEvents.get(d)),
    row, deadlineRow, events: dayEvents, eventRow: (e) => eventRow(e, 'cell'), hueOf: chrome.color.hueOf, projectionHue, stored: (id) => rawMap.get(id),
    focus: setFocused, expand: setExpanded, select: setSelectedId, open: setPanelTaskId,
  }
  // The focused day's list on a phone: the spans covering it first, with their range (multi-day-tasks D8).
  const spansOn = (d: string) => spans.flatMap((x) => (x.kind === 'task' && spanCovers(x.span, d) ? [rawMap.get(x.id) ?? x.task] : []))
  const focusedTasks = [...spansOn(focused), ...(cells.get(focused) ?? [])]
  const focusedDeadlines = deadlines.get(focused) ?? []
  // How fresh the calendars are, after the filter chip, as in Day and Week.
  const status = <CalendarStatus status={feeds.status} online={online} fetchedAt={feeds.win?.fetchedAt} />
  const meta = chrome.chip ? <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-2">{chrome.chip}{status}</span> : status
  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="month">
      <CalendarPageHeader chrome={chrome} title={title} meta={meta}
        actions={<MonthRange anchor={anchor} date={date} today={today} goTo={goTo} showCompleted={showCompleted} calendars={<CalendarsToggle shown={feeds.eventsShown} count={feeds.subs.length} />} />}
        overflow={<>
          <CalendarCompletedToggle shown={showCompleted} menu />
          {!narrow && <MonthsShownItems count={preferred} />}
          <MenuItem label={planOpen ? t('Hide the planning list') : t('Plan from a list')} icon="list" description={t('Drag tasks onto a day, or press s on one')} onSelect={() => chrome.plan(planOpen, togglePlan)} />
          {chrome.overflow}
        </>} />
      <div ref={gridRef} className={stacked ? 'space-y-6' : undefined}>
        {shownMonths.map((m) => {
          const name = monthName(m.month, 'long', true)
          return (
            <div key={m.month} data-month-section={m.month}>
              {stacked && <h2 className="mb-1 text-h3 text-strong" data-month-heading={m.month}>{name}</h2>}
              <div role="grid" aria-label={t('{title} calendar', { title: stacked ? name : title })} aria-readonly={false} className="w-full min-w-0 select-none" data-month-grid={m.month}>
                <div role="row" className="grid grid-cols-7 border-b border-default">
                  {weekdays.map((w, i) => <div key={i} role="columnheader" className="px-1 py-1 text-center text-hint font-medium text-muted">{w}</div>)}
                </div>
                {m.weeks.map((week) => <MonthWeek key={week[0]} week={week} own={stacked ? m : undefined} c={c} />)}
              </div>
            </div>
          )
        })}
      </div>
      {narrow && <MonthDayList focused={focused} empty={focusedTasks.length === 0 && focusedDeadlines.length === 0 && !projected.get(focused)?.length && focusedEvents.length === 0} onAdd={() => chrome.add.add({ date: focused })}>
        {focusedTasks.map((task) => row(task))}{focusedDeadlines.map((task) => deadlineRow(task, focused))}{(projected.get(focused) ?? []).map((p) => <ProjectedItem key={p.id} p={p} hue={projectionHue(p)} variant="large" />)}
        {focusedEvents.map((e) => eventRow(e, 'agenda'))}
      </MonthDayList>}
      <p className="mt-3 hidden text-meta text-faint sm:block">
        {t.rich('Arrows move the focused day, or the selected task. {j} / {k} select, {q} adds on the focused day.', { j: <span className="ui-kbd">j</span>, k: <span className="ui-kbd">k</span>, q: <span className="ui-kbd">q</span> })}
        {shownRaw.some((task) => task.estimate_minutes) ? ` ${t('Planned estimates against a {minutes} day.', { minutes: formatMinutes(prefs.dayLength) })}` : ''}
      </p>
      {chrome.element}
    </PageBody>
  )
}
