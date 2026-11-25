// The task page on a phone, as a drawing (OpenSpec change phone-ui-trial, "Phone
// task page"): the title and the note first, because that is the task; then what
// the task has, as cards of rows; then what it could have, as buttons. Everything
// comes in as props, so the screen (fed by the hooks the desktop page runs on) and
// the stories draw the same thing.
import type { ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { Icon, IconButton } from '../../ui'
import { FactCard, FactChips, FactRow, type FactAnchor, type FactModel } from '../components/FactRow'
import { PhoneHeader } from '../components/PhoneHeader'

export interface PhoneTaskViewProps {
  /** The title: the screen passes its field, a story a heading. */
  title: ReactNode
  done: boolean
  priority: 1 | 2 | 3 | 4
  /** A task the person may not change: the check is off. */
  readOnly?: boolean
  /** The list the task was opened from ("Today"); without one, Back alone. */
  backLabel: string
  /** "2 of 6", or empty when the task was not opened from a list. */
  position?: string
  hasPrev: boolean
  hasNext: boolean
  /** The facts the task has, in cards: when, then where and what. */
  schedule: FactModel[]
  details: FactModel[]
  /** The facts it does not have. */
  unset: Pick<FactModel, 'id' | 'label' | 'icon'>[]
  /** The fact whose sheet is open. */
  openFact?: string | null
  factAnchor?: FactAnchor
  /** Lines above the title (a reader's note, the sample notice). */
  notice?: ReactNode
  /** Under the title: the parent and the repeating task it belongs to. */
  relations?: ReactNode
  notes: ReactNode
  /** Between the cards and the buttons: the labels, a rotation's line. */
  extra?: ReactNode
  /** Subtasks, custom fields, attachments and the conversation, drawn by the screen. */
  rest?: ReactNode
  menu?: ReactNode
  onBack: () => void
  onStep: (step: 1 | -1) => void
  onToggle: () => void
  onFact: (id: string) => void
}

const RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-input' }

export function PhoneTaskView(p: PhoneTaskViewProps) {
  const stepper = !!p.position
  return (
    <div data-phone-screen="task" className="min-h-full bg-canvas">
      <PhoneHeader shown title={p.position}
        lead={(
          <button type="button" onClick={p.onBack} aria-label={p.backLabel ? undefined : t('Back to the list')} data-page-back
            className="flex min-h-11 min-w-11 items-center gap-0.5 rounded-control pl-1 pr-2 text-prose text-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
            <Icon name="chevron-left" size="md" /><span className="max-w-[8rem] truncate">{p.backLabel}</span>
          </button>
        )}
        trailing={<>
          {stepper && <IconButton icon="arrow-up" label={t('Previous task')} disabled={!p.hasPrev} onClick={() => p.onStep(-1)} className="touch-target" data-task-prev />}
          {stepper && <IconButton icon="arrow-down" label={t('Next task')} disabled={!p.hasNext} onClick={() => p.onStep(1)} className="touch-target" data-task-next />}
          {p.menu}
        </>} />

      <div className="flex flex-col gap-5 px-4 pb-8 pt-3">
        {p.notice}
        <div className="flex items-start gap-1">
          <button type="button" aria-pressed={p.done} disabled={p.readOnly} aria-label={p.done ? t('Reopen task') : t('Complete task')} onClick={p.onToggle} data-phone-check
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus">
            <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${p.done ? 'border-transparent bg-faint text-on-accent' : RING[p.priority]}`}>
              {p.done && <Icon name="check" size="sm" />}
            </span>
          </button>
          <div className="min-w-0 flex-1 pt-1.5">
            {p.title}
            {p.relations}
            <div className="mt-2 text-prose text-default" data-phone-notes>{p.notes}</div>
          </div>
        </div>

        {p.schedule.length > 0 && (
          <FactCard label={t('Schedule')}>{p.schedule.map((f) => <FactRow key={f.id} fact={f} open={p.openFact === f.id} anchor={p.factAnchor} onOpen={p.onFact} />)}</FactCard>
        )}
        {p.details.length > 0 && (
          <FactCard label={t('Details')}>{p.details.map((f) => <FactRow key={f.id} fact={f} open={p.openFact === f.id} anchor={p.factAnchor} onOpen={p.onFact} />)}</FactCard>
        )}
        {p.extra}
        {!p.readOnly && <FactChips label={t('Add')} facts={p.unset} open={p.openFact} anchor={p.factAnchor} onOpen={p.onFact} />}
        {p.rest}
      </div>
    </div>
  )
}
