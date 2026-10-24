// A project's timeline layout (OpenSpec change month-and-timeline-views,
// project-timeline spec): the list's rows with a bar from start, due and deadline
// on a day or week axis, dependency arrows, and date moves by drag and keyboard.
// Selection and opening stay with the list (j / k / Enter); this view adds the
// axis, the bars and the date edits, each one batch of ordinary field ops.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon, ReadAs } from '../ui'
import { addDaysISO, daysBetweenISO, formatDate, viewedTask, dateLocaleOf } from '../lib/dates'
import { isBlocked } from '../lib/dependencies'
import { getTask } from '../lib/localData'
import { beginDrag } from '../lib/dnd'
import { updateTask } from '../lib/ops'
import { axis, dayOffset, edges, shiftDates, spanOf, type Span, type Zoom } from '../lib/timeline'
import type { Task } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useShortcutScope } from './shortcuts'
import { t } from '../lib/i18n'
import { act, reportActionError } from './actionError'

// The list's comfortable row (precision-boards-timeline D5); bars are 24 px inside it.
const ROW_PX = 36
/** A bar at least this wide carries its title (D6). */
const LABEL_MIN_PX = 96
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

export function TimelineView({ groups, today, zone, editable, selectedId, onSelect, onOpen, byId, hue }: {
  groups: readonly TimelineGroup[]
  today: string
  zone?: string
  editable: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  /** Every live task, for the blocked state of a row. */
  byId: ReadonlyMap<string, Task>
  /** The project's hue for the bars (surfaces-v2 D1); undefined draws them in the neutral hue. */
  hue?: string
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
    if (Object.keys(patch).length) act(updateTask(id, patch))
  }, [])
  // Keyboard edits run one after another on the freshest row, so three quick
  // presses move a task three days even before the view has re-rendered.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const edit = useCallback((id: string, fn: (tk: Task) => Partial<Task> | null) => {
    queue.current = queue.current.then(async () => {
      const item = await getTask(id)
      if (!item || item.deleted_at) return
      const patch = fn(item)
      if (patch && Object.keys(patch).length) await updateTask(id, patch)
    }).catch(reportActionError)
  }, [])

  // Keyboard date moves on the selected row, as the `timeline` scope of the
  // shortcut registry (keyboard-shortcuts "One shortcut registry with scopes"):
  // it sits above the list's, so here the arrows move dates instead of folding
  // subtasks, and [ ] t move the range instead of the sidebar. Without a selected
  // bar the arrows fall through to the list.
  const rangeStep = zoom === 'week' ? 28 : 7
  const selectedLine = selectedId ? lineOf.get(selectedId) : undefined
  const dateKey = (fn: (task: Task, dir: number) => Partial<Task> | null, needsSpan = false) => (e: KeyboardEvent) => {
    if (!selectedLine) return false
    // A read-only project or an undated row: the key is the timeline's but changes nothing.
    if (!editable || (needsSpan && !selectedLine.span)) return
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    edit(selectedLine.task.id, (task) => fn(task, dir))
  }
  useShortcutScope('timeline', {
    'timeline.range-prev': () => setAnchor((a) => addDaysISO(a, -rangeStep)),
    'timeline.range-next': () => setAnchor((a) => addDaysISO(a, rangeStep)),
    'timeline.today': () => setAnchor(today),
    'timeline.shift': dateKey((task, dir) => shiftDates(task, dir, zone), true),
    'timeline.deadline': dateKey((task, dir) => { const deadline = deadlineStep(task, dir, zone); return deadline ? { deadline } : null }),
  })

  /** Drag a bar (shift), one of its edges (start / deadline), or an unscheduled row (due). */
  const startDrag = (e: React.PointerEvent, task: Task, kind: 'move' | 'start' | 'end' | 'place') => {
    if (!editable || e.button !== 0) return
    e.stopPropagation()
    const grab = dayAt(e.clientX)
    beginDrag(e, {
      label: task.title,
      onStart: () => setDragging(true),
      onEnd: () => setDragging(false),
      onDrop: (key) => {
        if (!key.startsWith('tl:')) return
        const day = key.slice(3)
        const fresh = byId.get(task.id) ?? task
        if (kind === 'move') write(task.id, shiftDates(fresh, dayOffset(grab, day), zone))
        else if (kind === 'start') write(task.id, { start: day })
        else if (kind === 'end') write(task.id, { deadline: day })
        else write(task.id, { due: fresh.due ? { ...fresh.due, date: day } : { date: day } })
        onSelect(task.id)
      },
    })
  }

  const label = (l: Line) => {
    const blocked = isBlocked(l.task, byId)
    const blockers = arrows.filter((a) => a.to === l.task.id).map((a) => a.a.task.title || t('Untitled'))
    const selected = selectedId === l.task.id
    return (
      <div key={l.task.id} role="row" aria-selected={selected} data-timeline-row={l.task.id} data-blocked={blocked || undefined}
        className={`flex border-b border-default ${selected ? 'bg-selected-row' : ''}`} style={{ height: ROW_PX }}>
        <div role="rowheader" className={`sticky left-0 z-10 flex w-[40vw] max-w-64 shrink-0 items-center gap-1 border-r border-default px-2 sm:w-64 ${selected ? 'bg-selected-row' : 'bg-surface'}`}
          style={{ paddingLeft: 8 + l.depth * 14 }}>
          <button type="button" tabIndex={-1} className={`min-w-0 flex-1 truncate text-left text-body ${blocked ? 'text-muted' : 'text-default'}`}
            aria-label={blockers.length ? t('{title}, waits for {blockers}', { title: l.task.title || t('Untitled'), blockers: blockers.join(', ') }) : l.task.title || t('Untitled')}
            onClick={() => onSelect(l.task.id)} onDoubleClick={() => onOpen(l.task.id)}
            onPointerDown={!l.span ? (e) => startDrag(e, l.task, 'place') : undefined}>
            {blocked && <Icon name="lock" size="xs" className="mr-1 inline" />}{l.task.title || t('Untitled')}
          </button>
        </div>
        <div role="gridcell" className="relative shrink-0" style={{ width }}>
          {l.span && bar(l.task, l.span, selected)}
        </div>
      </div>
    )
  }

  const bar = (task: Task, s: Span, selected: boolean) => (
    <TimelineBar task={task} s={s} selected={selected} from={ax.from} totalDays={totalDays} px={px} today={today} hue={hue} editable={editable} dragging={dragging}
      onDrag={startDrag} onSelect={onSelect} onOpen={onOpen} />
  )

  // A section heading is the list's group bar (D5): sentence case, the name and its number of rows.
  const heading = (key: string, text: string, count: number) => (
    <div key={`h:${key}`} role="row" data-timeline-group={key} className="flex border-b border-default bg-raised" style={{ height: ROW_PX }}>
      <div role="rowheader" className="sticky left-0 z-10 flex w-[40vw] max-w-64 shrink-0 items-center gap-1.5 border-r border-default bg-raised px-2 sm:w-64">
        <span className="min-w-0 truncate text-meta font-medium text-default">{text}</span>
        <span className="text-meta tabular-nums text-faint" data-group-count><ReadAs label={t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}>{count}</ReadAs></span>
      </div>
      <div className="shrink-0" style={{ width }} />
    </div>
  )

  const monthLabel = (iso: string) => new Intl.DateTimeFormat(dateLocaleOf(), { month: 'short' }).format(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1))
  // A week column reads as its range, "20–26 Oct" (D9), in the user's locale.
  const weekLabel = (iso: string) => {
    const d = (v: string) => new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8)))
    return new Intl.DateTimeFormat(dateLocaleOf(), { month: 'short', day: 'numeric' }).formatRange(d(iso), d(addDaysISO(iso, 6)))
  }
  const headerRows = 1
  return (
    <div data-timeline className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex rounded-control border border-default text-meta" role="group" aria-label={t('Timeline zoom')}>
          {(['day', 'week'] as const).map((z, i) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => chooseZoom(z)}
              className={`${i === 0 ? 'rounded-l-control' : 'rounded-r-control'} px-2 py-1 ${zoom === z ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted'}`}>
              {z === 'day' ? t('Days') : t('Weeks')}
            </button>
          ))}
        </span>
        <span className="text-meta text-faint">
          {editable ? t('Drag a bar to move its dates, or its ends to set the start and deadline. ← → move the selected task, Shift+← → its deadline.') : t('You can view this project but not change dates.')}
        </span>
      </div>
      <div ref={scroller} role="grid" aria-label={t('Project timeline')} aria-rowcount={rowCount + headerRows} tabIndex={0} data-scroll-x
        className="relative max-w-full overflow-x-auto rounded-card border border-default outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
        <div className="relative" style={{ width: `calc(min(40vw, 16rem) + ${width}px)` }}>
          {/* Axis */}
          <div role="row" className="sticky top-0 z-20 flex border-b border-default bg-surface" style={{ height: ROW_PX }}>
            <div role="columnheader" className="sticky left-0 z-10 w-[40vw] max-w-64 shrink-0 border-r border-default bg-surface px-2 text-hint leading-8 text-muted sm:w-64">{t('Task')}</div>
            <div ref={axisRef} className="relative shrink-0" style={{ width }}>
              {ax.columns.map((c) => (
                <span key={c} role="columnheader" className="absolute top-0 h-full border-l border-default px-0.5 text-hint leading-8 text-muted" style={{ left: x(c), width: (zoom === 'week' ? 7 : 1) * px }}>
                  {zoom === 'week' ? weekLabel(c) : c.endsWith('-01') ? `${monthLabel(c)} ${Number(c.slice(8))}` : Number(c.slice(8))}
                </span>
              ))}
              {dayOffset(ax.from, today) >= 0 && dayOffset(ax.from, today) < totalDays && (
                // The today mark (D9): an accent pill on the axis above the line.
                <span data-today-mark className="pointer-events-none absolute top-1.5 z-10 -translate-x-1/2 rounded-chip bg-accent px-1.5 text-hint font-medium leading-5 text-on-accent" style={{ left: (dayOffset(ax.from, today) + 0.5) * px }}>{t('Today')}</span>
              )}
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
            {sections.map((s) => [s.heading ? heading(s.key, s.heading, s.lines.length) : null, ...s.lines.map(label)])}
            {unscheduled.length > 0 && [heading('unscheduled', t('Unscheduled'), unscheduled.length), ...unscheduled.map(label)]}
            {lines.length === 0 && <p className="px-3 py-6 text-meta text-faint">{t('No open tasks in this project.')}</p>}
          </div>
          {/* Today line and dependency arrows */}
          {dayOffset(ax.from, today) >= 0 && dayOffset(ax.from, today) < totalDays && (
            <div data-today-line className="pointer-events-none absolute bottom-0 z-10 w-0.5 -translate-x-1/2 bg-accent" style={{ top: ROW_PX, left: `calc(min(40vw, 16rem) + ${(dayOffset(ax.from, today) + 0.5) * px}px)` }} />
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

/** A rough width for a note in the 12 px meta size, enough to keep it clear of the today line and the axis end. */
const noteWidth = (text: string) => Math.ceil(text.length * 6.5) + 4

/**
 * Where the note beside a bar goes (precision-polish D4): 8 px after the bar, unless it would cross the
 * today line (then just past the line) or run off the axis (then just before the bar, ending 8 px from it).
 * Returns the note's left edge in pixels from the axis start.
 */
export function notePlacement(barLeft: number, barRight: number, width: number, todayX: number | null, axisEnd: number): number {
  let left = barRight + 8
  if (todayX !== null && left < todayX + 4 && left + width > todayX - 4) left = todayX + 8
  if (left + width > axisEnd) left = Math.max(0, barLeft - 8 - width)
  return left
}

/** One task's bar (precision-boards-timeline D6–D8): its block, markers and the label after it. */
function TimelineBar({ task, s, selected, from, totalDays, px, today, hue, editable, dragging, onDrag, onSelect, onOpen }: {
  task: Task
  s: Span
  selected: boolean
  /** The axis' first day. */
  from: string
  totalDays: number
  px: number
  today: string
  hue?: string
  editable: boolean
  dragging: boolean
  onDrag: (e: React.PointerEvent, task: Task, kind: 'move' | 'start' | 'end') => void
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}) {
  const { resolved } = useDateTimeFormat()
  const first = Math.max(0, dayOffset(from, s.from))
  const to = Math.min(totalDays - 1, dayOffset(from, s.to))
  if (to < 0 || first > totalDays - 1) {
    // Entirely outside the window: a marker at the near edge.
    const before = dayOffset(from, s.to) < 0
    return <span data-beyond={before ? 'before' : 'after'} className={`absolute top-2.5 text-muted ${before ? 'left-1' : 'right-1'}`} aria-hidden><Icon name={before ? 'chevron-left' : 'chevron-right'} size="xs" /></span>
  }
  const clippedLeft = dayOffset(from, s.from) < 0
  const clippedRight = dayOffset(from, s.to) > totalDays - 1
  // The part before today is dimmed (surfaces-v2 D3): the whole bar when it ended, a second segment when it crosses today.
  const allPast = !s.late && s.to < today
  const pastDays = !s.late && !allPast && s.from < today ? Math.min(to + 1, dayOffset(from, today)) - first : 0
  const barPx = Math.max(px, (to - first + 1) * px)
  const titled = barPx >= LABEL_MIN_PX
  const todayIn = dayOffset(from, today) >= 0 && dayOffset(from, today) <= totalDays - 1
  const deadlineIn = !!s.deadlineAt && dayOffset(from, s.deadlineAt) >= 0 && dayOffset(from, s.deadlineAt) <= totalDays - 1
  // After the bar (D6, D8): how late it is, else its length when the title does not fit, else the deadline at its end.
  const after = s.late ? { tone: 'text-danger', text: t('{n, plural, one {# day late} other {# days late}}', { n: s.lateBy }) }
    : !titled ? { tone: 'text-faint', text: t('{n, plural, one {# day} other {# days}}', { n: daysBetweenISO(s.from, s.to) + 1 }) }
    : deadlineIn && s.deadlineAt === s.to ? { tone: 'text-warning', text: t('Deadline {date}', { date: formatDate(s.deadlineAt, 'compact', resolved) }) }
    : null
  return (
    <>
    <div data-bar={task.id} data-late={s.late || undefined} data-hue={hue}
      onPointerDown={(e) => onDrag(e, task, 'move')}
      onClick={() => onSelect(task.id)} onDoubleClick={() => onOpen(task.id)}
      className={`ui-block ui-block--row absolute top-1.5 flex h-6 items-center ${s.late ? 'ui-block--late' : ''} ${allPast ? 'ui-block--past' : ''} ${selected ? 'ring-2 ring-accent' : ''} ${editable ? 'cursor-grab touch-manipulation' : ''} ${dragging ? 'pointer-events-none' : ''}`}
      style={{ left: first * px, width: barPx }}>
      {pastDays > 0 && <span data-bar-past aria-hidden className="ui-block ui-block--row ui-block--past pointer-events-none absolute inset-y-0 rounded-e-none" style={{ insetInlineStart: -3, width: pastDays * px }} />}
      {clippedLeft && <Icon name="chevron-left" size="xs" className="relative text-muted" />}
      {titled && <span data-bar-title aria-hidden className="user-text pointer-events-none relative min-w-0 flex-1 truncate px-1.5 text-meta font-medium">{task.title || t('Untitled')}</span>}
      {editable && !clippedLeft && <span data-bar-edge="start" className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onDrag(e, task, 'start')} />}
      {s.dueAt && s.dueAt !== s.from && s.dueAt !== s.to && dayOffset(from, s.dueAt) >= 0 && (
        <span data-due-marker className="absolute top-1.5 h-3 w-0.5 rounded-full bg-accent" style={{ left: (dayOffset(from, s.dueAt) - first + 0.5) * px }} aria-hidden />
      )}
      {deadlineIn && (
        // The deadline diamond (D8): a 10 px square turned 45 degrees, centred on its day.
        <span data-deadline-marker className={`absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] ${s.late ? 'bg-danger' : 'bg-warning'}`} style={{ left: (dayOffset(from, s.deadlineAt!) - first + 0.5) * px - 5 }} aria-hidden />
      )}
      {clippedRight && <Icon name="chevron-right" size="xs" className="relative ml-auto text-muted" />}
      {editable && !clippedRight && <span data-bar-edge="end" className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onDrag(e, task, 'end')} />}
    </div>
    {after && !clippedRight && (
      <span data-bar-after className={`pointer-events-none absolute top-1.5 flex h-6 items-center whitespace-nowrap text-meta tabular-nums ${after.tone}`} style={{ left: notePlacement(first * px, first * px + barPx, noteWidth(after.text), todayIn ? (dayOffset(from, today) + 0.5) * px : null, totalDays * px) }}>{after.text}</span>
    )}
    </>
  )
}
