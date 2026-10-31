// The Month view (OpenSpec change month-and-timeline-views, month-view spec): a
// six-week grid of due dates, a pure projection of local tasks like Day and Week.
// Moving a task, by drag onto a day or with the arrows, is one due edit that keeps
// its time and zone; `q` adds a task due on the focused day. Works offline.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, EmptyState, MenuItem, PageBody, useMediaQuery } from '../ui'
import { calendarTasks, dayLoad, nudgeDue } from '../lib/calendar'
import { rememberCalendarMode } from '../lib/calendarMode'
import { addDaysISO, dueFromView, formatTime, viewedTask, formatDateParts, monthName } from '../lib/dates'
import { getTask, useMembershipMap, useProjects } from '../lib/localData'
import { beginDrag } from '../lib/dnd'
import { formatMinutes } from '../lib/duration'
import { cellTasks, monthGrid, visibleRows } from '../lib/month'
import { updateTask } from '../lib/ops'
import { canEditTasks, roleOf } from '../lib/sharing'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { slotCapacity, slotsByDate, useSlots } from '../lib/slots'
import type { Task } from '../lib/types'
import { CalendarRangeSwitch } from './CalendarRange'
import { useCalendarShowCompleted, useGridPrefs } from '../lib/liveData'
import { CalendarCompletedToggle } from './calendar/CalendarCompletedToggle'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { usePlanActions, usePlanPanel, type PlanActions } from './calendar/PlanPanel'
import { CalendarPageHeader, useCalendarChrome, useDrawn } from './calendar/useCalendarChrome'
import { useCalendarGo } from './calendar/scope'
import { addHandlers } from './calendar/DayColumn'
import { DeadlineDiamond, deadlineMark, DeadlineMarker } from './calendar/DeadlineMarker'
import { keysOf } from '../lib/shortcuts'
import { useShortcutScope } from './shortcuts'
import { setDueWithUndo } from './undoable'
import { useToday, useViewerZone } from './useViews'
import { t } from '../lib/i18n'
import { act, reportActionError } from './actionError'
import { CapacityLine, capacityState } from './calendar/CapacityLine'
import { meetingsByDay } from './calendar/meetingCapacity'
import { useCalendarFeeds } from './calendar/useCalendarFeeds'
import { useOnline } from '../lib/online'
import { useResetOnChange } from '../lib/useResetOnChange'
import { columnEntries } from '../lib/plan'
import { projectionsByDate, type Projection } from '../lib/occurrences'
import { dayDrag, isProjectionTarget, ProjectedItem, useCalendarProjections } from './calendar/projections'

/** Task rows a desktop cell shows before "+N more". */
const CELL_ROWS = 3

type CellEntry = { kind: 'task'; task: Task } | { kind: 'deadline'; task: Task } | { kind: 'projected'; projection: Projection }
const NO_PROJECTIONS: readonly Projection[] = []

/**
 * A cell's rows: its tasks and projected occurrences ordered together by time, priority
 * and position (series-occurrences D3, as Plan's columns), then the deadlines of tasks
 * due elsewhere (calendar-clarity D1); all take part in "+N more".
 */
function cellEntries(tasks: readonly Task[], deadlines: readonly Task[], projected: readonly Projection[] = NO_PROJECTIONS, date = '', zone?: string): CellEntry[] {
  const rows: CellEntry[] = projected.length === 0
    ? tasks.map((task) => ({ kind: 'task' as const, task }))
    : columnEntries(tasks, projected, date, zone).map((e) => (e.kind === 'task' ? { kind: 'task' as const, task: e.task } : { kind: 'projected' as const, projection: e.projection }))
  return [...rows, ...deadlines.map((task) => ({ kind: 'deadline' as const, task }))]
}

/** The same day of the month `months` away, clamped to the month's last day. */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const first = new Date(y, m - 1 + months, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const day = Math.min(d, last)
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The focused day's rows below a phone's grid, or its empty state: tasks, deadlines, then projected occurrences (series-occurrences D3; the grid's count counts tasks only). */
function MonthDayList({ focused, empty, onAdd, children }: { focused: string; empty: boolean; onAdd: () => void; children: ReactNode }) {
  return (
    <section aria-label={t('Tasks on {focused}', { focused })} className="mt-3 space-y-1" data-month-day-list>
      {empty ? <EmptyState compact title={t('Nothing planned.')} action={{ label: t('Add a task'), onClick: onAdd, shortcut: keysOf('month.quick-add') }} /> : children}
    </section>
  )
}

/** Previous, Today, Next and the mode switch of the Month. */
function MonthRange({ anchor, date, today, goTo, showCompleted }: { anchor: string; date?: string; today: string; goTo: (d: string) => void; showCompleted: boolean }) {
  return (
    <>
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

export function MonthView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const month = anchor.slice(0, 7)
  const { resolved } = useDateTimeFormat()
  const zone = useViewerZone()
  const prefs = useGridPrefs()
  const showCompleted = useCalendarShowCompleted()
  const narrow = useMediaQuery('(max-width: 39.99rem)')
  useEffect(() => rememberCalendarMode('month'), [])

  const grid = useMemo(() => monthGrid(anchor, resolved.weekStart), [anchor, resolved.weekStart])
  const days = useMemo(() => grid.flat(), [grid])
  const projects = useProjects()
  const memberMap = useMembershipMap()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const viewed = useMemo(() => rawTasks.map((task) => viewedTask(task, zone)), [rawTasks, zone])
  const chrome = useCalendarChrome(viewed, projects, { projections: true }) // Colour by, the filter, the project scope, adding with the pointer (calendar-clarity)
  const shownIds = useMemo(() => new Set(calendarTasks(viewed, projects, days[0], days[days.length - 1], showCompleted).map((tk) => tk.id)), [viewed, projects, days, showCompleted])
  const shownRaw = useMemo(() => rawTasks.filter((item) => shownIds.has(item.id)), [rawTasks, shownIds])
  const shownViewed = useMemo(() => viewed.filter((task) => shownIds.has(task.id)), [viewed, shownIds])
  const { drawn: drawnRaw, deadlines } = useDrawn(chrome, shownRaw, viewed, projects, days[0], days[days.length - 1])
  const cells = useMemo(() => new Map(days.map((d) => [d, cellTasks(drawnRaw, d, zone)])), [days, drawnRaw, zone])
  const viewedMap = useMemo(() => new Map(viewed.map((task) => [task.id, task])), [viewed])
  const { projections, hue: projectionHue } = useCalendarProjections({ raw: rawTasks, viewed: viewedMap, projects, keeps: chrome.keeps, hueOf: chrome.color.hueOf, today, from: days[0], to: days[days.length - 1], zone })
  const projected = useMemo(() => projectionsByDate(projections), [projections])
  // Slots count once toward a cell's capacity (calendar-slots D6); Month lists their tasks as usual.
  const slotRows = useSlots()
  const slotViews = useMemo(() => slotsByDate(slotRows, days, viewedMap), [slotRows, days, viewedMap])
  const rawMap = useMemo(() => new Map(rawTasks.map((task) => [task.id, task])), [rawTasks])
  const canEdit = useCallback((task: Task) => canEditTasks(roleOf(task.project_id, memberMap)), [memberMap])
  const editable = useCallback((task: Task) => !task.completed_at && canEdit(task), [canEdit])
  // Meetings count toward a cell's capacity only when this device counts them
  // (meeting-aware-capacity D5); the events are fetched for the six weeks only then.
  const feeds = useCalendarFeeds(days[0], days[days.length - 1], prefs.countEvents)
  const online = useOnline()
  const meetings = useMemo(() => meetingsByDay(days, feeds.visibleEvents, {
    count: prefs.countEvents, eventsShown: feeds.eventsShown, subscriptions: feeds.subs.length, win: feeds.win, online, zone,
  }), [days, feeds.visibleEvents, prefs.countEvents, feeds.eventsShown, feeds.subs.length, feeds.win, online, zone])

  /** Selection order: the month's tasks in grid order (`j` / `k`). */
  const order = useMemo(() => days.flatMap((d) => (cells.get(d) ?? []).map((task) => task.id)), [days, cells])

  const [focused, setFocused] = useState(anchor)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const gridRef = useRef<HTMLDivElement>(null)

  // A new anchor (navigation, a task followed into another month) moves the focus there.
  useResetOnChange([anchor], () => setFocused(anchor))

  const go = useCalendarGo()
  const goTo = useCallback((d: string) => go('month', d === today ? undefined : d), [go, today])
  /** Keep the focus on screen: a day outside the grid's month opens that month. */
  const focusDay = useCallback((d: string) => {
    setFocused(d)
    if (d.slice(0, 7) !== month) goTo(d)
  }, [month, goTo])

  // Keyboard moves run one after another on the freshest row (as in Day and Week).
  const queue = useRef<Promise<void>>(Promise.resolve())
  const move = useCallback((id: string, days: number) => {
    queue.current = queue.current.then(async () => {
      const raw = await getTask(id)
      if (!raw || raw.deleted_at || raw.completed_at || !raw.due) return
      const task = viewedTask(raw)
      if (!task.due) return
      const due = nudgeDue(task.due, { days })
      await updateTask(id, { due: dueFromView(raw.due, due) })
      setFocused(due.date)
      if (due.date.slice(0, 7) !== month) goTo(due.date)
    }).catch(reportActionError)
  }, [month, goTo])

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
    const entries = d ? cellEntries(cells.get(d) ?? [], deadlines.get(d) ?? [], projected.get(d), d, zone) : []
    if (d && entries.length > CELL_ROWS && !visibleRows(entries, CELL_ROWS).shown.some((e) => e.kind === 'task' && e.task.id === selectedId)) setExpanded(d)
  }, [selectedId, viewedMap, cells, deadlines, projected, zone])

  const title = monthName(month, 'long', true)
  const weekdays = grid[0].map((d) => formatDateParts(d, { weekday: narrow ? 'narrow' : 'short' }))

  const row = (task: Task, compact: boolean) => {
    const v = viewedMap.get(task.id)
    const canMove = editable(task)
    const selected = selectedId === task.id
    const hue = chrome.color.hueOf(task)
    const onDeadline = !!v?.due && task.deadline === v.due.date
    return (
      <button key={task.id} type="button" tabIndex={-1} data-month-task={task.id} data-hue={hue} aria-pressed={selected}
        onPointerDown={canMove ? (e) => {
          if (e.button !== 0) return
          beginDrag(e, { label: task.title, onDrop: (key) => { if (key.startsWith('day:')) dropOn(task.id, key.slice(4)) } })
        } : undefined}
        onClick={(e) => { e.stopPropagation(); setSelectedId(task.id); if (v?.due) setFocused(v.due.date) }}
        onDoubleClick={() => setPanelTaskId(task.id)}
        className={`ui-block ui-block--row flex w-full min-w-0 touch-manipulation items-center gap-1 px-1 text-left ${compact ? 'py-0 text-hint' : 'py-0.5 text-meta'} ${task.completed_at || (v?.due && v.due.date < today) ? 'ui-block--past' : ''} ${selected ? 'ring-1 ring-accent' : ''} ${canMove ? 'cursor-grab' : ''}`}>
        {/* Named by its content (WCAG 2.5.3 Label in Name): the spoken text is visually hidden, the visible one is not read twice. */}
        <span className="sr-only">{[task.title || t('Untitled'), task.completed_at ? t('(completed)') : '', v?.due?.time ? formatTime(v.due.time) : '', task.priority < 4 ? t('priority {n}', { n: task.priority }) : '', onDeadline ? deadlineMark(task, v!.due!.date) : '', canEdit(task) ? '' : t('read-only')].filter(Boolean).join(', ')}</span>
        {v?.due?.time && <span aria-hidden className="shrink-0 tabular-nums">{formatTime(v.due.time)}</span>}
        <span aria-hidden className={`min-w-0 flex-1 truncate ${task.completed_at ? 'line-through' : ''}`}>{task.title || t('Untitled')}</span>
        {task.priority < 4 && <span aria-hidden className="shrink-0 text-hint font-semibold" data-priority={task.priority}>P{task.priority}</span>}
        {onDeadline && <DeadlineDiamond past={v!.due!.date < today} />}
      </button>
    )
  }

  const deadlineRow = (task: Task, d: string) => <DeadlineMarker key={`deadline:${task.id}`} task={task} date={d} today={today} variant="row" onOpen={(id) => setPanelTaskId(id)} />
  const focusedTasks = cells.get(focused) ?? []
  const focusedDeadlines = deadlines.get(focused) ?? []
  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="month">
      <CalendarPageHeader chrome={chrome} title={title} meta={chrome.chip} actions={<MonthRange anchor={anchor} date={date} today={today} goTo={goTo} showCompleted={showCompleted} />}
        overflow={<>
          <CalendarCompletedToggle shown={showCompleted} menu />
          <MenuItem label={planOpen ? t('Hide the planning list') : t('Plan from a list')} icon="list" description={t('Drag tasks onto a day, or press s on one')} onSelect={() => chrome.plan(planOpen, togglePlan)} />
          {chrome.overflow}
        </>} />
      <div ref={gridRef} role="grid" aria-label={t('{title} calendar', { title })} aria-readonly={false} className="w-full min-w-0 select-none" data-month-grid>
        <div role="row" className="grid grid-cols-7 border-b border-default">
          {weekdays.map((w, i) => <div key={i} role="columnheader" className="px-1 py-1 text-center text-hint font-medium text-muted">{w}</div>)}
        </div>
        {grid.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((d) => {
              const list = cells.get(d) ?? []
              const dayProjected = projected.get(d) ?? NO_PROJECTIONS
              const entries = cellEntries(list, deadlines.get(d) ?? [], dayProjected, d, zone)
              const outside = d.slice(0, 7) !== month
              const load = dayLoad(shownViewed, d, prefs.dayLength, meetings?.get(d)?.minutes ?? 0, slotCapacity(slotViews.get(d)), dayProjected)
              const open = expanded === d
              const { shown, hidden } = open ? { shown: entries, hidden: 0 } : visibleRows(entries, CELL_ROWS)
              const isFocused = d === focused
              return (
                <div key={d} role="gridcell" tabIndex={isFocused ? 0 : -1} data-month-day={d} data-drop-target={`day:${d}`}
                  aria-selected={isFocused} aria-current={d === today ? 'date' : undefined}
                  onClick={() => { setFocused(d); setSelectedId(null) }}
                  // Adding with the pointer (calendar-clarity D2): double-click, right-click or a long press on an empty part.
                  {...addHandlers(chrome.add, () => ({ date: d }))}
                  onFocus={(e) => { if (e.target === e.currentTarget) setFocused(d) }}
                  className={`relative min-w-0 border-b border-l border-default p-1 outline-none first:border-l-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-focus data-[drop-active]:bg-accent-soft ${narrow ? 'min-h-14' : 'min-h-28'} ${outside ? 'bg-sunken text-faint' : ''} ${isFocused ? 'bg-accent-soft/40' : 'pointer-fine:hover:bg-hover'}`}>
                  {/* Named by its content (WCAG 2.5.3 Label in Name): the date and counts first, then the tasks' own names. */}
                  <span className="sr-only">{[d, list.length ? t('{n, plural, one {# task} other {# tasks}}', { n: list.length }) : '', capacityState(load)].filter(Boolean).join(', ')}</span>
                  <div aria-hidden className="mb-0.5 flex items-center justify-between gap-1">
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-meta tabular-nums ${d === today ? 'bg-accent font-semibold text-on-accent' : ''}`}>{Number(d.slice(8))}</span>
                    {!narrow && load.planned > 0 && (
                      <CapacityLine load={load} dayLength={prefs.dayLength} sayOver={false} />
                    )}
                  </div>
                  {narrow ? (
                    list.length > 0 && <span aria-hidden data-month-count className="block text-center text-meta font-medium text-default">{list.length}</span>
                  ) : (
                    <div className="space-y-0.5">
                      {shown.map((e) => (e.kind === 'task' ? row(e.task, false) : e.kind === 'projected' ? <ProjectedItem key={e.projection.id} p={e.projection} hue={projectionHue(e.projection)} variant="row" className="px-1" onDrag={dayDrag(e.projection)} /> : deadlineRow(e.task, d)))}
                      {hidden > 0 && (
                        <button type="button" tabIndex={-1} data-month-more={hidden} aria-expanded={false}
                          onClick={(e) => { e.stopPropagation(); setExpanded(d) }}
                          className="w-full rounded-chip px-1 text-left text-hint font-medium text-muted hover:bg-sunken dark:hover:bg-raised">
                          {t('+{hidden} more', { hidden })}
                        </button>
                      )}
                      {open && entries.length > CELL_ROWS && (
                        <button type="button" tabIndex={-1} aria-expanded onClick={(e) => { e.stopPropagation(); setExpanded(null) }}
                          className="w-full rounded-chip px-1 text-left text-hint text-muted hover:bg-sunken dark:hover:bg-raised">{t('Show less')}</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {narrow && <MonthDayList focused={focused} empty={focusedTasks.length === 0 && focusedDeadlines.length === 0 && !projected.get(focused)?.length} onAdd={() => chrome.add.add({ date: focused })}>
        {focusedTasks.map((task) => row(task, false))}{focusedDeadlines.map((task) => deadlineRow(task, focused))}{(projected.get(focused) ?? []).map((p) => <ProjectedItem key={p.id} p={p} hue={projectionHue(p)} variant="large" />)}
      </MonthDayList>}
      <p className="mt-3 hidden text-meta text-faint sm:block">
        {t.rich('Arrows move the focused day, or the selected task. {j} / {k} select, {q} adds on the focused day.', { j: <span className="ui-kbd">j</span>, k: <span className="ui-kbd">k</span>, q: <span className="ui-kbd">q</span> })}
        {shownRaw.some((task) => task.estimate_minutes) ? ` ${t('Planned estimates against a {minutes} day.', { minutes: formatMinutes(prefs.dayLength) })}` : ''}
      </p>
      {chrome.element}
    </PageBody>
  )
}
