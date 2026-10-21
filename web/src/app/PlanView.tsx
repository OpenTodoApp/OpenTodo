// The calendar's Plan mode (OpenSpec change planner-view): the next days as columns
// of dated tasks without a time axis, seven per row, each with a capacity bar that
// counts task estimates, busy subscribed events and the projected occurrences of
// recurring tasks. A pure projection of local rows like Day, Week and Month; moving
// a task, by drag onto a day or with the arrows, is one due edit that keeps its time
// and zone. Projections and events are read-only and written nowhere. Works offline.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, hueFor, MenuItem, MenuSeparator, PageBody, PageHeader, useWide } from '../ui'
import { allDayEvents, calendarTasks, eventBlocks, nudgeDue } from '../lib/calendar'
import { setShowEvents } from '../lib/calendarFeeds'
import { rememberCalendarMode } from '../lib/calendarMode'
import { useRowDetail, type RowDetail } from '../lib/appearance'
import { addDaysISO, dateLocaleOf, dueFromView, formatShort, viewedTask } from '../lib/dates'
import { beginDrag } from '../lib/dnd'
import { getTask, saveGridPrefs, useMembershipMap } from '../lib/localData'
import { useGridPrefs, useLiveProjects } from '../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { useOnline } from '../lib/online'
import { updateTask } from '../lib/ops'
import { columnEntries, followAnchor, PLAN_SPANS, planLoad, planSeries, projectedOccurrences, spanDates } from '../lib/plan'
import { canEditTasks, roleOf } from '../lib/sharing'
import type { Task } from '../lib/types'
import { t } from '../lib/i18n'
import { act, reportActionError } from './actionError'
import { CalendarRangeSwitch } from './CalendarRange'
import { AddOnDayDialog } from './calendar/AddOnDayDialog'
import { CalendarStatus } from './calendar/CalendarStatus'
import { PlanAgenda } from './calendar/PlanAgenda'
import { PLAN_PANEL, PlanPanel, type PlanActions } from './calendar/PlanPanel'
import { CapacityBar, PlanDayRows, type PlanDayData } from './calendar/PlanRow'
import { useCalendarFeeds } from './calendar/useCalendarFeeds'
import { closePanel, openPanel, setPanelTaskId, usePanelOccupantKey, usePanelTaskId } from './panel'
import { navigate } from './router'
import { useShortcutScope } from './shortcuts'
import { completeWithUndo, setDueWithUndo } from './undoable'
import { useToday, useViewerZone } from './useViews'

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/** The days of the span with their rows, events and load: everything the columns and the agenda draw. */
function usePlanDays(dates: string[], today: string, dayLength: number) {
  const zone = useViewerZone()
  const projects = useLiveProjects()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const from = dates[0], to = dates[dates.length - 1]
  const feeds = useCalendarFeeds(from, to)
  const viewed = useMemo(() => rawTasks.map((task) => viewedTask(task, zone)), [rawTasks, zone])
  // The Day, Week and Month selection (open, live, not archived) over the span, kept as stored rows so writes start from the original due.
  const shownRaw = useMemo(() => {
    const ids = new Set(calendarTasks(viewed, projects, from, to).map((task) => task.id))
    return rawTasks.filter((task) => ids.has(task.id))
  }, [rawTasks, viewed, projects, from, to])
  const series = useMemo(() => planSeries(rawTasks, projects), [rawTasks, projects])
  const projections = useMemo(() => projectedOccurrences(series, rawTasks, today, from, to, zone), [series, rawTasks, today, from, to, zone])
  const days = useMemo<PlanDayData[]>(() => dates.map((date) => ({
    date,
    entries: columnEntries(shownRaw, projections, date, zone),
    events: eventBlocks(feeds.visibleEvents, date, zone),
    allDay: allDayEvents(feeds.visibleEvents, date),
    load: planLoad(shownRaw, projections, feeds.visibleEvents, date, dayLength, zone),
  })), [dates, shownRaw, projections, feeds.visibleEvents, zone, dayLength])
  return { zone, projects, rawTasks, viewed, feeds, days }
}

export function PlanView({ date, detail: detailProp }: { date?: string; detail?: RowDetail }) {
  const today = useToday()
  const anchor = date ?? today
  const prefs = useGridPrefs()
  const span = prefs.planDays
  const dates = useMemo(() => spanDates(anchor, span), [anchor, span])
  const preferred = useRowDetail()
  const detail = detailProp ?? preferred
  const wide = useWide()
  const online = useOnline()
  useEffect(() => rememberCalendarMode('plan'), [])

  const { zone, projects, rawTasks, viewed, feeds, days } = usePlanDays(dates, today, prefs.dayLength)
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const memberMap = useMembershipMap()
  const viewedMap = useMemo(() => new Map(viewed.map((task) => [task.id, task])), [viewed])
  const rawMap = useMemo(() => new Map(rawTasks.map((task) => [task.id, task])), [rawTasks])
  const editable = useCallback((task: Task) => canEditTasks(roleOf(task.project_id, memberMap)), [memberMap])
  /** Selection order: the span's task rows column by column; projected and event rows never take part. */
  const order = useMemo(() => days.flatMap((d) => d.entries.flatMap((e) => (e.kind === 'task' ? [e.task.id] : []))), [days])

  const [focused, setFocused] = useState(anchor)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const gridRef = useRef<HTMLDivElement>(null)
  // A new anchor (navigation, a task followed past the span) moves the focus there unless a move set it.
  const followed = useRef<string | null>(null)
  useEffect(() => { setFocused(followed.current ?? anchor); followed.current = null }, [anchor])

  const goTo = useCallback((d: string) => navigate({ view: 'plan', date: d === today ? undefined : d }), [today])
  // The latest span, for keyboard moves that finish after a re-render.
  const spanRef = useRef({ anchor, span })
  spanRef.current = { anchor, span }
  /** Keep a day on screen: outside the span, the span moves by whole weeks. */
  const show = useCallback((d: string) => {
    setFocused(d)
    const next = followAnchor(spanRef.current.anchor, spanRef.current.span, d)
    if (next !== spanRef.current.anchor) { followed.current = d; goTo(next) }
  }, [goTo])

  // Keyboard moves run one after another on the freshest row (as in the Month).
  const queue = useRef<Promise<void>>(Promise.resolve())
  const move = useCallback((id: string, n: number) => {
    queue.current = queue.current.then(async () => {
      const raw = await getTask(id)
      if (!raw || raw.deleted_at || !raw.due) return
      const task = viewedTask(raw)
      if (!task.due) return
      const due = nudgeDue(task.due, { days: n })
      await updateTask(id, { due: dueFromView(raw.due, due) })
      show(due.date)
    }).catch(reportActionError)
  }, [show])

  /** Dropped on a day: same time and zone, new date (one due edit, with Undo). */
  const dropOn = useCallback((id: string, d: string) => {
    const task = viewedMap.get(id)
    if (!task || task.due?.date === d) return
    act(setDueWithUndo(id, dueFromView(rawMap.get(id)?.due, { date: d, ...(task.due?.time ? { time: task.due.time } : {}) })))
    setSelectedId(id)
    setFocused(d)
  }, [viewedMap, rawMap])
  const startDrag = useCallback((task: Task, e: React.PointerEvent) => {
    if (e.button !== 0 || !editable(task)) return
    beginDrag(e, { label: task.title || t('Untitled'), onDrop: (key) => { if (key.startsWith('day:')) dropOn(task.id, key.slice(4)) } })
  }, [editable, dropOn])

  const selectedTask = selectedId ? rawMap.get(selectedId) : undefined
  const step = (dir: 1 | -1) => {
    const idx = selectedId ? order.indexOf(selectedId) : -1
    const next = order[dir === 1 ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1)] ?? null
    setSelectedId(next)
    const d = next ? days.find((day) => day.entries.some((e) => e.kind === 'task' && e.task.id === next))?.date : undefined
    if (d) setFocused(d)
  }
  // The Plan's keys are `view` entries of the shortcut registry (planner-view D6).
  useShortcutScope('view', {
    'plan.move': (e) => {
      if (selectedTask) { if (editable(selectedTask)) move(selectedTask.id, ARROWS[e.key]) } else show(addDaysISO(focused, ARROWS[e.key]))
    },
    'plan.focus': (e) => show(addDaysISO(focused, ARROWS[e.key])),
    'plan.next': () => step(1),
    'plan.prev': () => step(-1),
    'plan.open': () => { if (!selectedId) return false; setPanelTaskId(selectedId) },
    'plan.complete': () => {
      if (!selectedTask || !editable(selectedTask)) return false
      act(completeWithUndo(selectedTask.id, true))
      setSelectedId(null)
    },
    'plan.escape': () => { if (openId) setPanelTaskId(null); else setSelectedId(null) },
    'plan.quick-add': () => setAdding(focused),
    'plan.range-prev': () => goTo(addDaysISO(anchor, -7)),
    'plan.range-next': () => goTo(addDaysISO(anchor, 7)),
    'plan.today': () => goTo(today),
  }, { view: 'plan' })

  // The focused day takes the browser focus while the grid has it (roving tabindex).
  useEffect(() => {
    const g = gridRef.current
    if (!g || !g.contains(document.activeElement)) return
    g.querySelector<HTMLElement>(`[data-plan-day="${focused}"]`)?.focus()
  }, [focused])

  // The planning list in the panel slot (time-blocking): drag a task onto a day, or `s` puts it on the focused day.
  const planActions = useRef<PlanActions>({ onPointerDown: () => {}, onPlace: () => {}, onOpen: () => {} })
  planActions.current = {
    onPointerDown: (e, id) => { const task = rawMap.get(id); if (task) startDrag(task, e) },
    onPlace: (id) => { const task = rawMap.get(id); if (task && editable(task)) dropOn(id, focused) },
    onOpen: (id) => setPanelTaskId(id),
  }
  const planOpen = usePanelOccupantKey() === PLAN_PANEL
  const togglePlan = () => (planOpen ? closePanel() : openPanel(PLAN_PANEL, () => <PlanPanel actions={planActions} />))

  const from = dates[0], to = dates[dates.length - 1]
  const title = `${anchor === today ? t('Next {n} days', { n: span }) : t('{n} days', { n: span })} · ${formatShort(from)} – ${formatShort(to)}`
  const eventHue = hueFor(feeds.subs[0]?.color ?? null)
  const rowProps = { today, detail, selectedId, editable, projectMap, subMap: feeds.subMap, zone, onPointerDown: startDrag, onOpen: (id: string) => { setSelectedId(id); setPanelTaskId(id) } }

  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="plan">
      <PageHeader title={title} help="calendar"
        meta={<CalendarStatus status={feeds.status} online={online} fetchedAt={feeds.win?.fetchedAt} />}
        actions={<>
          {feeds.subs.length > 0 && (
            <Button variant="ghost" size="sm" icon="calendar-range" aria-pressed={feeds.eventsShown} data-calendars-toggle
              title={feeds.eventsShown ? t('Hide other calendars on this device') : t('Show other calendars on this device')}
              className={feeds.eventsShown ? 'bg-sunken dark:bg-raised' : 'text-muted'}
              onClick={() => act(setShowEvents(!feeds.eventsShown))}>{t('Calendars')}</Button>
          )}
          <span className="flex items-center" role="group" aria-label={t('Range')}>
            <Button variant="ghost" size="sm" icon="chevron-left" aria-label={t('Previous week')} onClick={() => goTo(addDaysISO(anchor, -7))} />
            <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
            <Button variant="ghost" size="sm" icon="chevron-right" aria-label={t('Next week')} onClick={() => goTo(addDaysISO(anchor, 7))} />
          </span>
          <CalendarRangeSwitch mode="plan" date={date} />
        </>}
        overflow={<>
          {PLAN_SPANS.map((n) => (
            <MenuItem key={n} label={t('{n} days', { n })} icon="calendar-days" checked={span === n} data-plan-span={n}
              onSelect={() => act(saveGridPrefs({ ...prefs, planDays: n }))} />
          ))}
          <MenuSeparator />
          <MenuItem label={planOpen ? t('Hide the planning list') : t('Plan from a list')} icon="list" description={t('Drag tasks onto a day, or press s on one')} onSelect={togglePlan} />
        </>} />
      {wide ? (
        <PlanGrid gridRef={gridRef} title={title} days={days} today={today} focused={focused} dayLength={prefs.dayLength} eventHue={eventHue}
          onFocusDay={(d, keepSelection) => { setFocused(d); if (!keepSelection) setSelectedId(null) }} onAdd={setAdding}
          rowProps={{ ...rowProps, onSelect: (id, d) => { setSelectedId(id); setFocused(d) } }} />
      ) : (
        <PlanAgenda days={days} today={today} dayLength={prefs.dayLength} eventHue={eventHue} onAdd={setAdding}
          rowProps={{ ...rowProps, onSelect: (id, d) => { setSelectedId(id); setFocused(d) } }} />
      )}
      <p className="mt-3 hidden text-meta text-faint sm:block">
        {t.rich('Arrows move the focused day, or the selected task. {j} / {k} select, {q} adds on the focused day.', { j: <span className="ui-kbd">j</span>, k: <span className="ui-kbd">k</span>, q: <span className="ui-kbd">q</span> })}
      </p>
      {adding && <AddOnDayDialog date={adding} projects={projects} onClose={() => setAdding(null)} />}
    </PageBody>
  )
}

export type PlanRowProps = Omit<React.ComponentProps<typeof PlanDayRows>, 'day' | 'large'>

/** Seven columns per row (design D2): weekday headers once, each cell with its date, capacity and rows. */
function PlanGrid({ gridRef, title, days, today, focused, dayLength, eventHue, onFocusDay, onAdd, rowProps }: {
  gridRef: React.RefObject<HTMLDivElement | null>
  title: string
  days: PlanDayData[]
  today: string
  focused: string
  dayLength: number
  eventHue?: string
  /** A day was chosen; a click on the day clears the selection, focus arriving there (also from selecting one of its tasks) keeps it. */
  onFocusDay: (d: string, keepSelection?: boolean) => void
  onAdd: (d: string) => void
  rowProps: PlanRowProps
}) {
  const weeks = useMemo(() => Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => days.slice(i * 7, i * 7 + 7)), [days])
  const weekday = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number)
    return new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'short' }).format(new Date(y, m - 1, dd))
  }
  return (
    <div ref={gridRef} role="grid" aria-label={title} aria-readonly={false} className="w-full min-w-0 select-none" data-plan-grid>
      <div role="row" className="grid grid-cols-7 border-b border-default">
        {weeks[0].map((d) => <div key={d.date} role="columnheader" className="px-1 py-1 text-center text-hint font-medium text-muted">{weekday(d.date)}</div>)}
      </div>
      {weeks.map((week) => (
        <div key={week[0].date} role="row" className="grid grid-cols-7">
          {week.map((day) => {
            const d = day.date
            const tasks = day.entries.filter((e) => e.kind === 'task').length
            const isFocused = d === focused
            return (
              <div key={d} role="gridcell" tabIndex={isFocused ? 0 : -1} data-plan-day={d} data-drop-target={`day:${d}`}
                aria-selected={isFocused} aria-current={d === today ? 'date' : undefined}
                onClick={() => onFocusDay(d)}
                onFocus={(e) => { if (e.target === e.currentTarget) onFocusDay(d, true) }}
                className={`group relative flex min-h-36 min-w-0 flex-col gap-1 border-b border-l border-default p-1 outline-none first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus data-[drop-active]:bg-accent-soft ${d < today ? 'bg-sunken' : ''} ${isFocused ? 'bg-accent-soft/40' : ''}`}>
                {/* Named by its content (WCAG 2.5.3 Label in Name): the date, the counts and the load first, then the rows' own names. */}
                <span className="sr-only">{[formatShort(d), tasks ? t('{n, plural, one {# task} other {# tasks}}', { n: tasks }) : '', day.load.over ? t('over capacity') : ''].filter(Boolean).join(', ')}</span>
                <div aria-hidden className="flex items-center justify-between gap-1">
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-meta tabular-nums ${d === today ? 'bg-accent font-semibold text-on-accent' : 'text-muted'}`}>{formatShort(d)}</span>
                </div>
                <CapacityBar load={day.load} dayLength={dayLength} eventHue={eventHue} />
                <PlanDayRows day={day} {...rowProps} />
                <Button variant="ghost" size="sm" icon="plus" tabIndex={-1} data-plan-add={d}
                  className="mt-auto self-start opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onAdd(d) }}>{t('Add')}</Button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
