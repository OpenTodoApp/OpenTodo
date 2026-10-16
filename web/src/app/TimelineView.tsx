// A project's timeline layout (OpenSpec change month-and-timeline-views,
// project-timeline spec): the list's rows with a bar from start, due and deadline
// on a day or week axis, dependency arrows, and date moves by drag and keyboard.
// Selection and opening stay with the list (j / k / Enter); this view adds the
// axis, the bars and the date edits, each one batch of ordinary field ops.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../ui'
import { addDaysISO, viewedTask } from '../lib/dates'
import { isBlocked } from '../lib/dependencies'
import { db } from '../lib/db'
import { beginDrag } from '../lib/dnd'
import { updateTask } from '../lib/ops'
import { axis, dayOffset, edges, shiftDates, spanOf, type Span, type Zoom } from '../lib/timeline'
import type { Task } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useShortcutScope } from './shortcuts'

const ROW_PX = 32
const ZOOM_KEY = 'ot.timeline.zoom'

export interface TimelineGroup {
  key: string
  heading: string | null
  rows: { task: Task; depth: number }[]
}

interface Line {
  task: Task
  depth: number
  span: Span | null
  /** Row index among every drawn line (headings included), for the arrows. */
  index: number
}

function readZoom(): Zoom {
  try { return localStorage.getItem(ZOOM_KEY) === 'week' ? 'week' : 'day' } catch { return 'day' }
}

/** The deadline step of Shift+Left / Shift+Right: from the deadline, else from the due day. */
export function deadlineStep(task: Pick<Task, 'due' | 'deadline'>, days: number, zone?: string): string | null {
  const base = task.deadline ?? (task.due ? viewedTask({ due: task.due } as Task, zone).due?.date : undefined)
  return base ? addDaysISO(base, days) : null
}

export function TimelineView({ groups, today, zone, editable, selectedId, onSelect, onOpen, byId }: {
  groups: readonly TimelineGroup[]
  today: string
  zone?: string
  editable: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  /** Every live task, for the blocked state of a row. */
  byId: ReadonlyMap<string, Task>
}) {
  const { resolved } = useDateTimeFormat()
  const [zoom, setZoom] = useState<Zoom>(readZoom)
  const [anchor, setAnchor] = useState(today)
  const [dragging, setDragging] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)
  const ax = useMemo(() => axis(anchor, zoom, resolved.weekStart), [anchor, zoom, resolved.weekStart])
  const px = ax.pxPerDay
  const totalDays = dayOffset(ax.from, ax.to) + 1
  const width = totalDays * px
  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDaysISO(ax.from, i)), [ax.from, totalDays])

  // Scheduled rows keep the list's grouping; tasks without dates wait under "Unscheduled".
  const { sections, unscheduled, lines } = useMemo(() => {
    let index = 0
    const all: Line[] = []
    const sections: { key: string; heading: string | null; lines: Line[] }[] = []
    const later: Line[] = []
    for (const g of groups) {
      const mine: Line[] = []
      if (g.heading) index++
      for (const r of g.rows) {
        const span = spanOf(r.task, today, zone)
        if (!span) { later.push({ task: r.task, depth: 0, span: null, index: -1 }); continue }
        const line = { task: r.task, depth: r.depth, span, index: index++ }
        mine.push(line)
        all.push(line)
      }
      if (mine.length) sections.push({ key: g.key, heading: g.heading, lines: mine })
      else if (g.heading) index--
    }
    if (later.length) index++
    for (const l of later) { l.index = index++; all.push(l) }
    return { sections, unscheduled: later, lines: all }
  }, [groups, today, zone])
  const lineOf = useMemo(() => new Map(lines.map((l) => [l.task.id, l])), [lines])
  const arrows = useMemo(() => edges(lines.filter((l) => l.span).map((l) => l.task))
    .map((e) => ({ ...e, a: lineOf.get(e.from)!, b: lineOf.get(e.to)! })), [lines, lineOf])
  const rowCount = lines.length + sections.filter((s) => s.heading).length + (unscheduled.length ? 1 : 0)

  const chooseZoom = (z: Zoom) => {
    setZoom(z)
    try { localStorage.setItem(ZOOM_KEY, z) } catch { /* per-device convenience */ }
  }
  // Start with today in view.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, dayOffset(ax.from, today) * px - el.clientWidth / 3)
  }, [ax.from, px, today])

  const x = (iso: string) => dayOffset(ax.from, iso) * px
  /** The axis day under a pointer position. */
  const dayAt = useCallback((clientX: number) => {
    const r = axisRef.current?.getBoundingClientRect()
    return r ? addDaysISO(ax.from, Math.floor((clientX - r.left) / px)) : today
  }, [ax.from, px, today])

  const write = useCallback((id: string, patch: Partial<Task>) => {
    if (Object.keys(patch).length) void updateTask(id, patch)
  }, [])
  // Keyboard edits run one after another on the freshest row, so three quick
  // presses move a task three days even before the view has re-rendered.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const edit = useCallback((id: string, fn: (t: Task) => Partial<Task> | null) => {
    queue.current = queue.current.then(async () => {
      const t = await db.tasks.get(id)
      if (!t || t.deleted_at) return
      const patch = fn(t)
      if (patch && Object.keys(patch).length) await updateTask(id, patch)
    }).catch(() => undefined)
  }, [])

  // Keyboard date moves on the selected row, as the `timeline` scope of the
  // shortcut registry (keyboard-shortcuts "One shortcut registry with scopes"):
  // it sits above the list's, so here the arrows move dates instead of folding
  // subtasks, and [ ] t move the range instead of the sidebar. Without a selected
  // bar the arrows fall through to the list.
  const rangeStep = zoom === 'week' ? 28 : 7
  const selectedLine = selectedId ? lineOf.get(selectedId) : undefined
  const dateKey = (fn: (t: Task, dir: number) => Partial<Task> | null, needsSpan = false) => (e: KeyboardEvent) => {
    if (!selectedLine) return false
    // A read-only project or an undated row: the key is the timeline's but changes nothing.
    if (!editable || (needsSpan && !selectedLine.span)) return
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    edit(selectedLine.task.id, (t) => fn(t, dir))
  }
  useShortcutScope('timeline', {
    'timeline.range-prev': () => setAnchor((a) => addDaysISO(a, -rangeStep)),
    'timeline.range-next': () => setAnchor((a) => addDaysISO(a, rangeStep)),
    'timeline.today': () => setAnchor(today),
    'timeline.shift': dateKey((t, dir) => shiftDates(t, dir, zone), true),
    'timeline.deadline': dateKey((t, dir) => { const deadline = deadlineStep(t, dir, zone); return deadline ? { deadline } : null }),
  })

  /** Drag a bar (shift), one of its edges (start / deadline), or an unscheduled row (due). */
  const startDrag = (e: React.PointerEvent, t: Task, kind: 'move' | 'start' | 'end' | 'place') => {
    if (!editable || e.button !== 0) return
    e.stopPropagation()
    const grab = dayAt(e.clientX)
    beginDrag(e, {
      label: t.title,
      onStart: () => setDragging(true),
      onEnd: () => setDragging(false),
      onDrop: (key) => {
        if (!key.startsWith('tl:')) return
        const day = key.slice(3)
        const fresh = byId.get(t.id) ?? t
        if (kind === 'move') write(t.id, shiftDates(fresh, dayOffset(grab, day), zone))
        else if (kind === 'start') write(t.id, { start: day })
        else if (kind === 'end') write(t.id, { deadline: day })
        else write(t.id, { due: fresh.due ? { ...fresh.due, date: day } : { date: day } })
        onSelect(t.id)
      },
    })
  }

  const label = (l: Line) => {
    const blocked = isBlocked(l.task, byId)
    const blockers = arrows.filter((a) => a.to === l.task.id).map((a) => a.a.task.title || 'Untitled')
    const selected = selectedId === l.task.id
    return (
      <div key={l.task.id} role="row" aria-selected={selected} data-timeline-row={l.task.id} data-blocked={blocked || undefined}
        className={`flex border-b border-default ${selected ? 'bg-accent-soft' : ''}`} style={{ height: ROW_PX }}>
        <div role="rowheader" className={`sticky left-0 z-10 flex w-[40vw] max-w-64 shrink-0 items-center gap-1 border-r border-default px-2 sm:w-64 ${selected ? 'bg-accent-soft' : 'bg-surface'}`}
          style={{ paddingLeft: 8 + l.depth * 14 }}>
          <button type="button" tabIndex={-1} className={`min-w-0 flex-1 truncate text-left text-meta ${blocked ? 'text-muted' : 'text-default'}`}
            aria-label={`${l.task.title || 'Untitled'}${blockers.length ? `, waits for ${blockers.join(', ')}` : ''}`}
            onClick={() => onSelect(l.task.id)} onDoubleClick={() => onOpen(l.task.id)}
            onPointerDown={!l.span ? (e) => startDrag(e, l.task, 'place') : undefined}>
            {blocked && <Icon name="lock" size="xs" className="mr-1 inline" />}{l.task.title || 'Untitled'}
          </button>
        </div>
        <div role="gridcell" className="relative shrink-0" style={{ width }}>
          {l.span && bar(l.task, l.span, selected)}
        </div>
      </div>
    )
  }

  const bar = (t: Task, s: Span, selected: boolean) => {
    const from = Math.max(0, dayOffset(ax.from, s.from))
    const to = Math.min(totalDays - 1, dayOffset(ax.from, s.to))
    if (to < 0 || from > totalDays - 1) {
      // Entirely outside the window: a marker at the near edge.
      const before = dayOffset(ax.from, s.to) < 0
      return <span data-beyond={before ? 'before' : 'after'} className={`absolute top-2 text-muted ${before ? 'left-1' : 'right-1'}`} aria-hidden><Icon name={before ? 'chevron-left' : 'chevron-right'} size="xs" /></span>
    }
    const clippedLeft = dayOffset(ax.from, s.from) < 0
    const clippedRight = dayOffset(ax.from, s.to) > totalDays - 1
    return (
      <div data-bar={t.id} data-late={s.late || undefined}
        onPointerDown={(e) => startDrag(e, t, 'move')}
        onClick={() => onSelect(t.id)} onDoubleClick={() => onOpen(t.id)}
        className={`absolute top-1.5 flex h-5 items-center rounded-chip border ${s.late ? 'border-danger bg-danger-soft' : 'border-accent bg-accent-soft'} ${selected ? 'ring-2 ring-accent' : ''} ${editable ? 'cursor-grab touch-manipulation' : ''} ${dragging ? 'pointer-events-none' : ''}`}
        style={{ left: from * px, width: Math.max(px, (to - from + 1) * px) }}>
        {clippedLeft && <Icon name="chevron-left" size="xs" className="text-muted" />}
        {editable && !clippedLeft && <span data-bar-edge="start" className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => startDrag(e, t, 'start')} />}
        {s.dueAt && s.dueAt !== s.from && s.dueAt !== s.to && dayOffset(ax.from, s.dueAt) >= 0 && (
          <span data-due-marker className="absolute top-1 h-2.5 w-0.5 rounded-full bg-accent" style={{ left: (dayOffset(ax.from, s.dueAt) - from + 0.5) * px }} aria-hidden />
        )}
        {s.deadlineAt && dayOffset(ax.from, s.deadlineAt) <= totalDays - 1 && (
          <span data-deadline-marker className={`absolute -top-0.5 ${s.late ? 'text-danger' : 'text-muted'}`} style={{ left: Math.max(0, (dayOffset(ax.from, s.deadlineAt) - from + 0.5) * px - 6) }} aria-hidden>
            <Icon name="flag" size="xs" />
          </span>
        )}
        {clippedRight && <Icon name="chevron-right" size="xs" className="ml-auto text-muted" />}
        {editable && !clippedRight && <span data-bar-edge="end" className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => startDrag(e, t, 'end')} />}
      </div>
    )
  }

  const heading = (key: string, text: string) => (
    <div key={`h:${key}`} role="row" className="flex border-b border-default bg-sunken" style={{ height: ROW_PX }}>
      <div role="rowheader" className="sticky left-0 z-10 flex w-[40vw] max-w-64 shrink-0 items-center bg-sunken px-2 text-hint font-semibold uppercase tracking-wide text-muted sm:w-64">{text}</div>
      <div className="shrink-0" style={{ width }} />
    </div>
  )

  const monthLabel = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1))
  const headerRows = 1
  return (
    <div data-timeline className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex rounded-control border border-default text-meta" role="group" aria-label="Timeline zoom">
          {(['day', 'week'] as const).map((z, i) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => chooseZoom(z)}
              className={`${i === 0 ? 'rounded-l-control' : 'rounded-r-control'} px-2 py-1 ${zoom === z ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted'}`}>
              {z === 'day' ? 'Days' : 'Weeks'}
            </button>
          ))}
        </span>
        <span className="text-meta text-faint">
          {editable ? 'Drag a bar to move its dates, or its ends to set the start and deadline. ← → move the selected task, Shift+← → its deadline.' : 'You can view this project but not change dates.'}
        </span>
      </div>
      <div ref={scroller} role="grid" aria-label="Project timeline" aria-rowcount={rowCount + headerRows} tabIndex={0} data-scroll-x
        className="relative max-w-full overflow-x-auto rounded-card border border-default outline-none focus-visible:outline-2 focus-visible:outline-focus">
        <div className="relative" style={{ width: `calc(min(40vw, 16rem) + ${width}px)` }}>
          {/* Axis */}
          <div role="row" className="sticky top-0 z-20 flex border-b border-default bg-surface" style={{ height: ROW_PX }}>
            <div role="columnheader" className="sticky left-0 z-10 w-[40vw] max-w-64 shrink-0 border-r border-default bg-surface px-2 text-hint leading-8 text-muted sm:w-64">Task</div>
            <div ref={axisRef} className="relative shrink-0" style={{ width }}>
              {ax.columns.map((c) => (
                <span key={c} role="columnheader" className="absolute top-0 h-full border-l border-default px-0.5 text-hint leading-8 text-muted" style={{ left: x(c), width: (zoom === 'week' ? 7 : 1) * px }}>
                  {zoom === 'week' || c.endsWith('-01') ? `${monthLabel(c)} ${Number(c.slice(8))}` : Number(c.slice(8))}
                </span>
              ))}
            </div>
          </div>
          {/* Day columns: the drop targets, under the rows. */}
          <div className="pointer-events-auto absolute bottom-0 flex" style={{ top: ROW_PX, left: 'min(40vw, 16rem)', width }} aria-hidden>
            {days.map((d) => (
              <div key={d} data-drop-target={`tl:${d}`} className={`h-full shrink-0 data-[drop-active]:bg-accent-soft ${d === today ? 'bg-accent-soft/40' : ''}`} style={{ width: px }} />
            ))}
          </div>
          {/* Rows */}
          <div className={`relative ${dragging ? 'pointer-events-none' : ''}`}>
            {sections.map((s) => [s.heading ? heading(s.key, s.heading) : null, ...s.lines.map(label)])}
            {unscheduled.length > 0 && [heading('unscheduled', 'Unscheduled'), ...unscheduled.map(label)]}
            {lines.length === 0 && <p className="px-3 py-6 text-meta text-faint">No open tasks in this project.</p>}
          </div>
          {/* Today line and dependency arrows */}
          {dayOffset(ax.from, today) >= 0 && dayOffset(ax.from, today) < totalDays && (
            <div data-today-line className="pointer-events-none absolute bottom-0 z-10 w-0.5 bg-danger" style={{ top: ROW_PX, left: `calc(min(40vw, 16rem) + ${(dayOffset(ax.from, today) + 0.5) * px}px)` }} />
          )}
          {arrows.length > 0 && (
            <svg data-arrows className="pointer-events-none absolute z-10 overflow-visible" style={{ top: ROW_PX, left: 'min(40vw, 16rem)', width, height: rowCount * ROW_PX }} aria-hidden>
              {arrows.map(({ from, to, a, b }) => {
                if (!a.span || !b.span) return null
                const x1 = Math.min(width, Math.max(0, x(a.span.to) + px)), y1 = a.index * ROW_PX + ROW_PX / 2
                const x2 = Math.min(width, Math.max(0, x(b.span.from))), y2 = b.index * ROW_PX + ROW_PX / 2
                const mid = Math.max(x1 + 6, (x1 + x2) / 2)
                const d = `M${x1},${y1} H${mid} V${y2} H${x2}`
                return (
                  <g key={`${from}>${to}`} data-arrow={`${from}>${to}`}>
                    <path d={d} fill="none" stroke="var(--color-surface)" strokeWidth={4} />
                    <path d={d} fill="none" stroke="currentColor" className="text-muted" strokeWidth={1.5} markerEnd="url(#tl-arrow)" />
                  </g>
                )
              })}
              <defs>
                <marker id="tl-arrow" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="currentColor" className="text-muted" />
                </marker>
              </defs>
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
