// Time sectors in the weekly review's Look ahead step (OpenSpec change
// time-sectors, weekly-review "Time sectors in Look ahead"): open tasks whose
// sector is carried over and those of Next week, below the next seven days, each
// with Keep this week, Next week, This month and Date…. Every action is one batch
// with Undo; the list keys keep their meaning (n parks), as the rows are part of
// the step's keyboard list. Shown only while the switch is on and a task qualifies.
import type { ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { sectorWordName } from '../../lib/sectorNames'
import { isCarried, relativeName, resolvePhrase, type SectorWord } from '../../lib/sectors'
import type { Task } from '../../lib/types'
import { sectorUndoable } from '../../lib/undoActions'
import { Button } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'

/** The review's sector rows, carried over first, then Next week (none when the switch is off). */
export function sectorReviewTasks(tasks: readonly Task[], today: string, weekStart: number, on: boolean): { carried: Task[]; next: Task[] } {
  if (!on) return { carried: [], next: [] }
  const open = tasks.filter((task) => !task.completed_at && !task.deleted_at && !task.due && !!task.sector)
  return {
    carried: open.filter((task) => isCarried(task.sector!, today, weekStart)),
    next: open.filter((task) => relativeName(task.sector!, today, weekStart) === 'next-week'),
  }
}

const ACTIONS: { word: SectorWord; label: () => string }[] = [
  { word: 'this-week', label: () => t('Keep this week') },
  { word: 'next-week', label: () => sectorWordName('next-week') },
  { word: 'this-month', label: () => sectorWordName('this-month') },
]

export function SectorReview({ carried, next, today, weekStart, row, onDate }: {
  carried: Task[]
  next: Task[]
  today: string
  weekStart: number
  /** The step's ordinary task row for a task. */
  row: (task: Task) => ReactNode
  /** Date…: open the task to give it a do-on date. */
  onDate: (task: Task) => void
}) {
  if (!carried.length && !next.length) return null
  const move = async (task: Task, word: SectorWord) => {
    const r = await sectorUndoable([task.id], resolvePhrase(word, today, weekStart)!, sectorWordName(word))
    if (r.entry) showUndoToast(r.label, r.entry.id)
  }
  const group = (title: string, list: Task[], id: string) => list.length > 0 && (
    <section aria-label={title} data-review-sectors={id} className="mt-4">
      <h3 className="mb-1 text-meta font-semibold text-muted">{title}</h3>
      <ul className="-mx-2">
        {list.flatMap((task) => [
          row(task),
          <li key={`${task.id}:plan`} className="mb-1 ml-9 flex flex-wrap gap-1" role="group" aria-label={t('Plan {title}', { title: task.title || t('Untitled') })}>
            {ACTIONS.map((a) => (
              <Button key={a.word} size="sm" variant="ghost" data-sector-action={a.word} onClick={() => act(move(task, a.word))}>{a.label()}</Button>
            ))}
            <Button size="sm" variant="ghost" data-sector-action="date" onClick={() => onDate(task)}>{t('Date…')}</Button>
          </li>,
        ])}
      </ul>
    </section>
  )
  return (
    <div data-review-sector-section>
      {group(t('Carried over'), carried, 'carried')}
      {group(sectorWordName('next-week'), next, 'next-week')}
    </div>
  )
}
