// Spans in the calendar (OpenSpec change multi-day-tasks, design D3, D4): one bar per
// task across the days it covers, in the task style (the block recipe: soft project
// fill, solid leading edge, strong text), squared off with a chevron where it goes on
// past the shown days, its part over past days dimmed. Week and Day draw one band in the
// all-day strip, Month one per week row. Those who may edit the task drag the middle to
// move it and an end to change its first or last day; the keys live in the views.
import { useMemo } from 'react'
import { daysBetweenISO, formatTime } from '../../lib/dates'
import { formatSpan, spanDay, type Span, type SpanPiece } from '../../lib/span'
import type { DaySpan } from '../../lib/calendarDays'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Icon, type HueName } from '../../ui'
import { act } from '../actionError'
import { spanWithUndo } from '../undoable'
import { openProjection, projectionLabel, useProjectionMenu } from './projections'
import { grabDay, startSpanDrag, useSpanPreview, type SpanDragMode, type SpanPreview } from './spanDrag'
import { bandLayout, useSpanEditable } from './spanModel'

/** The spans with the drag's preview applied (the dragged span drawn where it would land). */
export function withPreview(spans: readonly DaySpan[], preview: SpanPreview | null): DaySpan[] {
  if (!preview) return [...spans]
  return spans.map((x) => (x.id === preview.id ? { ...x, span: { first: preview.first, last: preview.last, length: daysBetweenISO(preview.first, preview.last) + 1 } } : x))
}

/** A span's spoken name: "Lisbon trip, 3–5 Nov, day 2 of 3". */
export function spanLabel(task: Task, span: Span, day?: string): string {
  return [task.title || t('Untitled'), formatSpan(span), day ? t('Day {n} of {m}', { n: spanDay(span, day), m: span.length }) : '',
    task.due?.time ? t('until {time}', { time: formatTime(task.due.time) }) : '', task.completed_at ? t('(completed)') : ''].filter(Boolean).join(', ')
}

export interface SpanBandProps {
  days: readonly string[]
  spans: readonly DaySpan[]
  today: string
  /** Day: the one piece reads its position, "Day 2 of 3". */
  variant: 'week' | 'day' | 'month'
  /** Lanes drawn at most; the spans below count toward the days' "+N" (D3). */
  maxLanes?: number
  selectedId: string | null
  hueOf: (task: Task) => HueName
  projectionHue?: (p: Extract<DaySpan, { kind: 'projected' }>['projection']) => HueName | undefined
  /** Drag ends and moves are offered (a wide screen, D8). */
  drags: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  /** A stored row by id, for writes that keep the due's time and zone. */
  stored: (id: string) => Task | undefined
  /** Where the band's day cells draw column lines (Week) or not (Month, whose cells have them). */
  columnLines?: boolean
  /** Laid inside a grid row (Month): the band is one cell spanning the week, so the row holds only cells (WAI-ARIA grid). */
  inRow?: boolean
  className?: string
}

export function SpanBand({ days, spans, today, variant, maxLanes, selectedId, hueOf, projectionHue, drags, onSelect, onOpen, stored, columnLines = false, inRow = false, className = '' }: SpanBandProps) {
  const preview = useSpanPreview()
  const editable = useSpanEditable()
  const { pieces, lanes } = useMemo(() => bandLayout(days, withPreview(spans, preview), maxLanes), [days, spans, preview, maxLanes])
  if (lanes === 0) return null
  return (
    <div className={`grid gap-y-0.5 ${className}`} data-span-band={variant} {...(inRow ? { role: 'gridcell', 'aria-colspan': days.length } : {})}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${lanes}, 1.5rem)` }}>
      {days.map((d, i) => (
        <div key={d} aria-hidden data-span-day={d} className={columnLines ? 'border-l border-default' : ''} style={{ gridColumn: i + 1, gridRow: '1 / -1' }} />
      ))}
      {pieces.map((p) => p.item.kind === 'task'
        ? <SpanBar key={p.item.id} piece={p as SpanPiece<Extract<DaySpan, { kind: 'task' }>>} today={today} variant={variant} selected={selectedId === p.item.id}
            hue={hueOf(p.item.task)} canMove={drags && editable(p.item.task)} canEdit={editable(p.item.task)} dragging={preview?.id === p.item.id}
            onSelect={onSelect} onOpen={onOpen} stored={stored} />
        : <ProjectedSpan key={p.item.id} piece={p as SpanPiece<Extract<DaySpan, { kind: 'projected' }>>} hue={projectionHue?.(p.item.projection)} variant={variant} />)}
    </div>
  )
}

const pieceStyle = (p: SpanPiece<unknown>) => ({ gridColumn: `${p.col + 1} / span ${p.cols}`, gridRow: p.lane + 1 })

function SpanBar({ piece, today, variant, selected, hue, canMove, canEdit, dragging, onSelect, onOpen, stored }: {
  piece: SpanPiece<Extract<DaySpan, { kind: 'task' }>>
  today: string
  variant: SpanBandProps['variant']
  selected: boolean
  hue: HueName
  canMove: boolean
  canEdit: boolean
  dragging: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  stored: (id: string) => Task | undefined
}) {
  const { task, span } = piece.item
  const drag = (mode: SpanDragMode, grab: (e: React.PointerEvent) => string) => (e: React.PointerEvent) => {
    const row = stored(task.id) ?? task
    startSpanDrag(e, { task: row, mode, grab: grab(e), onDrop: (patch) => { act(spanWithUndo(task.id, patch)); onSelect(task.id) } })
  }
  // The part over days before today (D3), as a share of the piece from its leading side.
  const pastCols = Math.max(0, Math.min(piece.cols, daysBetweenISO(piece.first, today)))
  const last = piece.last === span.last
  const position = variant === 'day' ? t('Day {n} of {m}', { n: spanDay(span, piece.first), m: span.length }) : null
  const until = last && task.due?.time ? t('until {time}', { time: formatTime(task.due.time) }) : null
  return (
    <div data-span-piece={task.id} className="relative min-w-0 px-0.5" style={pieceStyle(piece)}>
      <button type="button" data-span-bar={task.id} data-cal-id={task.id} data-hue={hue} aria-pressed={selected}
        data-span-first={span.first} data-span-last={span.last}
        onPointerDown={canMove ? drag('move', (e) => grabDay(e, piece.first, piece.cols)) : undefined}
        onClick={(e) => { e.stopPropagation(); onSelect(task.id) }}
        onDoubleClick={() => onOpen(task.id)}
        className={`ui-block ui-block--row relative flex h-6 w-full min-w-0 touch-manipulation items-center gap-1 overflow-hidden px-1.5 text-left text-meta ${piece.startsBefore ? 'ui-span--before' : ''} ${piece.endsAfter ? 'ui-span--after' : ''} ${task.completed_at || piece.last < today ? 'ui-block--past' : ''} ${selected ? 'ring-1 ring-accent' : ''} ${dragging ? 'shadow-2' : ''} ${canMove ? 'cursor-grab' : ''}`}>
        {pastCols > 0 && piece.last >= today && !task.completed_at && <span aria-hidden className="ui-span-past pointer-events-none absolute inset-y-0 start-0" style={{ width: `${(pastCols / piece.cols) * 100}%` }} />}
        <span className="sr-only">{spanLabel(task, span, variant === 'day' ? piece.first : undefined)}{canEdit ? '' : `, ${t('read-only')}`}</span>
        {piece.startsBefore && <Icon name="chevron-left" size="xs" className="relative shrink-0" />}
        <span aria-hidden className={`relative min-w-0 flex-1 truncate font-medium ${task.completed_at ? 'line-through' : ''}`}>{task.title || t('Untitled')}</span>
        {position && <span aria-hidden data-span-position className="relative shrink-0 text-hint tabular-nums">{position}</span>}
        {until && <span aria-hidden data-span-until className="relative shrink-0 text-hint tabular-nums">{until}</span>}
        {piece.endsAfter && <Icon name="chevron-right" size="xs" className="relative shrink-0" />}
      </button>
      {canMove && !piece.startsBefore && variant !== 'day' && (
        <span aria-hidden data-span-handle="first" onPointerDown={drag('first', () => span.first)} className="absolute inset-y-0 start-0 w-2 cursor-ew-resize touch-none" />
      )}
      {canMove && !piece.endsAfter && variant !== 'day' && (
        <span aria-hidden data-span-handle="last" onPointerDown={drag('last', () => span.last)} className="absolute inset-y-0 end-0 w-2 cursor-ew-resize touch-none" />
      )}
    </div>
  )
}

/** A projected occurrence of a span series (D6): dimmed like other projections; opens the occurrence panel. */
function ProjectedSpan({ piece, hue, variant }: { piece: SpanPiece<Extract<DaySpan, { kind: 'projected' }>>; hue?: HueName; variant: SpanBandProps['variant'] }) {
  const p = piece.item.projection
  const { handlers, menu } = useProjectionMenu(p)
  return (
    <div data-span-piece={p.id} className="relative min-w-0 px-0.5" style={pieceStyle(piece)}>
      <button type="button" data-projected={p.id} data-span-projected={p.id} data-hue={hue} aria-haspopup="menu" aria-keyshortcuts="Shift+F10"
        onClick={() => openProjection(p)} {...handlers}
        className={`ui-block ui-block--row ui-block--projected flex h-6 w-full min-w-0 touch-manipulation items-center gap-1 px-1.5 text-left text-meta ${piece.startsBefore ? 'ui-span--before' : ''} ${piece.endsAfter ? 'ui-span--after' : ''}`}>
        <span className="sr-only">{`${projectionLabel(p)}, ${formatSpan(piece.item.span)}`}</span>
        {piece.startsBefore && <Icon name="chevron-left" size="xs" className="shrink-0" />}
        <Icon name="repeat" size="xs" className="shrink-0" />
        <span aria-hidden className="min-w-0 flex-1 truncate">{p.title || t('Untitled')}</span>
        {variant === 'day' && <span aria-hidden className="shrink-0 text-hint tabular-nums">{t('Day {n} of {m}', { n: spanDay(piece.item.span, piece.first), m: piece.item.span.length })}</span>}
        {piece.endsAfter && <Icon name="chevron-right" size="xs" className="shrink-0" />}
      </button>
      {menu}
    </div>
  )
}

export default SpanBand
