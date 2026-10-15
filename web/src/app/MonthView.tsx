// The Month view (OpenSpec change month-and-timeline-views, month-view spec): a
// six-week grid of due dates, a pure projection of local tasks like Day and Week.
// Moving a task, by drag onto a day or with the arrows, is one due edit that keeps
// its time and zone; `q` adds a task due on the focused day. Works offline.
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, hueFor, PageBody, PageHeader, useMediaQuery } from '../ui'
import { calendarTasks, dayLoad, formatLoad, nudgeDue } from '../lib/calendar'
import { rememberCalendarMode } from '../lib/calendarMode'
import { addDaysISO, dueFromView, formatTime, viewedTask } from '../lib/dates'
import { db } from '../lib/db'
import { beginDrag } from '../lib/dnd'
import { formatMinutes } from '../lib/duration'
import { cellTasks, monthGrid, visibleRows } from '../lib/month'
import { createTask, updateTask } from '../lib/ops'
import { canEditTasks, roleOf } from '../lib/sharing'
import { visibleTasks } from '../lib/trash'
import type { Membership, Project, Task } from '../lib/types'
import { CalendarRangeSwitch } from './CalendarRange'
import { useGridPrefs } from './CalendarView'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { Dialog } from './overlay/Dialog'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { QuickAdd } from './QuickAdd'
import { navigate } from './router'
import { isGPending } from './signals'
import { setDueWithUndo } from './undoable'
import { useToday, useViewerZone } from './useViews'

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
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const rawTasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const viewed = useMemo(() => rawTasks.map((t) => viewedTask(t, zone)), [rawTasks, zone])
  // The Day and Week selection (open, live, not archived) over the six weeks.
  const shownIds = useMemo(() => new Set(calendarTasks(viewed, projects, days[0], days[days.length - 1]).map((t) => t.id)), [viewed, projects, days])
  const shownRaw = useMemo(() => rawTasks.filter((t) => shownIds.has(t.id)), [rawTasks, shownIds])
  const shownViewed = useMemo(() => viewed.filter((t) => shownIds.has(t.id)), [viewed, shownIds])
  const cells = useMemo(() => new Map(days.map((d) => [d, cellTasks(shownRaw, d, zone)])), [days, shownRaw, zone])
  const viewedMap = useMemo(() => new Map(viewed.map((t) => [t.id, t])), [viewed])
  const rawMap = useMemo(() => new Map(rawTasks.map((t) => [t.id, t])), [rawTasks])
  const editable = useCallback((t: Task) => canEditTasks(roleOf(t.project_id, memberMap)), [memberMap])

  /** Selection order: the month's tasks in grid order (`j` / `k`). */
  const order = useMemo(() => days.flatMap((d) => (cells.get(d) ?? []).map((t) => t.id)), [days, cells])

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
      const raw = await db.tasks.get(id)
      if (!raw || raw.deleted_at || !raw.due) return
      const t = viewedTask(raw)
      if (!t.due) return
      const due = nudgeDue(t.due, { days })
      await updateTask(id, { due: dueFromView(raw.due, due) })
      setFocused(due.date)
      if (due.date.slice(0, 7) !== month) goTo(due.date)
    }).catch(() => undefined)
  }, [month, goTo])

  /** Dropped on a day: same time and zone, new date (one due edit, with Undo). */
  const dropOn = useCallback((id: string, d: string) => {
    const t = viewedMap.get(id)
    if (!t?.due || t.due.date === d) return
    void setDueWithUndo(id, dueFromView(rawMap.get(id)?.due, { date: d, ...(t.due.time ? { time: t.due.time } : {}) }))
    setSelectedId(id)
    setFocused(d)
  }, [viewedMap, rawMap])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isGPending()) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      const idx = selectedId ? order.indexOf(selectedId) : -1
      const task = selectedId ? rawMap.get(selectedId) : undefined
      const arrows: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      if (e.key in arrows) {
        e.preventDefault()
        if (task && !e.shiftKey) {
          if (editable(task)) move(task.id, arrows[e.key])
        } else focusDay(addDaysISO(focused, arrows[e.key]))
        return
      }
      switch (e.key) {
        case 'j':
        case 'k': {
          e.preventDefault()
          const next = order[e.key === 'j' ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1)] ?? null
          setSelectedId(next)
          const d = next ? viewedMap.get(next)?.due?.date : undefined
          if (d) setFocused(d)
          return
        }
        case 'Enter':
          if (selectedId) {
            e.preventDefault()
            setPanelTaskId(selectedId)
          }
          return
        case 'Escape':
          if (expanded) setExpanded(null)
          else if (openId) setPanelTaskId(null)
          else setSelectedId(null)
          return
        case 'q':
          e.preventDefault()
          setAdding(focused)
          return
        case '[':
          goTo(addMonthsISO(anchor, -1))
          return
        case ']':
          goTo(addMonthsISO(anchor, 1))
          return
        case 't':
          goTo(today)
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, order, rawMap, viewedMap, editable, move, focusDay, focused, expanded, openId, goTo, anchor, today])

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
    if (d && (cells.get(d)?.length ?? 0) > CELL_ROWS && !visibleRows(cells.get(d)!, CELL_ROWS).shown.some((t) => t.id === selectedId)) setExpanded(d)
  }, [selectedId, viewedMap, cells])

  const [y, m] = month.split('-').map(Number)
  const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  const weekdays = grid[0].map((d) => {
    const [yy, mm, dd] = d.split('-').map(Number)
    return new Intl.DateTimeFormat(undefined, { weekday: narrow ? 'narrow' : 'short' }).format(new Date(yy, mm - 1, dd))
  })

  const row = (t: Task, compact: boolean) => {
    const v = viewedMap.get(t.id)
    const canEdit = editable(t)
    const selected = selectedId === t.id
    const hue = hueFor(t.project_id ? projectMap.get(t.project_id)?.color : null)
    return (
      <button key={t.id} type="button" tabIndex={-1} data-month-task={t.id} data-hue={hue} aria-pressed={selected}
        aria-label={`${t.title || 'Untitled'}${v?.due?.time ? `, ${formatTime(v.due.time)}` : ''}${t.priority < 4 ? `, priority ${t.priority}` : ''}${canEdit ? '' : ', read-only'}`}
        onPointerDown={canEdit ? (e) => {
          if (e.button !== 0) return
          beginDrag(e, { label: t.title, onDrop: (key) => { if (key.startsWith('day:')) dropOn(t.id, key.slice(4)) } })
        } : undefined}
        onClick={(e) => { e.stopPropagation(); setSelectedId(t.id); if (v?.due) setFocused(v.due.date) }}
        onDoubleClick={() => setPanelTaskId(t.id)}
        className={`flex w-full min-w-0 touch-manipulation items-center gap-1 rounded-chip border-l-3 border-l-hue-solid px-1 text-left ${compact ? 'py-0 text-hint' : 'py-0.5 text-meta'} ${selected ? 'bg-accent-soft ring-1 ring-accent' : 'bg-sunken hover:bg-sunken dark:bg-raised'} ${canEdit ? 'cursor-grab' : ''}`}>
        {v?.due?.time && <span className="shrink-0 tabular-nums text-muted">{formatTime(v.due.time)}</span>}
        <span className="min-w-0 flex-1 truncate">{t.title || 'Untitled'}</span>
        {t.priority < 4 && <span className="shrink-0 text-hint font-semibold text-muted" data-priority={t.priority}>P{t.priority}</span>}
      </button>
    )
  }

  const focusedTasks = cells.get(focused) ?? []
  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="month">
      <PageHeader title={title} help="calendar"
        actions={<>
          <span className="flex items-center" role="group" aria-label="Range">
            <Button variant="ghost" size="sm" icon="chevron-left" aria-label="Previous month" onClick={() => goTo(addMonthsISO(anchor, -1))} />
            <Button variant="ghost" size="sm" onClick={() => goTo(today)}>Today</Button>
            <Button variant="ghost" size="sm" icon="chevron-right" aria-label="Next month" onClick={() => goTo(addMonthsISO(anchor, 1))} />
          </span>
          <CalendarRangeSwitch mode="month" date={date} />
        </>} />
      <div ref={gridRef} role="grid" aria-label={`${title} calendar`} aria-readonly={false} className="w-full min-w-0 select-none" data-month-grid>
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
                  aria-label={`${d}${list.length ? `, ${list.length} ${list.length === 1 ? 'task' : 'tasks'}` : ''}${load.over ? ', over capacity' : ''}`}
                  onClick={() => { setFocused(d); setSelectedId(null) }}
                  onFocus={(e) => { if (e.target === e.currentTarget) setFocused(d) }}
                  className={`relative min-w-0 border-b border-l border-default p-1 outline-none first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus data-[drop-active]:bg-accent-soft ${narrow ? 'min-h-14' : 'min-h-28'} ${outside ? 'bg-sunken text-faint' : ''} ${isFocused ? 'bg-accent-soft/40' : ''}`}>
                  <div className="mb-0.5 flex items-center justify-between gap-1">
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-meta tabular-nums ${d === today ? 'bg-accent font-semibold text-on-accent' : ''}`}>{Number(d.slice(8))}</span>
                    {!narrow && load.planned > 0 && (
                      <span data-capacity data-over={load.over || undefined}
                        className={`whitespace-nowrap rounded-chip px-1 text-hint tabular-nums ${load.over ? 'bg-danger-soft font-semibold text-danger' : 'text-muted'}`}>
                        {formatLoad(load, prefs.dayLength)}
                      </span>
                    )}
                  </div>
                  {narrow ? (
                    list.length > 0 && <span data-month-count className="block text-center text-meta font-medium text-default">{list.length}</span>
                  ) : (
                    <div className="space-y-0.5">
                      {shown.map((t) => row(t, false))}
                      {hidden > 0 && (
                        <button type="button" tabIndex={-1} data-month-more={hidden} aria-expanded={false}
                          onClick={(e) => { e.stopPropagation(); setExpanded(d) }}
                          className="w-full rounded-chip px-1 text-left text-hint font-medium text-muted hover:bg-sunken dark:hover:bg-raised">
                          +{hidden} more
                        </button>
                      )}
                      {open && list.length > CELL_ROWS && (
                        <button type="button" tabIndex={-1} aria-expanded onClick={(e) => { e.stopPropagation(); setExpanded(null) }}
                          className="w-full rounded-chip px-1 text-left text-hint text-muted hover:bg-sunken dark:hover:bg-raised">Show less</button>
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
        <section aria-label={`Tasks on ${focused}`} className="mt-3 space-y-1" data-month-day-list>
          {focusedTasks.length === 0
            ? <p className="px-1 py-2 text-meta text-faint">Nothing due on this day. Press q to add a task.</p>
            : focusedTasks.map((t) => row(t, false))}
        </section>
      )}
      <p className="mt-3 hidden text-meta text-faint sm:block">
        Arrows move the focused day, or the selected task. <span className="ui-kbd">j</span> / <span className="ui-kbd">k</span> select, <span className="ui-kbd">q</span> adds on the focused day.
        {shownRaw.some((t) => t.estimate_minutes) ? ` Planned estimates against a ${formatMinutes(prefs.dayLength)} day.` : ''}
      </p>
      {adding && (
        <Dialog title={`Add a task on ${adding}`} onClose={() => setAdding(null)} size="md">
          <QuickAdd autoFocus hideHint placeholder="Task name" label={`Add a task due ${adding}`} projects={projects} onAdd={async (input) => {
            await createTask({ due: { date: adding }, ...input })
            setAdding(null)
          }} />
        </Dialog>
      )}
    </PageBody>
  )
}
