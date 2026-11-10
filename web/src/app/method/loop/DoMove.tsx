// The Do move in place (loop-guided-dashboard D4): today's focus from the Daily check
// with how many of the chosen tasks are done (or the offer to pick them), then the
// next actions by context, up to five each, and Next.
import { t } from '../../../lib/i18n'
import type { Task } from '../../../lib/types'
import { Button } from '../../../ui'
import { requestFocusPick } from '../../focus/focusRequest'
import { navigate } from '../../router'
import type { MoveProps } from '../LoopHome'
import { GroupHeading, Rows } from './rows'

const PER_CONTEXT = 5

/** Today's focus, with its progress ring. */
function Focus({ tasks, room }: { tasks: Task[]; room: boolean }) {
  const done = tasks.filter((x) => x.completed_at).length
  const r = 7
  const c = 2 * Math.PI * r
  const add = room && <Button size="sm" variant="ghost" icon="plus" className="mt-1 ml-1" data-focus-add onClick={() => requestFocusPick({ mode: 'task', slot: null })}>{t('Add to focus')}</Button>
  return (
    <section aria-labelledby="loop-focus" data-loop-focus>
      <GroupHeading id="loop-focus" end={tasks.length > 0 && (
        <span className="flex items-center gap-1.5 text-meta tabular-nums text-muted" data-loop-focus-progress>
          <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 -rotate-90">
            <circle cx="9" cy="9" r={r} fill="none" strokeWidth="3" className="stroke-(--ot-border)" />
            <circle cx="9" cy="9" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-(--ot-accent) transition-[stroke-dashoffset] duration-(--duration-emphasis) ease-calm"
              strokeDasharray={c} strokeDashoffset={c * (1 - done / tasks.length)} />
          </svg>
          {t('{done} of {total} done', { done, total: tasks.length })}
        </span>
      )}>{t('Today’s focus')}</GroupHeading>
      {tasks.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-2 py-1 text-body text-faint">
          <span>{t('No focus chosen today.')}</span>
          <Button size="sm" onClick={() => navigate({ view: 'review', step: 'daily' })}>{t('Pick up to three in the Daily check')}</Button>
          {add}
        </div>
      ) : (
        <>
          <Rows tasks={tasks} />
          {add}
        </>
      )}
    </section>
  )
}

export default function DoMove({ data }: MoveProps) {
  return (
    <div data-loop-part="do">
      <Focus tasks={data.focus} room={data.room} />
      {data.contexts.map((g) => (
        <section key={g.key} className="mt-6" aria-labelledby={`loop-context-${g.key}`} data-loop-context={g.key}>
          <GroupHeading id={`loop-context-${g.key}`} end={g.tasks.length > PER_CONTEXT && <span className="text-meta tabular-nums text-faint">{g.tasks.length}</span>}>{g.heading}</GroupHeading>
          <Rows tasks={g.tasks.slice(0, PER_CONTEXT)} />
        </section>
      ))}
      <Button size="sm" variant="ghost" iconEnd="arrow-right" className="mt-3" onClick={() => navigate({ view: 'next' })}>{t('Open Next')}</Button>
    </div>
  )
}
