// A day or a week in an answer (OpenSpec change assistant-generative-ui, spec
// "Calendar block", design D4): a compact agenda of each day, its heading with the
// day's planned total against the working day as the calendar counts it
// (`dayLoad`, `CapacityLine`), then its dated tasks in time order. No grid and no
// scroll region of its own; read-only, since a change to the plan is a proposal.
// Lazy chunk; the proposal's calendar shape draws the same agenda.
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useDatedTasks, useDayLength } from '../../../lib/assistantBlockData'
import { dayLoad } from '../../../lib/calendar'
import { addDaysISO, formatDate, formatTime, localDueOf } from '../../../lib/dates'
import { formatMinutes } from '../../../lib/duration'
import { t } from '../../../lib/i18n'
import type { Task } from '../../../lib/types'
import { Icon, IconButton } from '../../../ui'
import { CapacityLine } from '../../calendar/CapacityLine'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

/** The days of a block: one, or seven from the given one. */
export const blockDays = (date: string, span: 'day' | 'week'): string[] => Array.from({ length: span === 'day' ? 1 : 7 }, (_, i) => addDaysISO(date, i))

export interface AgendaItem {
  task: Task
  /** Proposed, not applied (the proposal's calendar shape). */
  proposed?: boolean
  /** The proposal's checkbox: whether this item applies, and its accessible name. */
  check?: { checked: boolean; label: string; onChange: (checked: boolean) => void }
  /** The proposal's edits (assistant-proposal-editing D1, D2): the pencil, its editor, and moving to another day by drag or Alt+arrows. */
  edit?: { title: string; open: boolean; onToggle: () => void; editor?: ReactNode; onPointerDown?: (e: PointerEvent) => void; onKeyDown?: (e: KeyboardEvent) => void; dragging?: boolean
    /** What happened to the item: edited, or added or changed by the latest turn; shown in place of "proposed". */
    mark?: string }
}

/** A task placed on its local day: its date and time. */
const placed = (tk: Task) => localDueOf(tk.due)

/** The agenda of each day: heading, total, and the items in time order (untimed first). */
export function AgendaDays({ days, items, dayLength, dropDay }: { days: readonly string[]; items: readonly AgendaItem[]; dayLength: number; dropDay?: string | null }) {
  return (
    <ol className="divide-y divide-default" data-assistant-agenda>
      {days.map((day) => {
        const own = items.filter((it) => placed(it.task)?.date === day)
          .sort((a, b) => (placed(a.task)?.time ?? '').localeCompare(placed(b.task)?.time ?? '') || a.task.title.localeCompare(b.task.title))
        const load = dayLoad(own.map((it) => ({ ...it.task, due: placed(it.task) })), day, dayLength)
        return (
          // A proposal's day is where a dragged item lands (calendarDrag's lane target).
          <li key={day} className={`px-3 py-2 ${dropDay === day ? 'bg-accent-soft' : ''}`} data-agenda-day={day} data-drop-lane={dropDay !== undefined ? day : undefined}>
            <div className="flex items-center gap-2">
              <button type="button" className="min-h-9 text-body font-semibold hover:underline" onClick={() => navigate({ view: 'day', date: day })}>{formatDate(day, 'long')}</button>
              <CapacityLine load={load} dayLength={dayLength} unestimated className="ml-auto" />
            </div>
            {own.length === 0 ? <p className="text-meta text-faint">{t('Nothing planned')}</p> : (
              <ul className="mt-1">
                {own.map(({ task, proposed, check, edit }) => {
                  const due = placed(task)
                  const time = <span className="w-14 shrink-0 text-meta tabular-nums text-muted">{due?.time ? formatTime(due.time) : t('Any time')}</span>
                  const estimate = task.estimate_minutes ? <span className="text-meta text-muted">{formatMinutes(task.estimate_minutes)}</span> : null
                  const done = task.completed_at ? 'text-muted line-through' : ''
                  return (
                    <li key={task.id} className={`${proposed ? 'rounded-control border border-dashed border-accent' : ''} ${edit?.dragging ? 'bg-sunken' : ''}`} data-agenda-item={task.id} data-proposed={proposed || undefined}>
                      {check ? (
                        <>
                          <div className="flex items-center">
                            {/* A proposed item is one label across the row: the whole row ticks its checkbox (touch targets); it drags to another day. */}
                            <label className={`flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 px-1.5 text-body hover:bg-hover ${edit?.onPointerDown ? 'select-none' : ''}`}
                              onPointerDown={edit?.onPointerDown} onKeyDown={edit?.onKeyDown} data-drag-id="proposal-calendar-item">
                              <input type="checkbox" className="h-4 w-4 shrink-0 accent-(--ot-accent)" checked={check.checked} aria-label={check.label} onChange={(e) => check.onChange(e.target.checked)} />
                              {time}
                              <span className={`min-w-0 flex-1 truncate user-text ${done}`}>{task.title}</span>
                              {estimate}
                              {edit?.mark
                                ? <span className="rounded-control border border-accent px-1 text-hint font-medium text-accent" data-turn-mark>{edit.mark}</span>
                                : <span className="inline-flex items-center gap-0.5 text-hint font-medium text-accent">{!edit && <Icon name="pencil" size="xs" />}{t('proposed')}</span>}
                            </label>
                            {edit && <IconButton icon="pencil" size="sm" className="touch-target text-muted" label={t('Edit {title}', { title: edit.title })} aria-expanded={edit.open} onClick={edit.onToggle} data-edit-item />}
                          </div>
                          {edit?.open && edit.editor}
                        </>
                      ) : (
                        <div className="flex min-h-9 items-center gap-2 text-body">
                          {time}
                          <button type="button" className={`min-h-9 min-w-0 flex-1 truncate text-left user-text hover:underline ${done}`} onClick={() => openTaskPanel(task.id)}>{task.title}</button>
                          {estimate}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function CalendarBlock({ block }: { block: Extract<AssistantBlock, { kind: 'calendar' }> }) {
  const days = blockDays(block.date, block.span)
  const tasks = useDatedTasks(days)
  const dayLength = useDayLength()
  if (!tasks) return null
  return <AgendaDays days={days} items={tasks.map((task) => ({ task }))} dayLength={dayLength} />
}
