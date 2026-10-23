// Carry over, one task at a time (OpenSpec change close-the-day-v2, design D2): a
// card with the whole title, the project and why the task is in Today, the five
// decisions with their keys, and below it the decisions so far, each line bringing
// its task back to the card. Nothing here completes or moves a task: the decisions
// are written as one batch when the user moves on from the step (D3).
import { localDueOf } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { CarryDecision, CarryTask } from '../../lib/review'
import type { Project } from '../../lib/types'
import { Button, Tooltip } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

type Kind = CarryDecision['kind']

const CHOICES: { kind: Kind; key: string; label: () => string }[] = [
  { kind: 'tomorrow', key: 't', label: () => t('Tomorrow') },
  { kind: 'day', key: 'p', label: () => t('Pick a day') },
  { kind: 'someday', key: 'y', label: () => t('Someday') },
  { kind: 'keep', key: 'h', label: () => t('Keep in Today') },
  { kind: 'done', key: 'd', label: () => t('Done already') },
]

/** The decision's name as the list shows it ("Friday 16 October" for a picked day). */
function useDecisionName() {
  const dt = useDateTimeFormat()
  return (d: CarryDecision) => (d.kind === 'day' ? dt.formatDate(d.date, 'long') : CHOICES.find((c) => c.kind === d.kind)!.label())
}

/** Why the task is in Today on the day being closed: due that day, open since an earlier day, or started. */
function useReason() {
  const dt = useDateTimeFormat()
  return (x: CarryTask, day: string) => {
    const due = x.task.due ? localDueOf(x.task.due) : null
    if (due && due.date === day) return due.time ? t('Due today at {time}', { time: dt.formatTime(due.time) }) : t('Due today')
    if (due && due.date < day) return t('Open since {date}', { date: dt.formatDate(due.date, 'long') })
    return t('In Today since its start date')
  }
}

/** The card for one task, and its decisions. A task the user may not edit offers Keep only, with the reason. */
export function CarryCard({ row, position, total, day, project, decision, onDecide }: {
  row: CarryTask
  position: number
  total: number
  day: string
  project?: Project
  decision: CarryDecision
  onDecide: (x: CarryTask, kind: Kind) => void
}) {
  const reason = useReason()
  const choices = row.editable ? CHOICES : CHOICES.filter((c) => c.kind === 'keep')
  return (
    <section aria-label={t('Task {n} of {total}', { n: position, total })} data-carry-card={row.task.id}
      className="rounded-card border border-default bg-surface p-4 shadow-1 sm:p-5">
      <p className="text-hint font-semibold uppercase tracking-wide text-faint tabular-nums" data-carry-position>{t('{n} of {total}', { n: position, total })}</p>
      <h3 className="user-text mt-1 text-h2 font-semibold text-strong break-words" data-carry-title>{row.task.title || t('Untitled')}</h3>
      <p className="mt-1 flex flex-wrap gap-x-2 text-meta text-muted">
        {project && <span>{project.name}</span>}
        {project && <span aria-hidden="true">·</span>}
        <span data-carry-reason>{reason(row, day)}</span>
      </p>
      {!row.editable && <p className="mt-2 text-meta text-faint">{t('You can only view tasks in this shared project, so it stays in Today.')}</p>}
      <div role="toolbar" aria-label={t('What happens to {title}', { title: row.task.title })} className="mt-4 flex flex-wrap gap-2" data-carry-decision={decision.kind}>
        {choices.map((c) => (
          <Button key={c.kind} size="sm" variant={c.kind === decision.kind ? 'primary' : 'secondary'} aria-pressed={c.kind === decision.kind}
            aria-keyshortcuts={c.key} onClick={() => onDecide(row, c.kind)} data-carry-choice={c.kind}>
            {c.label()} <span className="ui-kbd ml-1">{c.key}</span>
          </Button>
        ))}
      </div>
    </section>
  )
}

/** The decisions so far: one line per task; activating a line brings its task back to the card. */
export function CarryList({ rows, current, decisionOf, onShow }: {
  rows: CarryTask[]
  current: string | null
  decisionOf: (x: CarryTask) => CarryDecision
  onShow: (id: string) => void
}) {
  const name = useDecisionName()
  return (
    <ul className="mt-4 divide-y divide-default rounded-card border border-default" aria-label={t('Decisions so far')} data-carry-summary>
      {rows.map((x) => {
        const d = decisionOf(x)
        return (
          <li key={x.task.id} data-carry-line={x.task.id}>
            {/* The whole title is the button's text (its accessible name); the line only cuts it visually, and the tooltip shows it. */}
            <Tooltip label={x.task.title || t('Untitled')} side="top">
              <button type="button" onClick={() => onShow(x.task.id)} aria-current={x.task.id === current ? 'true' : undefined}
                className={`flex w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus ${x.task.id === current ? 'bg-accent-soft/40' : ''}`}>
                <span className="user-text min-w-0 flex-1 truncate text-body">{x.task.title || t('Untitled')}</span>
                <span className="shrink-0 text-meta text-muted" data-carry-line-decision={d.kind}>{name(d)}</span>
              </button>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}
