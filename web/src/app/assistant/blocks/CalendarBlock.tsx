// A day or a week in an answer (OpenSpec change assistant-generative-ui, spec
// "Calendar block", design D4): a compact agenda of each day, its heading with the
// day's planned total against the working day as the calendar counts it
// (`dayLoad`, `CapacityLine`), then its dated tasks in time order. No grid and no
// scroll region of its own; read-only, since a change to the plan is a proposal.
// Lazy chunk; the proposal's calendar shape draws the same agenda.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useDatedTasks, useDayLength } from '../../../lib/assistantBlockData'
import { dayLoad } from '../../../lib/calendar'
import { addDaysISO, formatDate, formatTime, localDueOf } from '../../../lib/dates'
import { formatMinutes } from '../../../lib/duration'
import { t } from '../../../lib/i18n'
import type { Task } from '../../../lib/types'
import { Icon } from '../../../ui'
import { CapacityLine } from '../../calendar/CapacityLine'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

/** The days of a block: one, or seven from the given one. */
export const blockDays = (date: string, span: 'day' | 'week'): string[] => Array.from({ length: span === 'day' ? 1 : 7 }, (_, i) => addDaysISO(date, i))

export interface AgendaItem {
  task: Task
  /** Proposed, not applied (the proposal's calendar shape). */
  proposed?: boolean
}

/** A task placed on its local day: its date and time. */
const placed = (tk: Task) => localDueOf(tk.due)

/** The agenda of each day: heading, total, and the items in time order (untimed first). */
export function AgendaDays({ days, items, dayLength }: { days: readonly string[]; items: readonly AgendaItem[]; dayLength: number }) {
  return (
    <ol className="divide-y divide-default" data-assistant-agenda>
      {days.map((day) => {
        const own = items.filter((it) => placed(it.task)?.date === day)
          .sort((a, b) => (placed(a.task)?.time ?? '').localeCompare(placed(b.task)?.time ?? '') || a.task.title.localeCompare(b.task.title))
        const load = dayLoad(own.map((it) => ({ ...it.task, due: placed(it.task) })), day, dayLength)
        return (
          <li key={day} className="px-3 py-2" data-agenda-day={day}>
            <div className="flex items-center gap-2">
              <button type="button" className="text-body font-semibold hover:underline" onClick={() => navigate({ view: 'day', date: day })}>{formatDate(day, 'long')}</button>
              <CapacityLine load={load} dayLength={dayLength} unestimated className="ml-auto" />
            </div>
            {own.length === 0 ? <p className="text-meta text-faint">{t('Nothing planned')}</p> : (
              <ul className="mt-1 space-y-0.5">
                {own.map(({ task, proposed }) => {
                  const due = placed(task)
                  return (
                    <li key={task.id} className={`flex items-baseline gap-2 text-body ${proposed ? 'rounded-control border border-dashed border-accent px-1.5' : ''}`} data-agenda-item={task.id} data-proposed={proposed || undefined}>
                      <span className="w-14 shrink-0 text-meta tabular-nums text-muted">{due?.time ? formatTime(due.time) : t('Any time')}</span>
                      <button type="button" className={`min-w-0 flex-1 truncate text-left user-text hover:underline ${task.completed_at ? 'text-muted line-through' : ''}`} onClick={() => openTaskPanel(task.id)}>{task.title}</button>
                      {task.estimate_minutes ? <span className="text-meta text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
                      {proposed && <span className="inline-flex items-center gap-0.5 text-hint font-medium text-accent"><Icon name="pencil" size="xs" />{t('proposed')}</span>}
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
