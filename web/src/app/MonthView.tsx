// The Month view (OpenSpec change month-and-timeline-views, month-view spec): a
// six-week grid of due dates, a pure projection of local tasks like Day and Week.
// Moving a task, by drag onto a day or with the arrows, is one due edit that keeps
// its time and zone; `q` adds a task due on the focused day. Works offline.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, hueFor, PageBody, PageHeader, useMediaQuery } from '../ui'
import { calendarTasks, dayLoad, nudgeDue } from '../lib/calendar'
import { rememberCalendarMode } from '../lib/calendarMode'
import { addDaysISO, dueFromView, formatTime, viewedTask, dateLocaleOf } from '../lib/dates'
import { getTask, useMembershipMap, useProjects } from '../lib/localData'
import { beginDrag } from '../lib/dnd'
import { formatMinutes } from '../lib/duration'
import { cellTasks, monthGrid, visibleRows } from '../lib/month'
import { updateTask } from '../lib/ops'
import { canEditTasks, roleOf } from '../lib/sharing'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import type { Task } from '../lib/types'
import { CalendarRangeSwitch } from './CalendarRange'
import { useGridPrefs } from './CalendarView'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { AddOnDayDialog } from './calendar/AddOnDayDialog'
import { keysOf } from '../lib/shortcuts'
import { navigate } from './router'
import { useShortcutScope } from './shortcuts'
import { setDueWithUndo } from './undoable'
import { useToday, useViewerZone } from './useViews'
import { t } from '../lib/i18n'
import { act, reportActionError } from './actionError'
import { CapacityLine } from './calendar/CapacityLine'

/** Task rows a desktop cell shows before "+N more". */
const CELL_ROWS = 3

/** The same day of the month `months` away, clamped to the month's last day. */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const first = new Date(y, m - 1 + months, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const day = Math.min(d, last)
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function MonthView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const month = anchor.slice(0, 7)
  const { resolved } = useDateTimeFormat()
  const zone = useViewerZone()
  const prefs = useGridPrefs()
  const narrow = useMediaQuery('(max-width: 639px)')
  useEffect(() => rememberCalendarMode('month'), [])

  const grid = useMemo(() => monthGrid(anchor, resolved.weekStart), [anchor, resolved.weekStart])
  const days = useMemo(() => grid.flat(), [grid])
  const projects = useProjects()
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const memberMap = useMembershipMap()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const viewed = useMemo(() => rawTasks.map((task) => viewedTask(task, zone)), [rawTasks, zone])
  // The Day and Week selection (open, live, not archived) over the six weeks.
  const shownIds = useMemo(() => new Set(calendarTasks(viewed, projects, days[0], days[days.length - 1]).map((tk) => tk.id)), [viewed, projects, days])
  const shownRaw = useMemo(() => rawTasks.filter((item) => shownIds.has(item.id)), [rawTasks, shownIds])
  const shownViewed = useMemo(() => viewed.filter((task) => shownIds.has(task.id)), [viewed, shownIds])
  const cells = useMemo(() => new Map(days.map((d) => [d, cellTasks(shownRaw, d, zone)])), [days, shownRaw, zone])
  const viewedMap = useMemo(() => new Map(viewed.map((task) => [task.id, task])), [viewed])
  const rawMap = useMemo(() => new Map(rawTasks.map((task) => [task.id, task])), [rawTasks])
  const editable = useCallback((task: Task) => canEditTasks(roleOf(task.project_id, memberMap)), [memberMap])

  /** Selection order: the month's tasks in grid order (`j` / `k`). */
  const order = useMemo(() => days.flatMap((d) => (cells.get(d) ?? []).map((task) => task.id)), [days, cells])

  const [focused, setFocused] = useState(anchor)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const gridRef = useRef<HTMLDivElement>(null)

  // A new anchor (navigation, a task followed into another month) moves the focus there.
  useEffect(() => { setFocused(anchor) }, [anchor])

  const goTo = useCallback((d: string) => navigate({ view: 'month', date: d === today ? undefined : d }), [today])
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
      if (!raw || raw.deleted_at || !raw.due) return
      const task = viewedTask(raw)
      if (!task.due) return
      const due = nudgeDue(task.due, { days })
      await updateTask(id, { due: dueFromView(raw.due, due) })
      setFocused(due.date)
      if (due.date.slice(0, 7) !== month) goTo(due.date)
    }).catch(reportActionError)
  }, [month, goTo])

  /** Dropped on a day: same time and zone, new date (one due edit, with Undo). */
  const dropOn = useCallback((id: string, d: string) => {
    const task = viewedMap.get(id)
    if (!task?.due || task.due.date === d) return
    act(setDueWithUndo(id, dueFromView(rawMap.get(id)?.due, { date: d, ...(task.due.time ? { time: task.due.time } : {}) })))
    setSelectedId(id)
    setFocused(d)
  }, [viewedMap, rawMap])

  // The Month view's keys are `view` entries of the shortcut registry (keyboard-
  // shortcuts "One shortcut registry with scopes"): the dispatcher keeps them out
  // of text fields and dialogs and runs the `g` sequences first.
  const idx = selectedId ? order.indexOf(selectedId) : -1
  const selectedTask = selectedId ? rawMap.get(selectedId) : undefined
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
    'month.open': () => { if (!selectedId) return false; setPanelTaskId(selectedId) },
    'month.escape': () => {
      if (expanded) setExpanded(null)
      else if (openId) setPanelTaskId(null)
      else setSelectedId(null)
    },
    'month.quick-add': () => setAdding(focused),
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
    if (d && (cells.get(d)?.length ?? 0) > CELL_ROWS && !visibleRows(cells.get(d)!, CELL_ROWS).shown.some((task) => task.id === selectedId)) setExpanded(d)
  }, [selectedId, viewedMap, cells])

  const [y, m] = month.split('-').map(Number)
  const title = new Intl.DateTimeFormat(dateLocaleOf(), { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  const weekdays = grid[0].map((d) => {
    const [yy, mm, dd] = d.split('-').map(Number)
    return new Intl.DateTimeFormat(dateLocaleOf(), { weekday: narrow ? 'narrow' : 'short' }).format(new Date(yy, mm - 1, dd))
  })

  const row = (task: Task, compact: boolean) => {
    const v = viewedMap.get(task.id)
    const canEdit = editable(task)
    const selected = selectedId === task.id
    const hue = hueFor(task.project_id ? projectMap.get(task.project_id)?.color : null)
    return (
      <button key={task.id} type="button" tabIndex={-1} data-month-task={task.id} data-hue={hue} aria-pressed={selected}
        onPointerDown={canEdit ? (e) => {
          if (e.button !== 0) return
          beginDrag(e, { label: task.title, onDrop: (key) => { if (key.startsWith('day:')) dropOn(task.id, key.slice(4)) } })
        } : undefined}
        onClick={(e) => { e.stopPropagation(); setSelectedId(task.id); if (v?.due) setFocused(v.due.date) }}
        onDoubleClick={() => setPanelTaskId(task.id)}
        className={`ui-block ui-block--row flex w-full min-w-0 touch-manipulation items-center gap-1 px-1 text-left ${compact ? 'py-0 text-hint' : 'py-0.5 text-meta'} ${v?.due && v.due.date < today ? 'ui-block--past' : ''} ${selected ? 'ring-1 ring-accent' : ''} ${canEdit ? 'cursor-grab' : ''}`}>
        {/* Named by its content (WCAG 2.5.3 Label in Name): the spoken text is visually hidden, the visible one is not read twice. */}
        <span className="sr-only">{[task.title || t('Untitled'), v?.due?.time ? formatTime(v.due.time) : '', task.priority < 4 ? t('priority {n}', { n: task.priority }) : '', canEdit ? '' : t('read-only')].filter(Boolean).join(', ')}</span>
        {v?.due?.time && <span aria-hidden className="shrink-0 tabular-nums">{formatTime(v.due.time)}</span>}
        <span aria-hidden className="min-w-0 flex-1 truncate">{task.title || t('Untitled')}</span>
        {task.priority < 4 && <span aria-hidden className="shrink-0 text-hint font-semibold" data-priority={task.priority}>P{task.priority}</span>}
      </button>
    )
  }

  const focusedTasks = cells.get(focused) ?? []
  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="month">
      <PageHeader title={title} help="calendar"
        actions={<>
          <span className="flex items-center" role="group" aria-label={t('Range')}>
            <Button variant="ghost" size="sm" icon="chevron-left" aria-label={t('Previous month')} onClick={() => goTo(addMonthsISO(anchor, -1))} />
            <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
            <Button variant="ghost" size="sm" icon="chevron-right" aria-label={t('Next month')} onClick={() => goTo(addMonthsISO(anchor, 1))} />
          </span>
          <CalendarRangeSwitch mode="month" date={date} />
        </>} />
      <div ref={gridRef} role="grid" aria-label={t('{title} calendar', { title })} aria-readonly={false} className="w-full min-w-0 select-none" data-month-grid>
        <div role="row" className="grid grid-cols-7 border-b border-default">
          {weekdays.map((w, i) => <div key={i} role="columnheader" className="px-1 py-1 text-center text-hint font-medium text-muted">{w}</div>)}
        </div>
        {grid.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((d) => {
              const list = cells.get(d) ?? []
              const outside = d.slice(0, 7) !== month
              const load = dayLoad(shownViewed, d, prefs.dayLength)
              const open = expanded === d
              const { shown, hidden } = open ? { shown: list, hidden: 0 } : visibleRows(list, CELL_ROWS)
              const isFocused = d === focused
              return (
                <div key={d} role="gridcell" tabIndex={isFocused ? 0 : -1} data-month-day={d} data-drop-target={`day:${d}`}
                  aria-selected={isFocused} aria-current={d === today ? 'date' : undefined}
                  onClick={() => { setFocused(d); setSelectedId(null) }}
                  onFocus={(e) => { if (e.target === e.currentTarget) setFocused(d) }}
                  className={`relative min-w-0 border-b border-l border-default p-1 outline-none first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus data-[drop-active]:bg-accent-soft ${narrow ? 'min-h-14' : 'min-h-28'} ${outside ? 'bg-sunken text-faint' : ''} ${isFocused ? 'bg-accent-soft/40' : ''}`}>
                  {/* Named by its content (WCAG 2.5.3 Label in Name): the date and counts first, then the tasks' own names. */}
                  <span className="sr-only">{[d, list.length ? t('{n, plural, one {# task} other {# tasks}}', { n: list.length }) : '', load.over ? t('over capacity') : ''].filter(Boolean).join(', ')}</span>
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
                      {shown.map((task) => row(task, false))}
                      {hidden > 0 && (
                        <button type="button" tabIndex={-1} data-month-more={hidden} aria-expanded={false}
                          onClick={(e) => { e.stopPropagation(); setExpanded(d) }}
                          className="w-full rounded-chip px-1 text-left text-hint font-medium text-muted hover:bg-sunken dark:hover:bg-raised">
                          {t('+{hidden} more', { hidden })}
                        </button>
                      )}
                      {open && list.length > CELL_ROWS && (
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
      {narrow && (
        <section aria-label={t('Tasks on {focused}', { focused })} className="mt-3 space-y-1" data-month-day-list>
          {focusedTasks.length === 0
            ? <EmptyState compact title={t('Nothing planned.')} action={{ label: t('Add a task'), onClick: () => setAdding(focused), shortcut: keysOf('month.quick-add') }} />
            : focusedTasks.map((task) => row(task, false))}
        </section>
      )}
      <p className="mt-3 hidden text-meta text-faint sm:block">
        {t.rich('Arrows move the focused day, or the selected task. {j} / {k} select, {q} adds on the focused day.', { j: <span className="ui-kbd">j</span>, k: <span className="ui-kbd">k</span>, q: <span className="ui-kbd">q</span> })}
        {shownRaw.some((task) => task.estimate_minutes) ? ` ${t('Planned estimates against a {minutes} day.', { minutes: formatMinutes(prefs.dayLength) })}` : ''}
      </p>
      {adding && <AddOnDayDialog date={adding} projects={projects} onClose={() => setAdding(null)} />}
    </PageBody>
  )
}
