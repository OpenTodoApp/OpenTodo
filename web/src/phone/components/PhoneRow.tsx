// One task on a phone list (OpenSpec change phone-ui-trial, "Phone task rows"): a
// check with a 44 px target, the title on up to two lines, and one quiet line of
// at most four facts. No grip, no row buttons: a tap opens the task, the check
// completes it, and everything else is a swipe or the task's own page.
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Icon, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

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

const RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-input' }
const TONE: Record<string, string> = { danger: 'text-danger', accent: 'text-accent' }

/** What a swipe adds to the row: the gesture's start and the edge it uncovers (`useRowSwipe`). */
export interface PhoneRowSwipe {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  layers: ReactNode
}

export function PhoneRow({ row, readOnly = false, swipe, onToggle, onOpen }: {
  row: PhoneRowModel
  /** A task the person may not change: the check is off. */
  readOnly?: boolean
  swipe?: PhoneRowSwipe
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}) {
  const facts = (row.facts ?? []).slice(0, MAX_ROW_FACTS)
  return (
    <li data-drag-id="phone-row" data-phone-row={row.id} data-task-id={row.id} className="relative flex min-w-0 items-start bg-surface" onPointerDown={swipe?.onPointerDown}>
      {swipe?.layers}
      <button type="button" aria-pressed={!!row.done} disabled={readOnly} aria-label={row.done ? t('Reopen task') : t('Complete task')}
        onClick={() => onToggle(row.id)} data-phone-check
        className="flex h-14 w-12 shrink-0 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus">
        <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${row.done ? 'border-transparent bg-faint text-on-accent' : RING[row.priority]}`}>
          {row.done && <Icon name="check" size="xs" />}
        </span>
      </button>
      <button type="button" onClick={() => onOpen(row.id)} data-phone-open
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 pr-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
        <span className={`line-clamp-2 text-prose ${row.done ? 'text-faint line-through' : 'text-strong'}`}>{row.title}</span>
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
    </li>
  )
}
