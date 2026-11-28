// One task on a phone list (OpenSpec change phone-ui-trial, "Phone task rows"): a
// check with a 44 px target, the title on up to two lines, and one quiet line of
// at most four facts. No grip, no row buttons: a tap opens the task, the check
// completes it, and everything else is a swipe, a hold or the task's own page. In
// a list it can be indented under its task with a fold, ticked in selection, and
// lifted by a drag (OpenSpec change phone-lists, design D4).
import type { HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../../ui'
import { t } from '../../lib/i18n'
import { PRIORITY_RING } from '../../lib/priority'

/** A fact on the row's second line: a time, a project, a date. */
export interface PhoneRowFact {
  id: string
  text: string
  icon?: IconName
  tone?: 'danger' | 'accent'
  /** A mark before the text: a project's colour. */
  mark?: ReactNode
}

export interface PhoneRowModel {
  id: string
  title: string
  done?: boolean
  /** 1 is the highest, 4 none. */
  priority: 1 | 2 | 3 | 4
  facts?: PhoneRowFact[]
}

/** The row shows at most this many facts (the interface budget counts the check and the title too). */
export const MAX_ROW_FACTS = 4

const TONE: Record<string, string> = { danger: 'text-danger', accent: 'text-accent' }

/** What a swipe adds to the row: the gesture's start and the edge it uncovers (`useRowSwipe`). */
export interface PhoneRowSwipe {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  layers: ReactNode
}

/** The fold of a task with subtasks in a list that nests them (phone-lists D4). */
export interface PhoneRowFold {
  open: boolean
  onToggle: () => void
}

/** One step of indent for a subtask, and the deepest step drawn. */
// The pressed colour of the check, the tick box and the fold keeps to a 32 px circle around the glyph
// of their 44 px wide target (touch-pressed-states): padding with the colour clipped to the content.
const INDENT_REM = 1.5
const MAX_DEPTH = 3

export function PhoneRow({ row, readOnly = false, swipe, onToggle, onOpen, depth = 0, fold, selecting = false, ticked = false, onTick, inline, attrs, overlay, lifted = false }: {
  row: PhoneRowModel
  /** A task the person may not change: the check is off. */
  readOnly?: boolean
  swipe?: PhoneRowSwipe
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  /** A subtask under its task: how many steps it is indented. */
  depth?: number
  fold?: PhoneRowFold
  /** The list is in selection: the check is a tick box and a tap on the row ticks it. */
  selecting?: boolean
  ticked?: boolean
  onTick?: (id: string) => void
  /** A field in place of the title (Edit title): the row's other controls stay. */
  inline?: ReactNode
  /** What the list puts on the row's element: its ref, its drag and drop attributes, its press handler. */
  attrs?: HTMLAttributes<HTMLLIElement> & Record<`data-${string}`, string | number | undefined> & { ref?: Ref<HTMLLIElement> }
  /** Drawn over the row: where a dragged task would land. */
  overlay?: ReactNode
  /** The row is being dragged. */
  lifted?: boolean
}) {
  const facts = (row.facts ?? []).slice(0, MAX_ROW_FACTS)
  const tickable = selecting && !!onTick && !readOnly
  const press = (e: ReactPointerEvent<HTMLLIElement>) => { swipe?.onPointerDown(e); attrs?.onPointerDown?.(e) }
  return (
    <li data-drag-id="phone-row" data-phone-row={row.id} data-task-id={row.id} {...attrs} onPointerDown={press}
      data-ticked={ticked || undefined} data-depth={depth || undefined}
      style={depth ? { paddingInlineStart: `${Math.min(depth, MAX_DEPTH) * INDENT_REM}rem` } : undefined}
      className={`relative flex min-w-0 items-start ${ticked ? 'bg-accent-soft' : 'bg-surface'} ${swipe ? 'touch-pan-y' : ''} ${lifted ? 'z-[2] opacity-70 shadow-3' : ''}`}>
      {swipe?.layers}{overlay}
      {selecting ? (
        <button type="button" role="checkbox" aria-checked={ticked} disabled={!tickable} aria-label={t('Select {title}', { title: row.title })}
          onClick={() => onTick?.(row.id)} data-phone-tick
          className="press-selected flex h-14 w-12 shrink-0 items-center justify-center rounded-full bg-clip-content px-2 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus">
          <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${ticked ? 'border-transparent bg-accent text-on-accent' : 'border-input'} ${tickable ? '' : 'opacity-40'}`}>
            {ticked && <Icon name="check" size="xs" />}
          </span>
        </button>
      ) : (
        <button type="button" aria-pressed={!!row.done} disabled={readOnly} aria-label={row.done ? t('Reopen task') : t('Complete task')}
          onClick={() => onToggle(row.id)} data-phone-check
          className="press-selected flex h-14 w-12 shrink-0 items-center justify-center rounded-full bg-clip-content px-2 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus">
          <span aria-hidden data-check-mark className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${row.done ? 'border-transparent bg-faint text-on-accent' : PRIORITY_RING[row.priority]}`}>
            {row.done && <Icon name="check" size="xs" />}
          </span>
        </button>
      )}
      {inline ? <div className="flex min-h-14 min-w-0 flex-1 items-center py-1 pe-2" data-phone-inline>{inline}</div> : (
        <button type="button" onClick={() => (tickable ? onTick?.(row.id) : selecting ? undefined : onOpen(row.id))} data-phone-open data-row-open
          className="press-selected flex min-h-14! min-w-0 flex-1 flex-col justify-center py-2 pe-4 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
          <span data-row-title className={`line-clamp-2 text-prose ${row.done ? 'text-faint line-through' : 'text-strong'}`}>{row.title}</span>
          {facts.length > 0 && (
            <span className="mt-0.5 flex min-w-0 items-center gap-x-2 text-meta text-muted" data-phone-facts>
              {facts.map((f) => (
                <span key={f.id} data-fact={f.id} className={`inline-flex min-w-0 items-center gap-1 ${TONE[f.tone ?? ''] ?? ''} ${f.id === 'project' ? 'shrink' : 'shrink-0'}`}>
                  {f.mark}
                  {f.icon && <Icon name={f.icon} size="xs" />}
                  <span className="truncate">{f.text}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      )}
      {fold && !inline && (
        <button type="button" aria-expanded={fold.open} aria-label={fold.open ? t('Collapse subtasks') : t('Expand subtasks')} onClick={fold.onToggle} data-phone-fold-row
          className="press-selected flex h-14 w-11 shrink-0 items-center justify-center rounded-full bg-clip-content px-1.5 py-3 text-muted focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus">
          <Icon name={fold.open ? 'chevron-down' : 'chevron-right'} size="sm" />
        </button>
      )}
    </li>
  )
}
