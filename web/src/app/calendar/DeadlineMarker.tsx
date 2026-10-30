// Deadlines on the calendar (OpenSpec change calendar-clarity, design D1): the deadline
// diamond of the timeline (a small square turned 45 degrees, warning tone) as a mark on
// a task drawn on its deadline day, and as a marker of its own on the deadline's day
// when the task is drawn elsewhere. A marker is a button that opens the task; it is
// never dragged, never a drop target and never counted in the day's capacity.
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'

/** The diamond; dimmed on days before today (by tone, never by opacity). */
export function DeadlineDiamond({ past = false, className = '' }: { past?: boolean; className?: string }) {
  return <span aria-hidden data-deadline-diamond className={`inline-block size-2 shrink-0 rotate-45 rounded-[1px] ${past ? 'bg-faint' : 'bg-warning'} ${className}`} />
}

/** The spoken mark of a task drawn on its deadline day. */
export function deadlineMark(task: Pick<Task, 'deadline'>, date: string): string {
  return task.deadline === date ? t('deadline today') : ''
}

/**
 * A deadline marker: `chip` in the all-day strip of Day and Week (diamond first), `row`
 * at the end of a Month cell or a Plan column (diamond last, faint). Named "Deadline:
 * title" (its visible title follows the hidden word, WCAG 2.5.3).
 */
export function DeadlineMarker({ task, date, today, variant, focusable = true, onOpen }: {
  task: Task
  date: string
  today: string
  variant: 'chip' | 'row'
  /** Off inside a grid with its own roving focus (Month, Plan columns). */
  focusable?: boolean
  onOpen: (id: string) => void
}) {
  const past = date < today
  const title = task.title || t('Untitled')
  return (
    <button type="button" tabIndex={focusable ? 0 : -1} data-deadline-marker-for={task.id} data-deadline-date={date} data-past={past || undefined}
      // Never a drag or a grid gesture: the press, the double-click and the long press stay here.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onOpen(task.id) }}
      className={`flex w-full min-w-0 items-center gap-1 rounded-chip px-1.5 py-0.5 text-left focus-visible:outline-2 focus-visible:outline-focus ${variant === 'chip'
        ? `border border-dashed text-hint ${past ? 'border-default text-faint' : 'border-warning text-default'}`
        : `text-hint hover:bg-hover ${past ? 'text-faint' : 'text-muted'}`}`}>
      {variant === 'chip' && <DeadlineDiamond past={past} />}
      <span className="sr-only">{t('Deadline')}: </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {variant === 'row' && <DeadlineDiamond past={past} />}
    </button>
  )
}
