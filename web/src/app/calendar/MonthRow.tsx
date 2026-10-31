// One task row of a Month cell or of the phone's day list (OpenSpec month-view), split
// out of MonthView: time, title, priority and the deadline diamond; a span shows its
// range (multi-day-tasks D8) and a date-only row its trailing end, which makes it a
// span when dragged (D2).
import { formatTime } from '../../lib/dates'
import { beginDrag } from '../../lib/dnd'
import { t } from '../../lib/i18n'
import { formatSpan, spanOf } from '../../lib/span'
import type { Task } from '../../lib/types'
import type { HueName } from '../../ui'
import { DeadlineDiamond, deadlineMark } from './DeadlineMarker'
import { ExtendHandle } from './monthSpans'
import { usePreloadSpanDrag } from './spanModel'

export function MonthRow({ task, v, compact, today, selected, hue, canMove, readOnly, extend, onDrop, onSelect, onOpen }: {
  task: Task
  /** The row in the viewer's zone. */
  v: Task | undefined
  compact: boolean
  today: string
  selected: boolean
  hue: HueName
  canMove: boolean
  readOnly: boolean
  /** Offer the trailing end (a wide screen). */
  extend: boolean
  onDrop: (id: string, date: string) => void
  onSelect: (id: string, date?: string) => void
  onOpen: (id: string) => void
}) {
  const onDeadline = !!v?.due && task.deadline === v.due.date
  const span = v ? spanOf(v) : null
  usePreloadSpanDrag(canMove && extend)
  return (
    <button type="button" tabIndex={-1} data-month-task={task.id} data-hue={hue} aria-pressed={selected}
      onPointerDown={canMove ? (e) => {
        if (e.button !== 0) return
        beginDrag(e, { label: task.title, onDrop: (key) => { if (key.startsWith('day:')) onDrop(task.id, key.slice(4)) } })
      } : undefined}
      onClick={(e) => { e.stopPropagation(); onSelect(task.id, v?.due?.date) }}
      onDoubleClick={() => onOpen(task.id)}
      className={`ui-block ui-block--row relative flex w-full min-w-0 touch-manipulation items-center gap-1 px-1 text-left ${compact ? 'py-0 text-hint' : 'py-0.5 text-meta'} ${task.completed_at || (v?.due && v.due.date < today) ? 'ui-block--past' : ''} ${selected ? 'ring-1 ring-accent' : ''} ${canMove ? 'cursor-grab' : ''}`}>
      {/* Named by its content (WCAG 2.5.3 Label in Name): the spoken text is visually hidden, the visible one is not read twice. */}
      <span className="sr-only">{[task.title || t('Untitled'), task.completed_at ? t('(completed)') : '', span ? formatSpan(span) : '', v?.due?.time ? formatTime(v.due.time) : '', task.priority < 4 ? t('priority {n}', { n: task.priority }) : '', onDeadline ? deadlineMark(task, v!.due!.date) : '', readOnly ? t('read-only') : ''].filter(Boolean).join(', ')}</span>
      {v?.due?.time && !span && <span aria-hidden className="shrink-0 tabular-nums">{formatTime(v.due.time)}</span>}
      <span aria-hidden className={`min-w-0 flex-1 truncate ${task.completed_at ? 'line-through' : ''}`}>{task.title || t('Untitled')}</span>
      {/* A span's range chip (multi-day-tasks D8): the phone's day list shows it on each covered day. */}
      {span && <span aria-hidden data-span-range className="shrink-0 tabular-nums text-muted">{formatSpan(span)}</span>}
      {task.priority < 4 && <span aria-hidden className="shrink-0 text-hint font-semibold" data-priority={task.priority}>P{task.priority}</span>}
      {onDeadline && <DeadlineDiamond past={v!.due!.date < today} />}
      {canMove && extend && !span && v?.due && !v.due.time && <ExtendHandle task={task} day={v.due.date} onDone={(id) => onSelect(id)} />}
    </button>
  )
}
