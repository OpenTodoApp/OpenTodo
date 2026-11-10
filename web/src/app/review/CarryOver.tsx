// What moves (OpenSpec change close-the-day-redesign, design D3): every unfinished
// task of the day on one list, a row each with its title, its project and why it is
// in Today, and a three-way choice: Tomorrow (the default), Later (a day from the
// date dialog, which the row then shows) and Someday. The row's menu holds Keep in
// Today and Done already. A row the user may not edit keeps its place. Nothing here
// writes: the decisions are device state until the day is closed (D5).
import { localDueOf } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { decisionOf, type CarryDecision, type CarryTask } from '../../lib/closeDay'
import type { Project } from '../../lib/types'
import { Icon, Menu, MenuItem, SegmentedControl, TruncatedText } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

export type Kind = CarryDecision['kind']
type Choice = 'tomorrow' | 'day' | 'someday'

/** Why the task is in Today on the day being closed: due that day, open since an earlier day, or started. */
function useReason() {
  const dt = useDateTimeFormat()
  return (x: CarryTask, day: string) => {
    const due = x.task.due ? localDueOf(x.task.due) : null
    if (due && due.date === day) return due.time ? t('Due today at {time}', { time: dt.formatTime(due.time) }) : t('Due today')
    if (due && due.date < day) return t('Open since {date}', { date: dt.formatDate(due.date, 'compact') })
    return t('Started')
  }
}

export function MovesList({ rows, day, decisions, projects, cursor, onCursor, onChoose, onMenu }: {
  rows: CarryTask[]
  day: string
  decisions: ReadonlyMap<string, CarryDecision>
  projects: ReadonlyMap<string, Project>
  /** The row the keys act on. */
  cursor: string | null
  onCursor: (id: string) => void
  onChoose: (x: CarryTask, kind: Kind) => void
  /** A row menu opened or closed (the screen's keys pause meanwhile). */
  onMenu: (open: boolean) => void
}) {
  const reason = useReason()
  const dt = useDateTimeFormat()
  const choices: { id: Choice; label: string }[] = [
    { id: 'tomorrow', label: t('Tomorrow') },
    { id: 'day', label: t('Later') },
    { id: 'someday', label: t('Someday') },
  ]
  return (
    <ul className="-mx-2 sm:-mx-3" aria-label={t('What moves')} data-carry-list>
      {rows.map((x) => {
        const d = decisionOf(decisions, x)
        const project = x.task.project_id ? projects.get(x.task.project_id) : undefined
        const current = x.task.id === cursor
        const title = x.task.title || t('Untitled')
        return (
          <li key={x.task.id} data-carry-row={x.task.id} data-carry-decision={d.kind} aria-current={current ? 'true' : undefined}
            onClick={() => onCursor(x.task.id)} onFocusCapture={() => onCursor(x.task.id)}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control px-2 py-2.5 transition-colors duration-(--duration-ui) sm:flex-nowrap sm:px-3 ${current ? 'bg-selected-row' : ''}`}>
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <TruncatedText as="p" text={title} className={`user-text block text-body ${d.kind === 'done' ? 'text-muted line-through decoration-faint' : 'text-strong'}`} data-carry-title="" />
              <p className="flex min-w-0 flex-wrap gap-x-1.5 text-meta text-muted">
                {project && <span className="truncate">{project.name}</span>}
                {project && <span aria-hidden="true">·</span>}
                <span data-carry-reason>{reason(x, day)}</span>
                {d.kind === 'day' && <>
                  <span aria-hidden="true">·</span>
                  <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => onChoose(x, 'day')} data-carry-day>
                    {t('Moves to {date}', { date: dt.formatDate(d.date, 'compact') })}
                  </button>
                </>}
                {d.kind === 'keep' && x.editable && <><span aria-hidden="true">·</span><span className="text-default" data-carry-note>{t('Stays in Today')}</span></>}
                {d.kind === 'done' && <><span aria-hidden="true">·</span><span className="text-default" data-carry-note>{t('Done already')}</span></>}
              </p>
            </div>
            {x.editable ? (
              <div className="flex shrink-0 items-center gap-1">
                <SegmentedControl<Choice> options={choices} label={t('What happens to {title}', { title })} data-carry-choices
                  value={d.kind === 'tomorrow' || d.kind === 'day' || d.kind === 'someday' ? d.kind : ('' as Choice)}
                  onChange={(c) => onChoose(x, c)} />
                <Menu kind="menu" label={t('More for {title}', { title })} trigger={<Icon name="ellipsis" />} onOpenChange={onMenu}
                  triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon touch-target" triggerProps={{ 'data-carry-menu': x.task.id }}>
                  <MenuItem label={t('Keep in Today')} shortcut="h" checked={d.kind === 'keep'} onSelect={() => onChoose(x, 'keep')} data-carry-choice="keep" />
                  <MenuItem label={t('Done already')} shortcut="d" checked={d.kind === 'done'} onSelect={() => onChoose(x, 'done')} data-carry-choice="done" />
                </Menu>
              </div>
            ) : (
              <p className="shrink-0 text-meta text-faint" data-carry-readonly>{t('Keeps its place')}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
