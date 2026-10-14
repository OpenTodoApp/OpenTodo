// Day and Week time-blocking views (OpenSpec `time-blocking`). A pure projection of
// local tasks: a task with a due time is a block at that time, as long as its
// estimate; date-only tasks sit in each day's unscheduled lane. Every placement,
// by pointer or keyboard, is one `updateTask` call (an ordinary field op).
import { Icon } from '../ui/Icon'
import { hueFor } from '../ui/tokens/palette'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  blockFor, calendarTasks, clamp, DAY_MINUTES, dayLoad, DEFAULT_GRID_PREFS, formatLoad, formatTime as toHHMM, GRID_PREFS_META_KEY, LAST_SLOT,
  normalizeGridPrefs, nudgeDue, placementStart, SLOT_MINUTES, stepEstimate, weekDates, type Block, type GridPrefs,
} from '../lib/calendar'
import { addDaysISO, dueFromView, formatDate, formatHour, formatShort, formatTime as formatWallTime, localDueOf, viewedTask } from '../lib/dates'
import { db, getMeta } from '../lib/db'
import { formatMinutes } from '../lib/duration'
import { layoutDay, type DayLayout } from '../lib/layout'
import { compareByPosition, compareDueThenPriority } from '../lib/ordering'
import { setTaskCompleted, updateTask } from '../lib/ops'
import type { Label, Project, Task } from '../lib/types'
import { useCalendarDrag, type DropTarget } from './calendarDrag'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { navigate } from './router'
import { estimateFocus, isGPending, placement as placementSignal } from './signals'
import { TaskDetail } from './TaskDetail'
import { useToday, useViewerZone } from './useViews'
import { visibleTasks } from '../lib/trash'

/** 48 px per hour, 12 px per 15-minute slot. */
const PX_PER_MIN = 0.8
const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN
const TRAY_KEY = 'opentodo.calendar.tray'
/** Pointer-down this close to a block's lower edge starts a resize. */
const RESIZE_ZONE_PX = 7

interface Placement {
  taskId: string
  date: string
  start: number
}

interface DayData {
  date: string
  lane: Task[]
  blocks: Map<string, Block>
  layout: DayLayout
}

/** Live preferences of this device (Dexie meta, never synced). */
/** Minutes from midnight as shown to the user, in their time format (date-time-preferences D2). */
const formatTime = (minutes: number) => formatWallTime(toHHMM(minutes))

export function useGridPrefs(): GridPrefs {
  return useLiveQuery(() => getMeta<unknown>(GRID_PREFS_META_KEY, null).then(normalizeGridPrefs), [], DEFAULT_GRID_PREFS)
}

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

function readTray(): string {
  try {
    return localStorage.getItem(TRAY_KEY) ?? 'inbox'
  } catch {
    return 'inbox'
  }
}

export function CalendarView({ mode, date }: { mode: 'day' | 'week'; date?: string }) {
  const today = useToday()
  const nowMinutes = useNowMinutes()
  const anchor = date ?? today
  // The Week view starts on the preferred first day (date-time-preferences D5).
  const { resolved } = useDateTimeFormat()
  const dates = useMemo(() => (mode === 'day' ? [anchor] : weekDates(anchor, resolved.weekStart)), [mode, anchor, resolved.weekStart])
  const prefs = useGridPrefs()

  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const rawTasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  // The grid shows every due in the viewer's zone (absolute-datetimes): zoned dues
  // are converted here and edits are converted back with dueFromView.
  const zone = useViewerZone()
  const allTasks = useMemo(() => rawTasks.map((t) => viewedTask(t, zone)), [rawTasks, zone])
  const rawMap = useMemo(() => new Map(rawTasks.map((t) => [t.id, t])), [rawTasks])
  const taskMap = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks])

  const shown = useMemo(() => calendarTasks(allTasks, projects, dates[0], dates[dates.length - 1]), [allTasks, projects, dates])
  const days = useMemo<DayData[]>(() => dates.map((d) => {
    const lane: Task[] = []
    const blocks = new Map<string, Block>()
    for (const t of shown) {
      if (t.due?.date !== d) continue
      const b = blockFor(t)
      if (b) blocks.set(t.id, b)
      else lane.push(t)
    }
    lane.sort((a, b) => a.priority - b.priority || compareByPosition(a, b))
    return { date: d, lane, blocks, layout: layoutDay([...blocks.values()]) }
  }), [dates, shown])

  /** Keyboard order: each day's lane, then its blocks in time order. */
  const order = useMemo(() => days.flatMap((d) => [...d.lane.map((t) => t.id), ...d.layout.blocks.map((b) => b.id)]), [days])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [placing, setPlacing] = useState<Placement | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tray, setTray] = useState<string>(readTray)
  const [trayOpen, setTrayOpen] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)

  const startPlacing = useCallback((t: Task, onDate?: string, gridPrefs: GridPrefs = prefs) => {
    const d = onDate ?? (t.due?.date && dates.includes(t.due.date) ? t.due.date : dates.includes(today) ? today : dates[0])
    const now = new Date()
    setPlacing({ taskId: t.id, date: d, start: placementStart(t, d, today, now.getHours() * 60 + now.getMinutes(), gridPrefs) })
    setSelectedId(t.id)
  }, [dates, today, prefs])

  // `s` from a list sends a task here (placement mode). Read the row and the preferences
  // directly: on first render the live queries have not delivered yet.
  const startRef = useRef(startPlacing)
  startRef.current = startPlacing
  useEffect(() => {
    const take = () => {
      const id = placementSignal.take()
      if (!id) return
      void Promise.all([db.tasks.get(id), getMeta<unknown>(GRID_PREFS_META_KEY, null)]).then(([t, raw]) => {
        if (t && !t.deleted_at && !t.completed_at) startRef.current(viewedTask(t), date ?? today, normalizeGridPrefs(raw))
      })
    }
    take()
    return placementSignal.subscribe(take)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Start at the grid start hour; the hours before and after stay reachable by scrolling.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, prefs.startHour * 60 * PX_PER_MIN - 8)
  }, [prefs.startHour, mode])

  const commit = useCallback((taskId: string, target: DropTarget) => {
    const t = taskMap.get(taskId)
    if (!t) return
    const stored = rawMap.get(taskId)?.due
    if (target.type === 'slot') {
      const time = toHHMM(target.start)
      if (t.due?.date !== target.date || t.due?.time !== time) void updateTask(taskId, { due: dueFromView(stored, { date: target.date, time }) })
    } else if (target.type === 'lane') {
      if (t.due?.date !== target.date || t.due?.time) void updateTask(taskId, { due: dueFromView(stored, { date: target.date }) })
    } else if (target.estimate !== t.estimate_minutes) {
      void updateTask(taskId, { estimate_minutes: target.estimate })
    }
    setSelectedId(taskId)
  }, [taskMap, rawMap])

  const { drag, start: startDrag } = useCalendarDrag({ pxPerMinute: PX_PER_MIN, scroller, onDrop: commit })

  // Keyboard edits run one after another on the freshest row, so two quick presses
  // move a block two slots even before the live query has re-rendered.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const edit = useCallback((id: string, fn: (t: Task) => Partial<Omit<Task, 'id' | '_clock'>> | null, after?: (t: Task, patch: Partial<Task>) => void) => {
    queue.current = queue.current.then(async () => {
      const raw = await db.tasks.get(id)
      if (!raw || raw.deleted_at) return
      const t = viewedTask(raw)
      const patch = fn(t)
      if (!patch) return
      await updateTask(id, 'due' in patch ? { ...patch, due: dueFromView(raw.due, patch.due ?? null) } : patch)
      after?.(t, patch)
    }).catch(() => undefined)
  }, [])

  const goTo = useCallback((d: string) => navigate({ view: mode, date: d === today ? undefined : d }), [mode, today])
  /** Keep a moved task in view: follow it to another day or week. */
  const follow = useCallback((d: string) => {
    if (!dates.includes(d)) goTo(d)
  }, [dates, goTo])

  // Keyboard (design D4): selection, moves, estimate, placement mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isGPending()) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        if (e.key === 'Escape') target.blur()
        return
      }
      if (placing) {
        const p = placing
        let next: Placement | null = null
        switch (e.key) {
          case 'ArrowUp': next = { ...p, start: clamp(p.start - SLOT_MINUTES, 0, LAST_SLOT) }; break
          case 'ArrowDown': next = { ...p, start: clamp(p.start + SLOT_MINUTES, 0, LAST_SLOT) }; break
          case 'ArrowLeft': next = { ...p, date: addDaysISO(p.date, -1) }; break
          case 'ArrowRight': next = { ...p, date: addDaysISO(p.date, 1) }; break
          case 'Enter':
            e.preventDefault()
            commit(p.taskId, { type: 'slot', date: p.date, start: p.start })
            setPlacing(null)
            return
          case 'Escape':
            e.preventDefault()
            setPlacing(null)
            return
          default:
            return
        }
        e.preventDefault()
        setPlacing(next)
        follow(next.date)
        return
      }
      if (e.key === 'Escape') {
        if (expanded) setExpanded(null)
        else if (openId) setOpenId(null)
        else setSelectedId(null)
        return
      }
      if (document.querySelector('[role="dialog"]')) return
      const idx = selectedId ? order.indexOf(selectedId) : -1
      const task = selectedId ? taskMap.get(selectedId) : undefined
      const block = task ? days.find((d) => d.date === task.due?.date)?.blocks.get(task.id) : undefined
      switch (e.key) {
        case 'j':
          e.preventDefault()
          setSelectedId(order[Math.min(order.length - 1, idx + 1)] ?? null)
          return
        case 'k':
          e.preventDefault()
          setSelectedId(order[Math.max(0, idx - 1)] ?? null)
          return
        case '[':
          goTo(addDaysISO(anchor, mode === 'day' ? -1 : -7))
          return
        case ']':
          goTo(addDaysISO(anchor, mode === 'day' ? 1 : 7))
          return
        case 't':
          goTo(today)
          return
      }
      if (!task || !task.due) {
        // Nothing selected: arrows pick the first item.
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key) && order.length && !task) {
          e.preventDefault()
          setSelectedId(order[0])
        }
        return
      }
      const due = task.due
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          const dir = e.key === 'ArrowUp' ? -1 : 1
          if (e.shiftKey) {
            // Shift+Up shortens, Shift+Down lengthens: the block's lower edge follows the arrow.
            edit(task.id, (t) => ({ estimate_minutes: stepEstimate(t.estimate_minutes, dir * SLOT_MINUTES) }))
          } else {
            edit(task.id, (t) => t.due ? { due: nudgeDue(t.due, { minutes: dir * SLOT_MINUTES, fallbackStart: placementStart(t, t.due.date, today, nowMinutes, prefs) }) } : null)
          }
          return
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault()
          const days = e.key === 'ArrowLeft' ? -1 : 1
          edit(task.id, (t) => (t.due ? { due: nudgeDue(t.due, { days }) } : null), (_, patch) => patch.due && follow(patch.due.date))
          return
        }
        case 'Enter':
          e.preventDefault()
          setOpenId(task.id)
          return
        case 'u':
          // Keyboard twin of dropping on the lane: keep the date, clear the time.
          if (block) edit(task.id, (t) => (t.due ? { due: { date: t.due.date } } : null))
          return
        case 'p':
          e.preventDefault()
          startPlacing(task, due.date)
          return
        case 'e':
          e.preventDefault()
          estimateFocus.request(task.id)
          setOpenId(task.id)
          return
        case 'c':
          void setTaskCompleted(task.id, true)
          setSelectedId(order[idx + 1] ?? order[idx - 1] ?? null)
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing, expanded, openId, selectedId, order, taskMap, days, anchor, mode, today, nowMinutes, prefs, commit, edit, follow, goTo, startPlacing])

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

  const chooseTray = (v: string) => {
    setTray(v)
    try {
      localStorage.setItem(TRAY_KEY, v)
    } catch {
      // Per-device convenience only.
    }
  }

  return (
    <div className="flex h-full select-none">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-default px-3 py-2 md:px-6">
          <h1 className="mr-2 text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2 py-1" onClick={() => goTo(addDaysISO(anchor, mode === 'day' ? -1 : -7))} aria-label={mode === 'day' ? 'Previous day' : 'Previous week'} title="Previous ([)"><Icon name="chevron-left" /></button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => goTo(today)} title="Today (t)">Today</button>
            <button className="btn-ghost px-2 py-1" onClick={() => goTo(addDaysISO(anchor, mode === 'day' ? 1 : 7))} aria-label={mode === 'day' ? 'Next day' : 'Next week'} title="Next (])"><Icon name="chevron-right" /></button>
          </div>
          <div className="flex rounded-md border border-default text-xs" role="group" aria-label="Calendar range">
            <button className={`px-2 py-1 ${mode === 'day' ? 'bg-sunken dark:bg-raised font-medium' : ''}`} aria-pressed={mode === 'day'} onClick={() => navigate({ view: 'day', date: date })} title="Day (g d)">Day</button>
            <button className={`px-2 py-1 ${mode === 'week' ? 'bg-sunken dark:bg-raised font-medium' : ''}`} aria-pressed={mode === 'week'} onClick={() => navigate({ view: 'week', date: date })} title="Week (g w)">Week</button>
          </div>
          <div className="flex-1" />
          {placing && (
            <span role="status" className="rounded bg-success-soft px-2 py-1 text-xs text-on-success-soft">
              Placing <strong>{placingTask?.title || 'task'}</strong> at {formatTime(placing.start)} · arrows move · Enter places · Esc cancels
            </span>
          )}
          <button className="btn-ghost px-2 py-1 text-xs" aria-pressed={trayOpen} onClick={() => setTrayOpen((v) => !v)}>
            {trayOpen ? 'Hide task list' : 'Plan from a list'}
          </button>
        </div>

        {/* Focusable, so the grid scrolls with the keyboard even when no block is in view (axe scrollable-region-focusable). */}
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          data-calendar-scroller data-scroll-x tabIndex={0} role="region" aria-label={mode === 'week' ? 'Week calendar' : 'Day calendar'}>
          <div className="min-w-full" style={{ width: mode === 'week' ? 'max(100%, 56rem)' : undefined }}>
            {/* Sticky header: day name, capacity and the unscheduled lane of each column. */}
            <div className="sticky top-0 z-20 flex border-b border-default bg-surface">
              <div className="w-12 shrink-0 pt-1 text-right text-[10px] text-faint" aria-hidden>
                <span className="pr-1">all day</span>
              </div>
              {days.map((d) => (
                <DayHeader
                  key={d.date}
                  day={d}
                  today={today}
                  tasks={shown}
                  prefs={prefs}
                  showName={mode === 'week'}
                  selectedId={selectedId}
                  laneTarget={drag?.target?.type === 'lane' && drag.target.date === d.date}
                  onSelect={(id) => setSelectedId(id)}
                  onOpen={(id) => { setSelectedId(id); setOpenId(id) }}
                  onPointerDown={(e, id) => startDrag(e, { taskId: id, kind: 'move' })}
                  projectMap={projectMap}
                />
              ))}
            </div>

            <div className="flex">
              <HourGutter />
              {days.map((d) => (
                <DayColumn
                  key={d.date}
                  day={d}
                  prefs={prefs}
                  isToday={d.date === today}
                  nowMinutes={nowMinutes}
                  taskMap={taskMap}
                  projectMap={projectMap}
                  selectedId={selectedId}
                  draggingId={drag?.taskId ?? null}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  preview={
                    drag && dragTask && drag.target?.type === 'slot' && drag.target.date === d.date
                      ? { id: 'drag-ghost', start: drag.target.start, length: dragTask.estimate_minutes ?? 30, title: dragTask.title }
                      : drag && dragTask && drag.target?.type === 'resize' && dragTask.due?.date === d.date && days.find((x) => x.date === d.date)?.blocks.get(dragTask.id)
                        ? { id: 'drag-ghost', start: days.find((x) => x.date === d.date)!.blocks.get(dragTask.id)!.start, length: drag.target.estimate, title: dragTask.title }
                        : placing && placingTask && placing.date === d.date
                          ? { id: 'placement-ghost', start: placing.start, length: placingTask.estimate_minutes ?? 30, title: placingTask.title }
                          : null
                  }
                  onSelect={(id) => setSelectedId(id)}
                  onOpen={(id) => { setSelectedId(id); setOpenId(id) }}
                  onDragStart={startDrag}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {trayOpen && (
        <PlanTray
          source={tray}
          onSource={chooseTray}
          tasks={allTasks}
          projects={projects}
          today={today}
          onPointerDown={(e, id) => startDrag(e, { taskId: id, kind: 'move' })}
          onPlace={(id) => { const t = taskMap.get(id); if (t) startPlacing(t) }}
          onOpen={(id) => setOpenId(id)}
        />
      )}

      {drag && dragTask && (
        <div className="pointer-events-none fixed z-50 max-w-56 truncate rounded-md bg-accent px-2 py-1 text-xs text-on-accent shadow-lg" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {dragTask.title || 'Untitled'}
          {drag.target?.type === 'slot' && ` · ${formatTime(drag.target.start)}`}
          {drag.target?.type === 'lane' && ' · unscheduled'}
          {drag.target?.type === 'resize' && ` · ${formatMinutes(drag.target.estimate)}`}
        </div>
      )}

      {openId && (
        <TaskDetail
          key={openId}
          taskId={openId}
          projects={projects}
          labelMap={labelMap}
          onClose={() => setOpenId(null)}
          onOpen={(id) => setOpenId(id)}
        />
      )}
    </div>
  )
}

function HourGutter() {
  return (
    <div className="relative w-12 shrink-0" style={{ height: GRID_HEIGHT }} aria-hidden>
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-faint" style={{ top: h * 60 * PX_PER_MIN }}>
          {h === 0 ? '' : formatHour(h)}
        </div>
      ))}
    </div>
  )
}

function DayHeader({ day, today, tasks, prefs, showName, selectedId, laneTarget, onSelect, onOpen, onPointerDown, projectMap }: {
  day: DayData
  today: string
  tasks: Task[]
  prefs: GridPrefs
  showName: boolean
  selectedId: string | null
  laneTarget: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onPointerDown: (e: React.PointerEvent, id: string) => void
  projectMap: Map<string, Project>
}) {
  const load = dayLoad(tasks, day.date, prefs.dayLength)
  const [y, m, d] = day.date.split('-').map(Number)
  const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(y, m - 1, d))
  return (
    <div className="min-w-0 flex-1 border-l border-default px-1 pb-1 pt-1" data-day-header={day.date}>
      <div className="flex items-baseline justify-between gap-1 px-1">
        {showName ? (
          <span className={`truncate text-xs font-medium ${day.date === today ? 'text-accent' : 'text-muted'}`}>
            {weekdayName} {d}
          </span>
        ) : <span />}
        <span
          data-capacity
          data-over={load.over || undefined}
          title={`${load.over ? 'Over capacity. ' : ''}Planned estimates against a ${formatMinutes(prefs.dayLength)} day${load.unestimated ? `; ${load.unestimated} unestimated (counted as 0)` : ''}`}
          className={`whitespace-nowrap rounded px-1 font-mono text-[11px] ${load.over ? 'bg-danger-soft font-semibold text-danger' : 'text-muted'}`}
        >
          {formatLoad(load, prefs.dayLength)}
          {load.over && <span className="sr-only"> over capacity</span>}
          {load.unestimated > 0 && <span className="ml-1 text-faint">+{load.unestimated}?</span>}
        </span>
      </div>
      <div
        data-drop-lane={day.date}
        aria-label={`Unscheduled on ${day.date}`}
        className={`mt-1 min-h-8 space-y-0.5 rounded border border-dashed p-0.5 ${laneTarget ? 'border-accent bg-accent-soft' : 'border-default'}`}
      >
        {day.lane.length === 0 && <span className="block px-1 py-1 text-[10px] text-faint">Unscheduled</span>}
        {day.lane.map((t) => (
          <button
            key={t.id}
            type="button"
            data-cal-id={t.id}
            data-lane-task={t.id}
            onPointerDown={(e) => onPointerDown(e, t.id)}
            onClick={() => onSelect(t.id)}
            onDoubleClick={() => onOpen(t.id)}
            className={`flex w-full touch-manipulation items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs ${selectedId === t.id ? 'bg-accent-soft ring-1 ring-accent' : 'bg-sunken dark:bg-raised hover:bg-sunken dark:hover:bg-raised'} border-l-3 border-l-hue-solid`}
            data-hue={hueFor(t.project_id ? projectMap.get(t.project_id)?.color : null)}
          >
            <span className="truncate">{t.title || 'Untitled'}</span>
            {t.estimate_minutes ? <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{formatMinutes(t.estimate_minutes)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

interface Preview {
  id: string
  start: number
  length: number
  title: string
}

function DayColumn({ day, prefs, isToday, nowMinutes, taskMap, projectMap, selectedId, draggingId, expanded, setExpanded, preview, onSelect, onOpen, onDragStart }: {
  day: DayData
  prefs: GridPrefs
  isToday: boolean
  nowMinutes: number
  taskMap: Map<string, Task>
  projectMap: Map<string, Project>
  selectedId: string | null
  draggingId: string | null
  expanded: string | null
  setExpanded: (key: string | null) => void
  preview: Preview | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: ReturnType<typeof useCalendarDrag>['start']
}) {
  const startPx = prefs.startHour * 60 * PX_PER_MIN
  const endPx = prefs.endHour * 60 * PX_PER_MIN
  return (
    <div
      data-drop-day={day.date}
      className="relative min-w-0 flex-1 border-l border-default"
      style={{
        height: GRID_HEIGHT,
        // Hour lines, fainter 15-minute lines.
        backgroundImage: 'linear-gradient(to bottom, rgb(148 163 184 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.12) 1px, transparent 1px)',
        backgroundSize: `100% ${60 * PX_PER_MIN}px, 100% ${SLOT_MINUTES * PX_PER_MIN}px`,
      }}
    >
      {/* Outside the configured hours: shaded but still usable. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-sunken" style={{ height: startPx }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-sunken" style={{ top: endPx }} />

      {day.layout.blocks.filter((b) => !b.hidden).map((b) => {
        const t = taskMap.get(b.id)
        const block = day.blocks.get(b.id)
        if (!t || !block) return null
        const top = b.start * PX_PER_MIN
        const height = Math.max(SLOT_MINUTES * PX_PER_MIN, (b.end - b.start) * PX_PER_MIN)
        // Project colours render through the palette hue (design-system "Stored colours render through the palette").
        const hue = hueFor(t.project_id ? projectMap.get(t.project_id)?.color : null)
        const selected = selectedId === b.id
        return (
          <div
            key={b.id}
            data-cal-id={b.id}
            data-block={b.id}
            data-overlap={b.overlap || undefined}
            data-estimated={block.estimated || undefined}
            data-hue={hue}
            role="button"
            tabIndex={-1}
            aria-label={`${t.title || 'Untitled'}, ${formatTime(block.start)}${block.estimated ? ` for ${formatMinutes(t.estimate_minutes!)}` : ', no estimate'}${b.overlap ? ', overlaps another task' : ''}`}
            onPointerDown={(e) => {
              // The lowest few pixels (handle and border) resize; the rest moves the block.
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              if (e.clientY >= rect.bottom - Math.min(RESIZE_ZONE_PX, rect.height / 3)) onDragStart(e, { taskId: b.id, kind: 'resize', blockStart: block.start, blockDate: day.date })
              else onDragStart(e, { taskId: b.id, kind: 'move', grabOffset: e.clientY - rect.top })
            }}
            onClick={() => onSelect(b.id)}
            onDoubleClick={() => onOpen(b.id)}
            className={`absolute z-10 cursor-grab touch-manipulation overflow-hidden rounded-md border px-1.5 shadow-sm ${height < 20 ? 'py-0 text-[10px] leading-[10px]' : 'py-0.5 text-xs'} ${block.estimated ? 'border-solid' : 'border-dashed'} ${selected ? 'ring-2 ring-accent' : ''} ${draggingId === b.id ? 'opacity-40' : ''} border-hue-solid bg-surface`}
            style={{
              top, height,
              left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
              width: `calc(${100 / b.lanes}% - 4px)`,
              borderLeftWidth: 3,
            }}
          >
            <div className="flex items-start gap-1">
              <span className="min-w-0 flex-1 truncate font-medium">{t.title || 'Untitled'}</span>
              {b.overlap && <span data-overlap-marker title="Overlaps another task" className="shrink-0 text-warning" aria-hidden>⧉</span>}
            </div>
            {height >= 30 && (
              <div className="truncate text-[10px] text-muted">
                {formatTime(block.start)}–{formatTime(block.end === DAY_MINUTES ? DAY_MINUTES - 1 : block.end)}
                {block.estimated && <span className="ml-1 font-mono">{formatMinutes(t.estimate_minutes!)}</span>}
              </div>
            )}
            <div
              data-resize-handle
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none hover:bg-accent/30"
            />
          </div>
        )
      })}

      {day.layout.overflow.map((o) => {
        const key = `${day.date}:${o.start}`
        const open = expanded === key
        return (
          <div key={key} className="absolute z-20" style={{ top: o.start * PX_PER_MIN, left: `calc(${(o.lane / o.lanes) * 100}% + 2px)`, width: `calc(${100 / o.lanes}% - 4px)` }}>
            <button
              type="button"
              data-overflow={o.ids.length}
              className="w-full rounded-md border border-input bg-canvas px-1 dark:bg-raised py-0.5 text-xs font-medium text-muted hover:bg-sunken"
              onClick={() => setExpanded(open ? null : key)}
              aria-expanded={open}
              title={`${o.ids.length} more overlapping tasks`}
            >
              +{o.ids.length}
            </button>
            {open && (
              <ul className="mt-1 w-48 space-y-0.5 rounded-md border border-default bg-surface p-1 shadow-lg">
                {o.ids.map((id) => {
                  const t = taskMap.get(id)
                  const blk = day.blocks.get(id)
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        data-cal-id={id}
                        onPointerDown={(e) => onDragStart(e, { taskId: id, kind: 'move' })}
                        onClick={() => onSelect(id)}
                        onDoubleClick={() => onOpen(id)}
                        className={`flex w-full gap-1 truncate rounded px-1 py-0.5 text-left text-xs ${selectedId === id ? 'bg-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}`}
                      >
                        <span className="font-mono text-[10px] text-muted">{blk ? formatTime(blk.start) : ''}</span>
                        <span className="truncate">{t?.title || 'Untitled'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {preview && (
        <div
          data-cal-id={preview.id}
          data-ghost
          className="pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-2 border-dashed border-accent bg-accent/15 px-1.5 py-0.5 text-xs text-strong"
          style={{ top: preview.start * PX_PER_MIN, height: Math.max(SLOT_MINUTES, Math.min(preview.length, DAY_MINUTES - preview.start)) * PX_PER_MIN }}
        >
          <span className="font-mono text-[10px]">{formatTime(preview.start)}</span> <span className="truncate">{preview.title || 'Untitled'}</span>
        </div>
      )}

      {isToday && (
        <div data-now-line className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger" style={{ top: nowMinutes * PX_PER_MIN }}>
          <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-danger" />
        </div>
      )}
    </div>
  )
}

/** Tasks to drag onto the grid: Inbox, undated, overdue or one project's open tasks. */
function PlanTray({ source, onSource, tasks, projects, today, onPointerDown, onPlace, onOpen }: {
  source: string
  onSource: (v: string) => void
  tasks: Task[]
  projects: Project[]
  today: string
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onPlace: (id: string) => void
  onOpen: (id: string) => void
}) {
  const live = projects.filter((p) => !p.archived)
  const archived = useMemo(() => new Set(projects.filter((p) => p.archived).map((p) => p.id)), [projects])
  const list = useMemo(() => {
    const open = tasks.filter((t) => !t.completed_at && !t.deleted_at && !(t.project_id && archived.has(t.project_id)))
    let out: Task[]
    if (source === 'nodate') out = open.filter((t) => !t.due)
    else if (source === 'overdue') out = open.filter((t) => t.due && localDueOf(t.due).date < today)
    else if (source.startsWith('project:')) out = open.filter((t) => t.project_id === source.slice(8))
    else out = open.filter((t) => t.project_id === null)
    return out.sort(compareDueThenPriority).slice(0, 200)
  }, [tasks, archived, source, today])
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-default md:flex" aria-label="Tasks to plan">
      <div className="border-b border-default p-2">
        <select className="input py-1 text-xs" aria-label="Plan from" value={source} onChange={(e) => onSource(e.target.value)}>
          <option value="inbox">Inbox</option>
          <option value="nodate">No date</option>
          <option value="overdue">Overdue</option>
          {live.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-faint">Drag onto a time, or focus a task and press <span className="kbd">s</span>.</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {list.length === 0 && <li className="px-1 py-2 text-xs text-faint">Nothing here.</li>}
        {list.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              data-tray-task={t.id}
              onPointerDown={(e) => onPointerDown(e, t.id)}
              onKeyDown={(e) => {
                if (e.key === 's' || e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  onPlace(t.id)
                }
              }}
              onDoubleClick={() => onOpen(t.id)}
              className="flex w-full cursor-grab touch-manipulation items-center gap-1 rounded px-2 py-1 text-left text-xs hover:bg-sunken dark:hover:bg-raised"
            >
              <span className="truncate">{t.title || 'Untitled'}</span>
              {t.estimate_minutes ? <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{formatMinutes(t.estimate_minutes)}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
