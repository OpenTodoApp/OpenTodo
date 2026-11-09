// Deadlines in an answer (OpenSpec change assistant-time-blocks, spec "Deadlines
// block"): the open tasks with a deadline on the block's days, in date order, each
// with its countdown as task rows write it (describeDeadline, in its tone). A row
// opens its task. Read-only; lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useDeadlines } from '../../../lib/assistantBlockData'
import { describeDeadline, formatDate, localDueOf } from '../../../lib/dates'
import { t } from '../../../lib/i18n'
import { ToneText } from '../../../ui'
import { openTaskPanel } from '../../panel'
import { DEADLINE_TONE } from '../../rowTone'

/** The most rows a block lists; the rest are counted. */
const MAX_ROWS = 20

export default function DeadlinesBlock({ block }: { block: Extract<AssistantBlock, { kind: 'deadlines' }> }) {
  const tasks = useDeadlines(block)
  if (!tasks) return null
  if (!tasks.length) return <p className="p-3 text-meta text-muted" data-assistant-deadlines>{t('No deadlines on these days.')}</p>
  const more = tasks.length - MAX_ROWS
  return (
    <div data-assistant-deadlines>
      <ul className="divide-y divide-default">
        {tasks.slice(0, MAX_ROWS).map((task) => {
          const d = describeDeadline(task.deadline, undefined, task.due ? localDueOf(task.due).date : null)
          const date = formatDate(task.deadline!, 'long')
          return (
            <li key={task.id} data-deadline-task={task.id}>
              <button type="button" className="flex min-h-10 w-full items-center gap-3 px-3 text-left hover:bg-hover" onClick={() => openTaskPanel(task.id)}>
                <span className="min-w-0 flex-1 truncate text-body user-text">{task.title || t('Untitled')}</span>
                <span className="shrink-0 text-meta tabular-nums text-muted">{formatDate(task.deadline!, 'compact')}</span>
                {d && <ToneText tone={DEADLINE_TONE[d.tone]} icon="hourglass" className="shrink-0" data-deadline="" label={t('Deadline {date}, {label}', { date, label: d.label })}>{d.label}</ToneText>}
              </button>
            </li>
          )
        })}
      </ul>
      {more > 0 && <p className="border-t border-default px-3 py-2 text-meta text-muted">{t('{n, plural, one {# more deadline} other {# more deadlines}}', { n: more })}</p>}
    </div>
  )
}
